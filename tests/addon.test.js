'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createServer } = require('../addon/server');
const { PROVIDERS, REQUEST_BUDGET, PROVIDER_REQUEST_BUDGET, budgetFetcher, parseVodId, toStremioStream, createVodResolver, runVod } = require('../addon/vod');
const { mockFetch, tmdbMovie, tmdbTv } = require('./utils');
const manifest = require('../manifest.json');

function supported(resource, type, id) {
  return manifest.resources.some(item => item.name === resource && item.types.includes(type) &&
    (!item.idPrefixes || item.idPrefixes.some(prefix => id.startsWith(prefix))));
}

function fixtureFetch() {
  const iv = Buffer.alloc(16, 4);
  const key = crypto.createHash('sha256').update('challengesalt').digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([iv, cipher.update('https://player.example/e/film'), cipher.final()]).toString('base64');
  const data = [{ video_language: 'LAT', sortedEmbeds: [{ servername: 'Filemoon', link: encrypted }] }];
  const player = Buffer.from('https://anime-player.example/e/ep13').toString('base64');
  return mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt0816692.json', { __json: { meta: { type: 'movie', name: 'Interstellar', year: '2014' } } }],
    ['v3-cinemeta.strem.io/meta/series/tt1234567.json', { __json: { meta: { type: 'series', name: 'One Piece', year: '1999' } } }],
    ['api.themoviedb.org/3/find/tt0816692', { __json: { movie_results: [{ id: 157336 }], tv_results: [] } }],
    ['api.themoviedb.org/3/find/tt1234567', { __json: { tv_results: [{ id: 44 }], movie_results: [] } }],
    ['api.themoviedb.org/3/movie/157336', tmdbMovie(157336, 'Interstellar')],
    ['api.themoviedb.org/3/tv/44', tmdbTv(44, 'One Piece', '1999', [
      { season_number: 1, episode_count: 12 }, { season_number: 2, episode_count: 10 }
    ])],
    ['tioanime.com/directorio?q=', url => {
      const query = new URL(url).searchParams.get('q');
      if (query === 'One Piece') return '<article class="anime"><a href="/anime/one-piece"><h3 class="title">One Piece</h3></a></article>';
      if (query === 'Interstellar') return '<article class="anime"><a href="/anime/interstellar-pelicula"><h3 class="title">Interstellar</h3></a><span class="anime-type-peli">Película</span></article>';
      return '<p>Sin resultados</p>';
    }],
    ['tioanime.com/anime/interstellar-pelicula', '<script>var episodes = [1];</script>'],
    ['tioanime.com/ver/interstellar-pelicula-1', `<script>var videos = [["Voe","https://movie-player.example/e/film"]];</script>`],
    ['movie-player.example/e/film', '<video><source src="https://cdn.example/1080p/film.m3u8?sig=abc"></video>'],
    ['tioanime.com/anime/one-piece', '<script>var episodes = [12,13];</script>'],
    ['tioanime.com/ver/one-piece-13', `<script>var videos = [["Voe","${'https://anime-player.example/e/ep13'}"]];</script>`],
    ['flixlatam.com/search?s=', url => new URL(url).searchParams.get('s') === 'Interstellar'
      ? '<a href="/pelicula/interstellar"><img alt="Ver Interstellar online"></a>' : '<p>Sin resultados</p>'],
    ['flixlatam.com/pelicula/interstellar', '<iframe src="https://embed69.org/f/film"></iframe>'],
    ['embed69.org/f/film', `const LINK_CHALLENGE='challenge'; const LINK_SALT='salt'; let dataLink=${JSON.stringify(data)};`],
    ['player.example/e/film', '<video><source src="https://cdn.example/1080p/film.m3u8?sig=abc"></video>'],
    ['latanime.org/buscar?q=', url => new URL(url).searchParams.get('q') === 'One Piece'
      ? '<a href="/anime/one-piece-latino"><strong>One Piece Latino</strong><span>Latino 1999</span></a>' : '<p>Sin resultados</p>'],
    ['latanime.org/anime/one-piece-latino', '<a href="/ver/one-piece-latino-episodio-13">Episodio 13</a>'],
    ['latanime.org/ver/one-piece-latino-episodio-13', `<a data-player="${player}">Servidor</a>`],
    ['anime-player.example/e/ep13', '<source src="https://cdn.example/anime/ep13.mp4?token=abc">']
  ]);
}

