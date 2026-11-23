#!/usr/bin/env node
/**
 * Sonda de reconocimiento: descarga el HTML/JSON crudo de las fuentes
 * candidatas y muestra solo las líneas relacionadas con reproductores,
 * búsqueda y episodios.
 *
 * Se ejecuta a mano desde GitHub Actions (`[probe]` en el mensaje del commit o
 * la entrada `probe` del workflow), no en CI: sirve para mantener los
 * selectores cuando un sitio cambia. No reproduce ni descarga medios y no
 * envía datos de usuario.
 *
 * Uso: node tools/probe-sites.js [fuegocine|k-drama|framextv|kdesa|all]
 */
'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_LINES = 40;

async function fetchRaw(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json;q=0.9', 'Accept-Language': 'es-ES,es;q=0.9' },
    redirect: 'follow'
  });
  const body = await res.text();
  return { status: res.status, url: res.url, type: res.headers.get('content-type') || '', body };
}

function interesting(body, pattern) {
  const re = new RegExp(pattern, 'i');
  return body.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && re.test(line))
    .slice(0, MAX_LINES)
    .map(line => (line.length > 300 ? line.slice(0, 300) + '…' : line));
}

/** Muestra hasta `size` caracteres alrededor de cada coincidencia: sirve para
 * ficheros minificados donde la línea entera no aporta nada. */
async function probeSnippets(name, url, patterns, size = 260) {
  try {
    const res = await fetchRaw(url);
    console.log(`\n===== ${name} :: ${url}`);
    console.log(`status=${res.status} type=${res.type} bytes=${res.body.length} final=${res.url}`);
    for (const [label, pattern] of patterns) {
      const re = new RegExp(pattern, 'gi');
      let match;
      let shown = 0;
      console.log(`--- ${label}:`);
      while ((match = re.exec(res.body)) && shown < 6) {
        const start = Math.max(0, match.index - size / 2);
        console.log('   …' + res.body.slice(start, start + size).replace(/\s+/g, ' ') + '…');
        shown++;
        if (match.index === re.lastIndex) re.lastIndex++;
      }
      if (!shown) console.log('   (sin coincidencias)');
    }
  } catch (error) {
    console.log(`\n===== ${name} :: ${url}\nERROR ${error && error.message}`);
  }
}

async function probe(name, url, patterns) {
  try {
    const res = await fetchRaw(url);
    console.log(`\n===== ${name} :: ${url}`);
    console.log(`status=${res.status} type=${res.type} bytes=${res.body.length} final=${res.url}`);
    for (const [label, pattern] of patterns) {
      const lines = interesting(res.body, pattern);
      console.log(`--- ${label}: ${lines.length} líneas`);
      for (const line of lines) console.log('   ' + line);
    }
  } catch (error) {
    console.log(`\n===== ${name} :: ${url}\nERROR ${error && error.message}`);
  }
}

const PLAYERS = [
  ['iframe/embed', 'iframe|<embed|data-src|data-url|embed_url|data-link'],
  ['servers/ajax', 'servidor|server|ajax|api/|player|reproductor'],
  ['json-inline', '"link"|"url"|"file"|"embed"|"server"']
];
const LINKS = [
  ['fichas', 'href="[^"]*(?:/watch|/pelicula|/media|details|/tv/|/movie)'],
  ['episodios', 'episode|episodio|capitulo|season|temporada|\\d+x\\d']
];

async function fuegocine() {
  await probe('fuegocine watch', 'https://fuegocine.com/movies/watch/la-odisea/227', PLAYERS);
  await probe('fuegocine search', 'https://fuegocine.com/search_elastic?s=odisea', [['resultados', 'details|alt=']]);
  await probe('fuegocine episodio', 'https://fuegocine.com/shows/visionquest/01x02-teseo/50', PLAYERS);
  await probe('unlimplay api', 'https://vimeos.unlimplay.com/?id=1368337', [['json', '.*']]);
}

async function round10() {
  await probeSnippets('vidsync shards', 'https://vidsync.pro/assets/index-DO1zww39.js',
    [['bs', 'function bs\\('], ['hosts', 'vidsync\\.[a-z]+'], ['api', 'api/core/streams']], 420);
}

