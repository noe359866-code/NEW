'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../addon/server');
const { isSportsName, parseTvHome, parseDaddyList, parseOnDemand, resolveEntry, SportsCatalog } = require('../sports/sources');
const { decodeEconfig, extractMedia, sourceFromEmbed, resolvePages } = require('../sports/extract');
const { safeUrl, mediaUrl, publicAddress, publicLookup } = require('../sports/http');
const { getDocument: getPage } = require('../addon/documents');
const dns = require('node:dns');
const https = require('node:https');
const { EventEmitter } = require('node:events');

// Fixtures sintéticos que siguen los formatos observados; no son pruebas en vivo.
const TV_HOME = `<html><a href="/espn-2-en-vivo-online.php"><img src="/imge/espn2.webp" alt="ESPN 2">EN VIVO 17 ESPN 2</a>
<a href="/tudn-en-vivo-online.php"><img alt="TUDN">TUDN</a>
<a href="/cnn-en-vivo-online.php"><img alt="CNN">CNN</a></html>`;
const DADDY_LIST = `<html>
<a class="card" href="/watch.php?id=44" data-title="espn usa"><div class="card__title">ESPN USA</div><div>ID: 44</div></a>
<a class="card" href="/watch.php?id=303" data-title="amc usa"><div class="card__title">AMC USA</div></a>
<a class="card" href="/watch.php?id=61"><div class="card__title">beIN Sports 1</div></a>
</html>`;
const embedHls = 'https://damitv.st/player/hls/?v=542&url=' + encodeURIComponent('https://messi.damitv.st/c/abc.m3u8?sig=123') + '&name=ESPN';
const ONDEMAND = { success: true, streams: [
  { category: 'football', streams: [
    { id: 'match-1', name: 'Equipo A vs Equipo B', category_name: 'football', status: 'live', league: 'Liga', sources: [{ name: 'ESPN', source: 'hls', hd: 1, embed: embedHls }] },
    { id: 'match-2', name: 'Evento futuro', category_name: 'football', status: 'upcoming', sources: [{ name: 'x', embed: embedHls }] }
  ] },
  { category: '24/7-streams', streams: [
    { id: '247-nfl-network', name: 'NFL Network', category_name: '24/7-streams', status: 'live', always_live: 1, sources: [{ name: 'NFL', embed: embedHls }] },
    { id: '247-hbo', name: 'HBO Movies', category_name: '24/7-streams', status: 'live', always_live: 1, sources: [{ name: 'HBO', embed: embedHls }] }
  ] },
  { category: 'tv-shows', streams: [{ id: 'entertainment', name: 'Comedy Show', status: 'live', sources: [{ name: 'x', embed: embedHls }] }] }
] };

function makeEconfig(config) {
  const encoded = Buffer.from(JSON.stringify(config)).toString('base64');
  const len = encoded.length / 4;
  assert.equal(Number.isInteger(len), true);
  const parts = [0, 1, 2, 3].map(i => encoded.slice(i * len, (i + 1) * len));
  const raw = [2, 0, 3, 1].map(i => {
    const s = Buffer.from(parts[i]).toString('base64');
    return s.slice(0, 3) + 'X' + s.slice(3);
  }).join('');
  return Buffer.from(raw).toString('base64');
}

function makeGet() {
  const calls = [];
  const cfg = makeEconfig({ stream_url: 'https://edge.example/live/stream.m3u8?sig=1' });
  const routes = {
    'https://www.tvenvivo.org/': TV_HOME,
    'https://thedaddy.li/24-7-channels.php': DADDY_LIST,
    'https://ondemand.st/papi/api/streams': JSON.stringify(ONDEMAND),
    'https://www.tvenvivo.org/espn-2-en-vivo-online.php': '<iframe src="https://embed.ksdjugfssddeports.com/espn2"></iframe>',
    'https://embed.ksdjugfssddeports.com/espn2': '<script>var src="https:\\/\\/tv-cdn.example\\/espn.m3u8?sig=x\\u0026a=1"</script>',
    'https://thedaddy.li/watch.php?id=44': '<iframe src="/stream/stream-44.php"></iframe>',
    'https://thedaddy.li/stream/stream-44.php': '<iframe src="https://waterera.net/e/abc123"></iframe>',
    'https://waterera.net/e/abc123': `<script>window._econfig="${cfg}";</script>`
  };
  const get = async (url, options = {}) => {
    calls.push({ url, options });
    if (!(url in routes)) throw new Error('404');
    return { url, text: routes[url] };
  };
  get.calls = calls;
  return get;
}