async function openServer(options = {}) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

test('el manifiesto deja pasar IDs IMDb/TMDB y deportes sin filtrar un tipo con otro', () => {
  assert.equal(manifest.idPrefixes, undefined);
  assert.equal(manifest.behaviorHints.epgProvider, undefined);
  assert.equal(manifest.catalogs.filter(c => c.type === 'channel').length, 4);
  assert.equal(manifest.catalogs.filter(c => c.type === 'tv').length, 4);
  assert.equal(new Set(manifest.catalogs.map(c => c.id)).size, 8);
  for (const [type, id] of [
    ['movie', 'tt0816692'], ['movie', 'tmdb:157336'], ['series', 'tt1234567:2:1'],
    ['series', 'tmdb:44:2:1'], ['tv', 'tmdb:44:2:1'],
    ['channel', 'nebula-sport:tvenvivo:espn-2'], ['tv', 'nebula-sport:ondemand:match-1']
  ]) assert.equal(supported('stream', type, id), true, `${type} ${id}`);
  assert.equal(supported('meta', 'channel', 'nebula-sport:tvenvivo:espn-2'), true);
  assert.equal(supported('meta', 'movie', 'tt0816692'), false);
  assert.equal(supported('meta', 'tv', 'tmdb:44'), false);
});

test('parsea IDs de película y episodios sin adivinar temporadas ni aceptar URLs', () => {
  assert.deepEqual(parseVodId('movie', 'tt0816692'), { id: 'tt0816692', type: 'movie', season: null, episode: null });
  assert.deepEqual(parseVodId('series', 'tmdb:44:2:13'), { id: 'tmdb:44', type: 'series', season: 2, episode: 13 });
  assert.deepEqual(parseVodId('tv', 'tt1234567:1:5'), { id: 'tt1234567', type: 'series', season: 1, episode: 5 });
  assert.deepEqual(parseVodId('series', '44:1:1'), { id: '44', type: 'series', season: 1, episode: 1 });
  for (const [type, id] of [
    ['series', 'tt1234567:0:2'], ['series', 'tt1234567:1:0'],
    ['movie', 'tt0816692:1:1'], ['channel', 'tt0816692'], ['movie', 'tt12'],
    ['movie', 'https://example.com/video.mp4'], ['movie', 'tmdb:44:evil'], ['movie', '0'],
    ['series', 'tmdb:44:evil'], ['anime', 'kitsu:'],
  ]) assert.equal(parseVodId(type, id), null, `${type} ${id}`);
  // Un ID de serie sin episodio identifica el título, pero no se buscan
  // fuentes con él: `incomplete` lo corta en resolve().
  assert.equal(parseVodId('series', 'tmdb:44').incomplete, true);
  assert.deepEqual(parseVodId('anime', 'kitsu:7442:1:3'), { id: 'kitsu:7442', type: 'series', season: 1, episode: 3 });
  assert.deepEqual(parseVodId('series', 'mal:21:2:10'), { id: 'mal:21', type: 'series', season: 2, episode: 10 });
});