async function round9() {
  await probe('vidsync api tv', 'https://vidsync.pro/api/core/streams?type=tv&id=117376&season=1&episode=1',
    [['json', '.*']]);
  await probe('vidsync api movie', 'https://vidsync.pro/api/core/streams?type=movie&id=1654940', [['json', '.*']]);
  await probe('vidsync api video movie', 'https://vidsync.pro/api/core/streams?type=video&id=1654940', [['json', '.*']]);
}

async function round8() {
  await probeSnippets('vidsync bundle', 'https://vidsync.pro/assets/index-DO1zww39.js',
    [['api', 'https://[a-z0-9.-]+\\.[a-z]{2,}(?:/[a-z0-9._-]*)?/api'], ['paths', '/api/[a-z0-9/_-]+'], ['src', 'sources|m3u8']], 300);
  await probeSnippets('zxcstream', 'https://zxcstream.cc/player/tv/117376/1/1', [['api', '/api/[a-z0-9/_-]+'], ['hls', 'm3u8']], 220);
  await probeSnippets('reels', 'https://embed.reelsdownload.online/player/117376/1/1?key=k_3db7ca4f00d84e94c9d62159',
    [['hls', 'm3u8'], ['src', 'source|file:']], 220);
}

async function round7() {
  await probeSnippets('vidsync script', 'https://vidsync.pro/embed/tv/117376/1/1?autoplay=1',
    [['script', '<script'], ['fetch', 'fetch\\(|XMLHttpRequest|api'], ['key', 'file|source|stream']], 320);
  await probeSnippets('vidlink', 'https://vidlink.pro/api/b/tv/117376/1/1?multiLang=0', [['json', '.*']], 320);
}

async function round6() {
  await probeSnippets('vidsync embed', 'https://vidsync.pro/embed/tv/117376/1/1?dublang=en&autoplay=1',
    [['iframe', '<iframe'], ['hls', 'm3u8'], ['json', '"file"|"source"|"url"'], ['api', 'fetch\\(|ajax|/api/']]);
  await probeSnippets('vidsync movie', 'https://vidsync.pro/embed/movie/1654940?autoplay=1',
    [['hls', 'm3u8'], ['iframe', '<iframe']]);
  await probeSnippets('fx bundle2', 'https://framextv.cc/assets/index-DvMX4GhI.js',
    [['http', 'https://[a-z0-9.-]+\\.[a-z]{2,}/[a-z0-9/_-]*'], ['const', 'Qp=']]);
}

async function round5() {
  await probeSnippets('kd vid2', 'https://k-drama.in/vid2.php/117376/1/1?m=en',
    [['iframe', '<iframe'], ['script', '<script'], ['hls', 'm3u8']]);
  await probeSnippets('fx bundle', 'https://framextv.cc/assets/index-DvMX4GhI.js',
    [['graphql', 'graphql'], ['endpoint', 'Qp='], ['anime', '/anime/']]);
  await probe('kd id directo tv', 'https://k-drama.in/watch/tv/n-a-117376-episode-1', PLAYERS);
  await probe('kd id directo movie', 'https://k-drama.in/watch/movie/n-a-1654940', PLAYERS);
}

async function round4() {
  await probe('kd vid2 raw', 'https://k-drama.in/vid2.php/117376/1/1?m=en', [['iframe', '<iframe[^>]*>']]);
  await probe('fx graphql', 'https://framextv.cc/assets/index-DvMX4GhI.js',
    [['qp', 'https://[a-z0-9.-]+/graphql|Qp=`[^`]*`|graphql']]);
  await probe('kd movie detail', 'https://k-drama.in/detail/movie/one-year-to-live-buy-a-man-1654940', LINKS);
  await probe('kd movie watch', 'https://k-drama.in/watch/movie-one-year-to-live-buy-a-man-1654940', PLAYERS);
}