test('los tres catálogos excluyen entretenimiento y eventos futuros', () => {
  assert.equal(isSportsName('ESPN 2'), true);
  assert.equal(isSportsName('Liga 1 Max'), true);
  assert.equal(isSportsName('ABC USA'), false);
  assert.equal(isSportsName('beIN Movies'), false);
  assert.equal(isSportsName('TSN2'), true);
  assert.deepEqual(parseTvHome(TV_HOME).map(x => x.name), ['ESPN 2', 'TUDN']);
  assert.deepEqual(parseDaddyList(DADDY_LIST).map(x => x.name), ['ESPN USA', 'beIN Sports 1']);
  assert.deepEqual(parseOnDemand(ONDEMAND).map(x => x.name), ['Equipo A vs Equipo B', 'NFL Network']);
});

test('OnDemand entrega el HLS del parámetro del player, no la página de embed', () => {
  const result = sourceFromEmbed(embedHls);
  assert.equal(result.url, 'https://messi.damitv.st/c/abc.m3u8?sig=123');
  assert.equal(result.headers.Referer, 'https://damitv.st/');
  assert.equal(sourceFromEmbed('https://damitv.st/embed/?id=match-1'), null);
  assert.equal(sourceFromEmbed('https://otro.example/player/hls/?url=https://cdn.example/a.m3u8'), null);
  assert.equal(sourceFromEmbed('ftp://damitv.st/player/hls/?url=https://cdn.example/a.m3u8'), null);
  assert.equal(sourceFromEmbed('https://name:password@damitv.st/player/hls/?url=https://cdn.example/a.m3u8'), null);
});

test('TVEnVivo sigue página e iframe y devuelve HLS sin solicitarlo', async () => {
  const get = makeGet();
  const entry = parseTvHome(TV_HOME)[0];
  const streams = await resolveEntry(entry, get);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://tv-cdn.example/espn.m3u8?sig=x&a=1');
  assert.equal(streams[0].headers.Referer, 'https://embed.ksdjugfssddeports.com/');
  assert.ok(!get.calls.some(call => /\.m3u8/.test(new URL(call.url).pathname)));
});

test('TVEnVivo usa canal= publicado en la ficha, no el slug supuesto', async () => {
  const calls = [];
  const pages = {
    'https://www.tvenvivo.org/espn-2-en-vivo-online.php': '<script>const SOURCES = ["/live/core.php?canal=espn2"]</script>',
    'https://www.tvenvivo.org/live/core.php?canal=espn2': '<iframe src="https://player.example/stream.php?sig=abc&amp;v=1"></iframe>',
    'https://player.example/stream.php?sig=abc&v=1': '<script>var src="https://cdn.example/playlist/3/index.m3u8?token=abc"</script>'
  };
  const get = async url => {
    calls.push(url);
    if (!(url in pages)) throw new Error('No encontrado');
    return { url, text: pages[url] };
  };
  const streams = await resolveEntry(parseTvHome(TV_HOME)[0], get);
  assert.equal(streams[0].url, 'https://cdn.example/playlist/3/index.m3u8?token=abc');
  assert.deepEqual(calls, Object.keys(pages));
});

test('el extractor no confunde una portada redirigida ni solicita medios HTTP', async () => {
  const calls = [];
  const get = async url => {
    calls.push(url);
    if (url.endsWith('/fallo')) return { url: 'https://source.example/', text: '<source src="https://cdn.example/other.m3u8">' };
    if (url.endsWith('/canal')) return { url, text: '<iframe src="http://cdn.example/live.m3u8"></iframe>' };
    throw new Error('No debe solicitarse un medio');
  };
  const sources = await resolvePages([
    { url: 'https://source.example/fallo', referer: 'https://source.example/' },
    { url: 'https://source.example/canal', referer: 'https://source.example/' }
  ], get);
  assert.deepEqual(sources.map(source => source.url), ['http://cdn.example/live.m3u8']);
  assert.equal(calls.length, 2);
  assert.deepEqual(extractMedia('<script>"foo|https://cdn.example/falso.m3u8"</script>', 'https://source.example/'), []);
});