test('adaptador de stream conserva las cabeceras seguras y rechaza páginas e IPs', () => {
  const stream = toStremioStream({
    name: 'FlixLatam', title: 'Película', quality: '1080p', language: 'Latino',
    url: 'https://cdn.example/film.mp4?secret=abc',
    headers: { referer: 'https://player.example/e/1', Origin: 'https://player.example', 'User-Agent': 'Test', Host: 'localhost', bad: 'x', Cookie: 'a=b' }
  });
  assert.equal(stream.name, 'Nébula · FlixLatam · 1080p · Latino');
  assert.equal(stream.description, 'Película · Latino');
  assert.deepEqual(stream.behaviorHints.proxyHeaders.request, {
    Referer: 'https://player.example/e/1', Origin: 'https://player.example', 'User-Agent': 'Test', Cookie: 'a=b'
  });
  assert.equal(stream.behaviorHints.notWebReady, undefined);
  assert.ok(stream.behaviorHints.bingeGroup);
  assert.match(stream.behaviorHints.filename, /1080p/);
  assert.equal(toStremioStream({ url: 'https://player.example/embed?id=a.mp4' }), null);
  assert.equal(toStremioStream({ url: 'http://127.0.0.1/private.mp4' }), null);
  assert.equal(toStremioStream({ url: 'https://ads.example/spot.mp4' }), null);
  assert.equal(toStremioStream({ url: 'https://cdn.example/trailer.mp4' }), null);
  const clean = toStremioStream({
    url: 'https://cdn.example/live.m3u8', headers: { Referer: 'https://example.com/\r\nX-Bad: test' },
    subtitles: [
      { id: '1', url: 'https://subs.example/es.vtt?sig=abc', lang: 'spa', label: 'Español' },
      { id: 'duplicate', url: 'https://subs.example/es.vtt?sig=abc', lang: 'spa' },
      { id: 'local', url: 'https://127.0.0.1/private.srt', lang: 'eng' },
      { id: 'html', url: 'https://subs.example/iframe', lang: 'eng' },
      { id: 'bad-lang', url: 'https://subs.example/en.srt', lang: 'eng\r\nInjected' }
    ]
  });
  assert.equal(clean.behaviorHints.proxyHeaders, undefined);
  assert.deepEqual(clean.subtitles, [{ id: '1', url: 'https://subs.example/es.vtt?sig=abc', lang: 'spa', label: 'Español' }]);
});

test('servidor unificado resuelve película IMDb y anime TMDB/IMDb en el mismo manifiesto', async () => {
  const fetcher = fixtureFetch();
  const app = await openServer({ fetcher, tmdbKey: 'fixture-key' });
  try {
    const json = async route => {
      const res = await fetch(app.base + route);
      return { status: res.status, body: await res.json() };
    };
    assert.equal((await json('/healthz')).body.status, 'ok');
    assert.equal((await json('/manifest.json')).body.id, manifest.id);
    const home = await fetch(app.base + '/');
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /Un solo addon/);

    const movie = (await json('/stream/movie/tt0816692.json')).body.streams;
    assert.equal(movie.length, 1);
    assert.equal(movie[0].url, 'https://cdn.example/1080p/film.m3u8?sig=abc');
    assert.match(movie[0].name, /TioAnime.*1080p/);
    assert.equal(movie[0].behaviorHints.proxyHeaders.request.Referer, 'https://movie-player.example/e/film');
    assert.equal(movie[0].behaviorHints.notWebReady, undefined);

    for (const id of ['tmdb:44:2:1', 'tt1234567:2:1']) {
      const result = await json('/stream/series/' + encodeURIComponent(id) + '.json');
      assert.equal(result.body.streams.length, 1, id);
      assert.equal(result.body.streams[0].url, 'https://cdn.example/anime/ep13.mp4?token=abc');
      assert.match(result.body.streams[0].title, /S02E01/);
      assert.equal(result.body.streams[0].behaviorHints.proxyHeaders.request.Referer, 'https://anime-player.example/e/ep13');
    }
    const tvAlias = (await json('/stream/tv/' + encodeURIComponent('tmdb:44:2:1') + '.json')).body.streams;
    assert.equal(tvAlias[0].url, 'https://cdn.example/anime/ep13.mp4?token=abc');
    assert.ok(fetcher.calls.some(call => call.url.includes('/3/find/tt1234567')), 'enriquece un IMDb con temporadas de TMDB');
    assert.ok(fetcher.calls.some(call => call.url.includes('/3/tv/44')), 'consulta los recuentos por temporada');
    assert.ok(fetcher.calls.every(call => !/\.(?:m3u8|mp4)$/i.test(new URL(call.url).pathname)), 'nunca solicita los medios');
    const before = fetcher.calls.length;
    assert.deepEqual((await json('/stream/series/tmdb%3A44.json')).body.streams, []);
    assert.deepEqual((await json('/stream/movie/' + encodeURIComponent('https://internal.example/file.mp4') + '.json')).body.streams, []);
    assert.equal(fetcher.calls.length, before, 'un ID inválido no activa consultas');
    assert.equal((await json('/proxy?url=https://cdn.example/film.mp4')).status, 404);
    assert.equal((await fetch(app.base + '/manifest.json', { method: 'OPTIONS' })).status, 204);
  } finally { await app.close(); }
});