async function round3() {
  await probe('kd search vincenzo', 'https://k-drama.in/search?q=vincenzo',
    [['vincenzo', 'vincenzo'], ['api', '/api/[a-z]+']]);
  await probe('kd vid2', 'https://k-drama.in/vid2.php/117376/1/1?m=en', PLAYERS.concat([['hls', '\\.m3u8|\\.mp4']]));
  await probe('fx embed', 'https://framextv.xyz/embed/117376/1/1', PLAYERS.concat([['hls', '\\.m3u8|\\.mp4']]));
  await probe('fx bundle api', 'https://framextv.cc/assets/index-DvMX4GhI.js',
    [['endpoints', 'https://[a-z0-9.-]+/api[a-zA-Z0-9/_-]*'], ['embed', '/embed/[a-zA-Z0-9/_-]*']]);
  await probe('vidly', 'https://vidly.pro/tv/117376/1/1', PLAYERS.concat([['hls', '\\.m3u8|\\.mp4']]));
}

async function kDrama2() {
  await probe('kd watch', 'https://k-drama.in/watch/vincenzo-117376-episode-1', PLAYERS);
  await probe('kd detail', 'https://k-drama.in/detail/tv/vincenzo-117376', PLAYERS.concat(LINKS));
  await probe('kd search api', 'https://k-drama.in/api/search?q=vincenzo', [['json', '.*']]);
}

async function framextv2() {
  await probe('fx bundle refs', 'https://framextv.cc/', [['js', 'src="/assets/[^"]+\\.js"']]);
  for (const candidate of ['/api/v1/movies', 'https://api.framextv.cc/', 'https://framextv.xyz/api']) {
    await probe('fx api alt', candidate.startsWith('http') ? candidate : 'https://framextv.cc' + candidate, [['json', '.*']]);
  }
}

async function kDrama() {
  await probe('k-drama home', 'https://k-drama.in/', PLAYERS.concat(LINKS));
  for (const candidate of ['search?q=squid', '?s=squid', 'search?s=squid', 'buscar?q=squid']) {
    await probe('k-drama búsqueda', 'https://k-drama.in/' + candidate, LINKS);
  }
  for (const candidate of ['pelicula/interestelar', 'movie/interestelar', 'ver/interestelar', 'serie/squid-game']) {
    await probe('k-drama ficha', 'https://k-drama.in/' + candidate, PLAYERS.concat(LINKS));
  }
}

async function framextv() {
  await probe('framextv api', 'https://framextv.cc/api', [['json', '.*']]);
  for (const candidate of ['/api/movies', '/api/search?q=dune', '/api/tmdb/movie/693134', '/api/movie/693134']) {
    await probe('framextv api hijo', 'https://framextv.cc' + candidate, [['json', '.*']]);
  }
  await probe('framextv home', 'https://framextv.cc/', LINKS);
}

async function kdesa() {
  await probe('kdesa movie', 'https://kdesa.stream/media/tmdb-movie-1595124', PLAYERS.concat(LINKS));
  await probe('kdesa tv', 'https://kdesa.stream/media/tmdb-tv-1399-1-1', PLAYERS.concat(LINKS));
  for (const candidate of ['search?q=dune', '?s=dune', 'buscar?q=dune', 'api/search?q=dune']) {
    await probe('kdesa búsqueda', 'https://kdesa.stream/' + candidate, LINKS);
  }
  await probe('kdesa home', 'https://kdesa.stream/', LINKS);
}

async function main() {
  const only = (process.argv[2] || 'all').toLowerCase();
  if (only === 'all' || only === 'fuegocine') await fuegocine();
  if (only === 'all' || only === 'k-drama' || only === 'kdrama') await kDrama();
  if (only === 'all' || only === 'framextv') await framextv();
  if (only === 'all' || only === 'round2') { await kDrama2(); await framextv2(); }
  if (only === 'all' || only === 'round3') await round3();
  if (only === 'all' || only === 'round4') await round4();
  if (only === 'all' || only === 'round5') await round5();
  if (only === 'all' || only === 'round6') await round6();
  if (only === 'all' || only === 'round7') await round7();
  if (only === 'all' || only === 'round8') await round8();
  if (only === 'all' || only === 'round9') await round9();
  if (only === 'all' || only === 'round10') await round10();
  if (only === 'all' || only === 'kdesa') await kdesa();
}

if (require.main === module) {
  main().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
}

module.exports = { probe, interesting };