test('TheDaddy: decodifica _econfig de un iframe y no descarga el vídeo', async () => {
  const config = makeEconfig({ stream_url: 'https://edge.example/live/stream.m3u8?sig=1' });
  assert.equal(decodeEconfig(`window._econfig="${config}"`).stream_url, 'https://edge.example/live/stream.m3u8?sig=1');
  const get = makeGet();
  const entry = parseDaddyList(DADDY_LIST)[0];
  const streams = await resolveEntry(entry, get);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://edge.example/live/stream.m3u8?sig=1');
  assert.equal(streams[0].headers.Referer, 'https://waterera.net/');
  assert.ok(!get.calls.some(call => /\.m3u8/.test(new URL(call.url).pathname)));
});

test('cache por fuente: una caída no bloquea las demás ni repite peticiones concurrentes', async () => {
  const get = makeGet();
  let now = 1000;
  const catalog = new SportsCatalog({ get, now: () => now, ttl: 60000 });
  await Promise.all([catalog.one('ondemand'), catalog.one('ondemand')]);
  assert.equal(get.calls.filter(call => call.url.includes('/papi/api/streams')).length, 1);
  const all = await catalog.all();
  assert.equal(all.length, 6);
  now += 60001;
  await catalog.one('ondemand');
  assert.equal(get.calls.filter(call => call.url.includes('/papi/api/streams')).length, 2);

  const failing = async (url, options) => {
    if (url.includes('thedaddy.li')) throw new Error('Origen caído');
    return get(url, options);
  };
  const partiallyAvailable = new SportsCatalog({ get: failing });
  assert.equal((await partiallyAvailable.all()).length, 4);
  assert.deepEqual(await partiallyAvailable.one('thedaddy'), []);
});

test('red: bloquea destinos locales y no descarga una URL de medio', async () => {
  assert.equal(publicAddress('127.0.0.1'), false);
  assert.equal(publicAddress('192.168.1.2'), false);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.equal(safeUrl('http://127.0.0.1/private'), null);
  assert.equal(safeUrl('https://localhost/private'), null);
  assert.equal(safeUrl('https://localhost.localdomain/private'), null);
  assert.equal(safeUrl('https://[::1]/private'), null);
  assert.equal(safeUrl('https://user:pass@public.example/private'), null);
  assert.equal(safeUrl('https://public.example:8443/page', undefined, { page: true }), null);
  assert.equal(mediaUrl('https://public.example/page?url=https://elsewhere.example/a.m3u8'), null);
  const page = await getPage('https://public.example/live/playlist.m3u8');
  assert.equal(page.redirectMedia, 'https://public.example/live/playlist.m3u8');
  assert.equal((await getPage('http://public.example/live/playlist.m3u8')).redirectMedia, 'http://public.example/live/playlist.m3u8');
});