test('un origen VOD caído no impide obtener el otro', async () => {
  const mock = fixtureFetch();
  const fetcher = async (url, init) => {
    if (String(url).includes('flixlatam.com')) throw new Error('origen caído');
    return mock(url, init);
  };
  const app = await openServer({ fetcher, tmdbKey: 'fixture-key' });
  try {
    const res = await fetch(app.base + '/stream/series/tmdb%3A44%3A2%3A1.json');
    const { streams } = await res.json();
    assert.equal(streams.length, 1);
    assert.match(streams[0].name, /Latanime/);
  } finally { await app.close(); }
});

test('búsquedas VOD simultáneas se agrupan, pero sus enlaces no se guardan', async () => {
  const mock = fixtureFetch();
  const fetcher = async (...args) => { await new Promise(resolve => setTimeout(resolve, 2)); return mock(...args); };
  const resolve = createVodResolver({ fetcher, tmdbKey: 'fixture-key' });
  const one = resolve('series', 'tmdb:44:2:1');
  const two = resolve('tv', 'tmdb:44:2:1');
  assert.equal(one, two);
  assert.equal((await one).length, 1);
  const previous = mock.calls.length;
  assert.equal((await resolve('series', 'tmdb:44:2:1')).length, 1);
  assert.ok(mock.calls.length > previous);
});

test('el plazo conserva los resultados de una fuente rápida si la otra tarda', async () => {
  const mock = fixtureFetch();
  const fetcher = (url, init) => {
    if (!String(url).includes('flixlatam.com')) return mock(url, init);
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('cancelada')), { once: true });
    });
  };
  const streams = await runVod(parseVodId('series', 'tmdb:44:2:1'), {
    fetcher, tmdbKey: 'fixture-key', timeout: 150
  });
  assert.equal(streams.length, 1);
  assert.match(streams[0].name, /Latanime/);
});

test('la búsqueda respeta su plazo y cancela las solicitudes activas', async () => {
  const signals = [];
  const fetcher = (_url, { signal }) => new Promise((_resolve, reject) => {
    signals.push(signal);
    signal.addEventListener('abort', () => reject(new Error('cancelada')), { once: true });
  });
  const parsed = parseVodId('movie', 'tt0816692');
  const started = Date.now();
  assert.deepEqual(await runVod(parsed, { fetcher, timeout: 30 }), []);
  assert.ok(Date.now() - started < 1500);
  assert.ok(signals.length > 0 && signals.every(signal => signal.aborted));
});

test('límite de concurrencia devuelve 503 sin bloquear salud ni manifiesto', async () => {
  let release;
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const app = await openServer({ maxConcurrent: 1, resolveVod: async () => { started(); await pending; return []; } });
  try {
    const first = fetch(app.base + '/stream/movie/tt0816692.json');
    await entered;
    const busy = await fetch(app.base + '/stream/movie/tt1234567.json');
    assert.equal(busy.status, 503);
    assert.equal(busy.headers.get('retry-after'), '5');
    assert.equal((await fetch(app.base + '/healthz')).status, 200);
    assert.equal((await fetch(app.base + '/manifest.json')).status, 200);
    release();
    assert.equal((await first).status, 200);
    assert.equal((await fetch(app.base + '/stream/movie/tt1234567.json')).status, 200);
  } finally { release(); await app.close(); }
});

test('el addon expone CinePlus123 en su stream de película con cabeceras Vidara', async () => {
  const mock = mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt0816692.json', { __json: { meta: { type: 'movie', name: 'Interstellar', year: '2014' } } }],
    ['cineplus123.org/?s=', `<div class="result-item"><article><div class="image">
      <a href="/peliculas/interestellar/"><img alt="Interstellar"></a></div>
      <div class="meta"><span>2014</span></div></article></div>`],
    ['cineplus123.org/peliculas/interestellar/', `<a href="https://www.imdb.com/title/tt0816692/">IMDb</a>
      <ul id="playeroptionsul"><li class="dooplay_player_option" data-type="movie" data-post="9166" data-nume="2">
      <span class="title">LATINO HD</span></li></ul>`],
    ['/wp-json/dooplayer/v2/9166/movie/2', { __json: { type: 'iframe', embed_url: 'https://vidara.to/e/abc123' } }],
    ['vidara.to/api/stream', (_url, init) => {
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body), { filecode: 'abc123', device: 'web' });
      return { __json: { streaming_url: 'https://cdn.example/cine/film.m3u8?token=secret',
        subtitles: [{ file_path: '/subs/es.vtt?sig=1', language: 'Spanish' }] } };
    }]
  ]);
  const app = await openServer({ fetcher: mock, tmdbKey: '' });
  try {
    const response = await fetch(app.base + '/stream/movie/tt0816692.json');
    const { streams } = await response.json();
    assert.equal(response.status, 200);
    assert.equal(streams.length, 1);
    assert.match(streams[0].name, /CinePlus123/);
    assert.match(streams[0].description, /LATINO HD.*Latino/);
    assert.equal(streams[0].url, 'https://cdn.example/cine/film.m3u8?token=secret');
    assert.equal(streams[0].behaviorHints.notWebReady, undefined);
    assert.equal(streams[0].behaviorHints.proxyHeaders.request.Referer, 'https://vidara.to/');
    assert.equal(streams[0].behaviorHints.proxyHeaders.request.Origin, 'https://vidara.to');
    assert.equal(streams[0].subtitles.length, 1);
    assert.equal(streams[0].subtitles[0].url, 'https://vidara.to/subs/es.vtt?sig=1');
    assert.equal(streams[0].subtitles[0].lang, 'spa');
    assert.match(streams[0].subtitles[0].id, /^vidara-[0-9a-f]{16}$/);
    assert.ok(mock.calls.every(call => !/\.(?:m3u8|mp4|vtt|srt)$/i.test(new URL(call.url).pathname)));
    const home = await (await fetch(app.base + '/')).text();
    assert.match(home, /CinePlus123/);
  } finally { await app.close(); }
});

test('presupuestos VOD: cada fuente tiene límite propio y comparte un límite global', async () => {
  assert.deepEqual(PROVIDERS, ['tioanime', 'fuegocine', 'kdrama', 'framextv', 'latanime', 'cineplus123']);
  assert.equal(REQUEST_BUDGET, 96);
  assert.equal(PROVIDER_REQUEST_BUDGET, 32);
  const controller = new AbortController();
  const calls = [];
  const network = async (url, init) => { calls.push({ url, signal: init.signal }); return url; };
  const shared = budgetFetcher(network, controller.signal, 5);
  const one = budgetFetcher(shared, controller.signal, 3);
  const two = budgetFetcher(shared, controller.signal, 3);
  for (let i = 0; i < 3; i++) assert.equal(await one('one'), 'one');
  await assert.rejects(one('one'), /Presupuesto/);
  assert.equal(await two('two'), 'two');
  assert.equal(await two('two'), 'two');
  await assert.rejects(two('two'), /Presupuesto/);
  assert.equal(calls.length, 5, 'el exceso no invoca el transporte');
  controller.abort();
  assert.ok(calls.every(call => call.signal.aborted));
  await assert.rejects(one('one'), /Presupuesto/);
  assert.equal(calls.length, 5);
});