test('addon: manifest, catálogo, búsqueda, meta y stream; no existe endpoint de proxy', async () => {
  const get = makeGet();
  const server = createServer({ get });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const request = async path => {
      const res = await fetch(base + path);
      return { status: res.status, body: await res.json() };
    };
    const manifest = (await request('/manifest.json')).body;
    assert.deepEqual(manifest.resources.map(r => r.name), ['catalog', 'meta', 'stream']);
    assert.deepEqual(manifest.types, ['movie', 'series', 'tv', 'anime', 'channel']);
    assert.equal(manifest.catalogs.length, 8);

    const all = (await request('/catalog/channel/nuvio-deportes.json')).body.metas;
    assert.equal(all.length, 6);
    assert.ok(all.every(x => x.type === 'channel' && x.genres.includes('Deportes')));
    assert.ok(!all.some(x => /CNN|AMC|HBO|futuro/.test(x.name)));
    const stremio = (await request('/catalog/tv/deportes.json')).body.metas;
    assert.deepEqual(stremio.map(x => x.id), all.map(x => x.id));
    assert.ok(stremio.every(x => x.type === 'tv'));
    const espn = (await request('/catalog/channel/nuvio-deportes/search=ESPN.json')).body.metas;
    assert.equal(espn.length, 2);
    assert.equal((await request('/catalog/tv/tvenvivo/skip=1.json')).body.metas.length, 1);
    assert.equal((await request('/catalog/channel/deportes.json')).status, 404);

    const id = 'nebula-sport:ondemand:match-1';
    const meta = (await request('/meta/channel/' + encodeURIComponent(id) + '.json')).body.meta;
    assert.equal(meta.name, 'Equipo A vs Equipo B');
    assert.equal(meta.type, 'channel');
    assert.equal((await request('/meta/tv/' + encodeURIComponent(id) + '.json')).body.meta.type, 'tv');
    const streams = (await request('/stream/channel/' + encodeURIComponent(id) + '.json')).body.streams;
    assert.equal(streams[0].url, 'https://messi.damitv.st/c/abc.m3u8?sig=123');
    assert.equal(streams[0].behaviorHints.proxyHeaders.request.Referer, 'https://damitv.st/');
    assert.equal(streams[0].behaviorHints.notWebReady, undefined);
    assert.ok(get.calls.filter(call => call.url.includes('/papi/api/streams')).length >= 2, 'renueva la API al reproducir');

    const tv = (await request('/stream/tv/' + encodeURIComponent('nebula-sport:tvenvivo:espn-2') + '.json')).body.streams;
    assert.equal(tv[0].url, 'https://tv-cdn.example/espn.m3u8?sig=x&a=1');
    const unknown = (await request('/stream/tv/' + encodeURIComponent('nebula-sport:thedaddy:303') + '.json')).body.streams;
    assert.deepEqual(unknown, []);
    assert.equal((await request('/proxy?url=https://example.org/video.m3u8')).status, 404);
    assert.ok(!get.calls.some(call => /\.(?:m3u8|mp4)$/.test(new URL(call.url).pathname)));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('DNS: rechaza respuestas mixtas con IP privada antes de abrir el socket', async t => {
  t.mock.method(dns, 'lookup', (hostname, options, callback) => {
    assert.deepEqual(options, { family: 4, all: true });
    const records = hostname === 'mixed.example'
      ? [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]
      : [{ address: '8.8.8.8', family: 4 }];
    callback(null, records);
  });
  await assert.rejects(new Promise((resolve, reject) => publicLookup('mixed.example', {}, (error, address) => error ? reject(error) : resolve(address))), /no público/);
  assert.equal(await new Promise((resolve, reject) => publicLookup('good.example', {}, (error, address) => error ? reject(error) : resolve(address))), '8.8.8.8');
});

test('HTTP: corta redirecciones a medios, IP privadas y cuerpos que no son documentos', async t => {
  const requests = [];
  const destroyed = [];
  t.mock.method(https, 'get', (url, options, callback) => {
    requests.push(url);
    assert.equal(options.lookup, publicLookup);
    const req = new EventEmitter();
    req.destroy = error => { if (error) process.nextTick(() => req.emit('error', error)); req.emit('close'); };
    process.nextTick(() => {
      const res = new EventEmitter();
      if (url.endsWith('/redirect')) {
        res.statusCode = 302; res.headers = { location: 'https://cdn.example/signal.m3u8?token=abc' };
      } else if (url.endsWith('/internal')) {
        res.statusCode = 302; res.headers = { location: 'https://127.0.0.1/secret' };
      } else {
        res.statusCode = 200; res.headers = { 'content-type': 'application/vnd.apple.mpegurl' };
      }
      res.destroy = () => { destroyed.push(url); req.emit('close'); };
      callback(res);
    });
    return req;
  });
  const result = await getPage('https://site.example/redirect');
  assert.equal(result.redirectMedia, 'https://cdn.example/signal.m3u8?token=abc');
  await assert.rejects(getPage('https://site.example/internal'), /Redirección no permitida/);
  await assert.rejects(getPage('https://site.example/no-extension'), /no es HTML\/JSON/);
  assert.deepEqual(requests, ['https://site.example/redirect', 'https://site.example/internal', 'https://site.example/no-extension']);
  assert.deepEqual(destroyed, requests);
});

test('deportes descarta anuncios identificables sin descargarlos como vídeo', async () => {
  assert.deepEqual(extractMedia(`<source src="https://ads.example/spot.mp4">
    <source src="https://cdn.example/publicidad/spot.mp4">
    <source src="https://cdn.example/live.m3u8">`, 'https://source.example/'), ['https://cdn.example/live.m3u8']);
  const adEmbed = 'https://damitv.st/player/hls/?url=' + encodeURIComponent('https://ads.example/spot.mp4');
  assert.equal(sourceFromEmbed(adEmbed), null);
  const calls = [];
  const get = async url => {
    calls.push(url);
    return { url, redirectMedia: 'https://cdn.example/trailer.mp4' };
  };
  const result = await resolvePages([
    { url: 'https://ads.example/embed.html' },
    { url: 'https://cdn.example/ads/spot.mp4' },
    { url: 'https://source.example/player' }
  ], get);
  assert.deepEqual(result, []);
  assert.deepEqual(calls, ['https://source.example/player']);
});