test('CinePlus123 conserva un reproductor rápido aunque otra opción agote el plazo', async () => {
  const mock = mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt0816692.json', { __json: { meta: { type: 'movie', name: 'Interstellar', year: '2014' } } }],
    ['cineplus123.org/?s=', `<div class="result-item"><article><a href="/peliculas/interestellar/">Interstellar</a><span>2014</span></article></div>`],
    ['cineplus123.org/peliculas/interestellar/', `<ul id="playeroptionsul">
      <li class="dooplay_player_option" data-type="movie" data-post="9166" data-nume="1"><span class="title">LATINO</span></li>
      <li class="dooplay_player_option" data-type="movie" data-post="9166" data-nume="2"><span class="title">CASTELLANO</span></li>
      </ul>`],
    ['/wp-json/dooplayer/v2/9166/movie/1', { __json: { type: 'iframe', embed_url: 'https://vidara.to/e/fast123' } }],
    ['vidara.to/api/stream', { __json: { streaming_url: 'https://cdn.example/fast.mp4',
      subtitles: [{ file_path: '/subs/es.vtt', language: 'Español' }] } }]
  ]);
  let stalledSignal;
  const fetcher = (url, init) => {
    if (String(url).includes('/wp-json/dooplayer/v2/9166/movie/2')) {
      stalledSignal = init.signal;
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('cancelada')), { once: true }));
    }
    return mock(url, init);
  };
  const start = Date.now();
  const streams = await runVod(parseVodId('movie', 'tt0816692'), { fetcher, tmdbKey: '', timeout: 180 });
  assert.ok(Date.now() - start < 1500);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/fast.mp4');
  assert.match(streams[0].name, /CinePlus123/);
  assert.equal(streams[0].subtitles[0].url, 'https://vidara.to/subs/es.vtt');
  assert.equal(streams[0].subtitles[0].lang, 'spa');
  assert.ok(stalledSignal && stalledSignal.aborted, 'se cancela el reproductor que no respondió');
  assert.ok(mock.calls.every(call => !/\.(?:m3u8|mp4)$/i.test(new URL(call.url).pathname)));
});

test('El diagnóstico simula metadatos del tipo pedido (serie ≠ película)', async () => {
  const { metadataStub } = require('../addon/diag');
  const real = async () => new Response('', { status: 404 });
  const stubSeries = metadataStub('VisionQuest', 2025, real, 'series');
  const stubMovie = metadataStub('VisionQuest', 2025, real, 'movie');
  const series = await (await stubSeries('https://v3-cinemeta.strem.io/meta/series/tt1.json')).json();
  const movie = await (await stubMovie('https://v3-cinemeta.strem.io/meta/movie/tt1.json')).json();
  assert.equal(series.meta.type, 'series');
  assert.equal(movie.meta.type, 'movie');
});

test('sin TMDB_API_KEY un ID de TMDB de Nuvio sigue dando fuentes por id (KatDrama/frameXTV)', async () => {
  // Caso real de Nuvio: manda «tmdb:603» / «tmdb:1399:1:1». TMDB responde 403
  // al servidor y Wikidata puede no tener ficha: el addon debe seguir usando
  // el id de TMDB en los sitios que lo necesitan, no devolver [].
  const fetcher = mockFetch([
    ['api.themoviedb.org', { __response: { status: 403 } }],
    ['www.themoviedb.org', { __response: { status: 403 } }],
    ['www.wikidata.org/w/api.php?action=query&list=search', { __json: { query: { search: [] } } }],
    [/k-drama\.in\/watch\/movie\/n-a-603/, '<button onclick="switchServer(\'kat1\', \'https://k-drama.in/mx1.php?type=movie&id=603\', \'embed\', \'\')">'],
    ['k-drama.in/mx1.php', '<video src="https://cdn.example/matrix.mp4"></video>'],
    ['vidsync-shard.vs-deals79.workers.dev', { __json: { sources: [
      { id: 'castle-1', url: 'https://img.example/matrix/index.m3u8', type: 'hls', quality: '720p', server: 'Castle' }
    ] } }]
  ]);
  const app = await openServer({ fetcher, tmdbKey: '' });
  try {
    const res = await fetch(app.base + '/stream/movie/' + encodeURIComponent('tmdb:603') + '.json');
    const { streams } = await res.json();
    const urls = streams.map(stream => stream.url).sort();
    assert.deepEqual(urls, ['https://cdn.example/matrix.mp4', 'https://img.example/matrix/index.m3u8']);
    assert.ok(streams.every(stream => stream.name.startsWith('Nébula')), JSON.stringify(streams.map(s => s.name)));
  } finally { await app.close(); }
});

test('cada fuente etiqueta el idioma (Multi, Latino, Castellano, Inglés) en el nombre del stream', async () => {
  const fetcher = mockFetch([
    ['api.themoviedb.org', { __response: { status: 403 } }],
    ['www.themoviedb.org', { __response: { status: 403 } }],
    ['www.wikidata.org/w/api.php?action=query&list=search', { __json: { query: { search: [] } } }],
    [/watch\/movie\/n-a-603/, [
      // KatDrama publica el idioma en el texto del botón.
      '<button class="btn" onclick="switchServer(\'kat1\', \'https://k-drama.in/mx1.php?type=movie&id=603\', \'embed\', \'\')">Kat 1 - Hindi1080p</button>',
      '<button class="btn" onclick="switchServer(\'kat2\', \'https://k-drama.in/vid2.php/603?m=lat\', \'embed\', \'\')">Kat 2 - Latino1080p</button>'
    ].join('')],
    ['k-drama.in/mx1.php', '<video src="https://cdn.example/matrix-hi.mp4"></video>'],
    ['k-drama.in/vid2.php/603', '<video src="https://cdn.example/matrix-lat.mp4"></video>'],
    ['vidsync-shard.vs-deals79.workers.dev', { __json: { sources: [
      { id: 'a', url: 'https://cdn.example/nm.m3u8', type: 'hls', quality: '1080p', server: 'NetMirror', audioLanguage: 'es', audioLabel: 'Español Latino' },
      { id: 'b', url: 'https://cdn.example/castle.m3u8', type: 'hls', quality: '720p', server: 'Castle', audioLanguage: 'en', audioLabel: 'English' },
      { id: 'c', url: 'https://cdn.example/multi.m3u8', type: 'hls', quality: '480p', server: 'Multi', audioLabel: 'Multi Audio' }
    ] } }]
  ]);
  const app = await openServer({ fetcher, tmdbKey: '' });
  try {
    const { streams } = await (await fetch(app.base + '/stream/movie/' + encodeURIComponent('tmdb:603') + '.json')).json();
    const byName = Object.fromEntries(Array.from(streams, stream => [stream.name, stream]));
    assert.ok(byName['Nébula · KatDrama · Latino'], JSON.stringify(streams.map(s => s.name)));
    assert.ok(byName['Nébula · KatDrama · Hindi'], JSON.stringify(streams.map(s => s.name)));
    assert.ok(byName['Nébula · frameXTV · 1080p · Latino']);
    assert.ok(byName['Nébula · frameXTV · 720p · Inglés']);
    assert.ok(byName['Nébula · frameXTV · 480p · Multi']);
    // El idioma aparece también en el título y en el nombre de archivo.
    for (const stream of streams) {
      const language = stream.name.split(' · ').pop();
      assert.ok(stream.title.includes(language), stream.title + ' / ' + stream.name);
      // `filename` es sintético y va en minúsculas, sin acentos y sin espacios.
      const filename = stream.behaviorHints.filename.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.]/g, ' ');
      const wanted = language.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ')[0];
      assert.ok(filename.includes(wanted), stream.behaviorHints.filename + ' vs ' + language);
    }
  } finally { await app.close(); }
});
