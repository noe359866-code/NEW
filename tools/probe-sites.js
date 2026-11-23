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

async function round14() {
  await probeSnippets('shard movie keys', 'https://vidsync-shard.vs-deals79.workers.dev/api/core/streams?type=movie&id=155',
    [['head', '^\\{.{0,1200}'], ['subtitles', '"subtitles"'], ['audio', '"audioTracks"'], ['keys', '"quality"']], 700);
}

async function round13() {
  await probeSnippets('vidsync shard list', 'https://vidsync.pro/assets/index-DO1zww39.js',
    [['shards', 'vidsync-shard\\.vs-deals\\d+\\.workers\\.dev']], 60);
  await probe('shard tv', 'https://vidsync-shard.vs-deals79.workers.dev/api/core/streams?type=tv&id=117376&season=1&episode=1',
    [['json', '.*']]);
  await probe('shard movie', 'https://vidsync-shard.vs-deals79.workers.dev/api/core/streams?type=movie&id=1654940',
    [['json', '.*']]);
}

async function round12() {
  for (const path of ['/api/core/shards', '/api/shards', '/api/core/config', '/api/health', '/api/core/streams?type=movie&id=155']) {
    await probe('vidsync ep', 'https://vidsync.pro' + path, [['body', '.*']].map(([l, p2]) => [l, p2]));
  }
  await probeSnippets('vidsync L6C6', 'https://vidsync.pro/assets/index-DO1zww39.js',
    [['L6', 'function L6\\('], ['C6', 'function C6\\(']], 380);
}

async function round11() {
  await probeSnippets('zxc bundle', 'https://zxcstream.cc/player/tv/117376/1/1', [['script', 'src="[^"]+\\.js"'], ['data', 'data-[a-z]+=']], 200);
  await probeSnippets('vidzee', 'https://player.vidzee.wtf/embed/tv/117376/1/1', [['m3u8', 'm3u8'], ['script', 'src="[^"]+\\.js"']], 200);
  await probeSnippets('reels data', 'https://embed.reelsdownload.online/player/117376/1/1?key=k_3db7ca4f00d84e94c9d62159',
    [['config', 'var [a-z]+ ?=|window\\.__|sources'], ['script', 'src="[^"]+\\.js"']], 260);
  await probe('wecollege', 'https://api.wecollege.net/', [['json', '.*']]);
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

/* ------------------- ronda 15: homecine / frikiserie / pelishax ------------------- */

const MEDIA = [['hls/mp4', '\\.m3u8|\\.mp4'], ['iframes', '<iframe[^>]*>'],
  ['players', 'player|embed|reproductor|servidor|server|data-']];

async function homecine() {
  await probe('homecine home', 'https://www3.homecine.to/', [['form', '<form[^>]*>'], ['search', 'name="s"|search'], ['links', 'href="[^"]*/cartelera']]);
  await probe('homecine película', 'https://www3.homecine.to/pequenos-secretos', PLAYERS.concat(MEDIA));
  await probe('homecine serie', 'https://www3.homecine.to/series/mouse', PLAYERS.concat(MEDIA));
  for (const candidate of ['?s=mouse', 'search?q=mouse', 'buscar?q=mouse']) {
    await probe('homecine búsqueda', 'https://www3.homecine.to/' + candidate, LINKS);
  }
}

async function frikiserie() {
  await probe('frikiserie home', 'https://www.frikiserie.com/', [['form', '<form[^>]*>'], ['links', 'href="[^"]*(?:lista-series|ver-serie)']]);
  await probe('frikiserie serie', 'https://www.frikiserie.com/ver-serie/los-caballeros-del-zodiaco-1986', PLAYERS.concat(MEDIA));
  await probe('frikiserie lista', 'https://www.frikiserie.com/lista-series/cool-mccool', PLAYERS.concat(MEDIA).concat(LINKS));
  for (const candidate of ['buscar?q=marco', 'search?q=marco', '?s=marco']) {
    await probe('frikiserie búsqueda', 'https://www.frikiserie.com/' + candidate, LINKS);
  }
}

async function pelishax() {
  await probe('pelishax película', 'https://pelishaxpro.com/movies/5084', PLAYERS.concat(MEDIA));
  await probe('pelishax serie', 'https://pelishaxpro.com/series/575', PLAYERS.concat(MEDIA));
  for (const candidate of ['/search?q=dune', '/buscar?q=dune', '/api/search?q=dune', '/search/dune']) {
    await probe('pelishax búsqueda', 'https://pelishaxpro.com' + candidate, [['json', '.*']].concat(LINKS));
  }
  await probe('pelishax home', 'https://pelishaxpro.com/', [['form', '<form[^>]*>'], ['search', 'search|buscar']]);
}

/* Imprime los atributos que publican la URL del reproductor, que es lo que
 * necesita el addon: sin un enlace directo o un iframe no hay nada que ofrecer. */
/* Vuelca el JSON de estado de Angular (ng-state) de FrikiSeries: ahí viven los
 * capítulos y la URL de cada reproductor. */
async function frikiState() {
  const url = 'https://www.frikiserie.com/ver-serie/los-caballeros-del-zodiaco-1986';
  try {
    const res = await fetchRaw(url);
    const match = /<script id="ng-state" type="application\/json">([\s\S]*?)<\/script>/i.exec(res.body);
    if (!match) { console.log('\n===== frikiserie ng-state\n(no encontrado)'); return; }
    const raw = match[1].replace(/&quot;/g, '"');
    console.log(`\n===== frikiserie ng-state bytes=${raw.length}`);
    const keys = new Set((raw.match(/"[a-zA-Z_][a-zA-Z0-9_]{2,30}"\s*:/g) || []).map(k => k.replace(/[":\s]/g, '')));
    console.log('claves: ' + Array.from(keys).slice(0, 80).join(', '));
    for (const [label, pattern] of [
      ['http(s) con player/embed', 'https?://[^"\\\s]{10,160}'],
      ['capitulos/episodios', '"[^"]*(?:capitulo|episodio|episode|temporada|season)[^"]*"'],
      ['campos link/url', '"(?:link|url|enlace|iframe|player|reproductor|embed)"[^,]{0,200}']
    ]) {
      const re = new RegExp(pattern, 'gi');
      const seen = new Set();
      let m;
      console.log('--- ' + label + ':');
      let shown = 0;
      while ((m = re.exec(raw)) && shown < 25) {
        const value = m[0].slice(0, 200);
        if (seen.has(value)) continue;
        seen.add(value);
        console.log('   ' + value);
        shown++;
      }
      if (!shown) console.log('   (sin coincidencias)');
    }
  } catch (error) {
    console.log('\n===== frikiserie ng-state\nERROR ' + (error && error.message));
  }
}

/* Ronda 16: API de las tres fuentes nuevas y resolución de sus reproductores. */
async function round16() {
  // FrikiSeries es Angular: los capítulos llegan por API, no en el HTML.
  await probeSnippets('friki bundle', 'https://www.frikiserie.com/', [['js', 'src="[^"]+\\.js"']], 120);
  for (const name of ['main-4BWVI3NJ.js', 'main.js', 'polyfills.js']) {
    await probeSnippets('friki js ' + name, 'https://www.frikiserie.com/' + name,
      [['api', 'https?://[a-z0-9.-]+/(?:api|v1)[a-zA-Z0-9/_-]*|/api/[a-zA-Z0-9/_-]+'], ['video', 'videoembed|ok\\.ru|"video"']], 200);
  }
  // HomeCine: el reproductor es fastream.to por pestaña de idioma.
  await probe('homecine fastream', 'https://fastream.to/embed-zkfc7qenyh7k.html',
    [['iframe/embed', 'iframe|data-src|data-url'], ['hls/mp4', '\\.m3u8|\\.mp4'], ['json', '"file"|"src"|"sources"']]);
  await probeSnippets('homecine tabs', 'https://www3.homecine.to/pequenos-secretos',
    [['tabs', '#tab\\d|[0-9]{3,4}p - [A-Za-z]+']], 200);
  // PeliShax: página de episodio y búsqueda.
  await probe('pelishax search dune', 'https://pelishaxpro.com/search?q=dune',
    [['fichas', 'href="/movies/\\d+"|href="/series/\\d+"'], ['json', '"url"|"title"']]);
  for (const candidate of ['/series/575/1/1', '/series/575/season/1', '/episode/575/1/1', '/series/575/1']) {
    await probe('pelishax episodio', 'https://pelishaxpro.com' + candidate,
      [['servers', 'server-item|data-link'], ['episodios', 'episode|capitulo|temporada']]);
  }
}

/* Ronda 17: bundle real de FrikiSeries y detalle de episodios de PeliShax. */
async function round17() {
  await probeSnippets('friki main bundle', 'https://www.frikiserie.com/main-SNXQBTSJ.js',
    [['api hosts', 'https?://[a-z0-9.-]+\\.[a-z]{2,}(?::\\d+)?/(?:api|v1|api/v1)[a-zA-Z0-9/_-]*'],
      ['rutas api', '"/(?:api|v1)/[a-zA-Z0-9/_$\\{\\}-]+"'],
      ['json fields', '(?:video|capitulo|episodio|iframe|link|url)\\s*[:=]']], 260);
  // PeliShax: el listado de capítulos trae la URL real del episodio.
  await probeSnippets('pelishax episodios', 'https://pelishaxpro.com/series/575/1/1',
    [['episode-item', 'episode-item[\\s\\S]{0,400}'], ['links', 'href="/[a-z]+/[0-9/]+"']], 420);
  await probeSnippets('homecine serie tabs', 'https://www3.homecine.to/series/mouse',
    [['tabs', '#tab\\d|les-content|season'], ['episodios', '/episodios?/|episode|capitulo']], 240);
}

/* Ronda 18: confirmar el modelo final de las tres fuentes nuevas. */
async function round18() {
  // PeliShax: la ficha de episodio debe traer los mismos server-item.
  await probe('pelishax tv episodio', 'https://pelishaxpro.com/tv/247718/1/1',
    [['servers', 'server-item|data-link|data-lang'], ['fichas', 'href="/movies/\\d+"']]);
  // HomeCine: episodio con su lista de pestañas de idioma.
  await probe('homecine episodio', 'https://www3.homecine.to/episode/mouse-temporada-1-capitulo-1',
    [['tabs', '#tab\\d|les-content'], ['iframes', '<IFRAME[^>]*>|<iframe[^>]*>'], ['hls/mp4', '\\.m3u8|\\.mp4']]);
  // FrikiSeries: los capítulos viven en el estado de la ficha.
  await probeSnippets('friki ficha estado', 'https://www.frikiserie.com/ver-serie/marco',
    [['video', '"video"[^,]{0,200}'], ['capitulos', '"(?:capitulos|episodios|lista|videos)"[^[]{0,80}'],
      ['okru', 'ok\\.ru[^"\\\s]{0,60}']], 300);
  // ¿Se puede resolver un embed de OK.ru a un enlace directo?
  await probe('okru embed', 'https://ok.ru/videoembed/14398744169198',
    [['hls/mp4', '\\.m3u8|\\.mp4'], ['json', '"videoUrl"|"hlsMasterPlaylistUrl"|"metadata"']]);
}

/* Ronda 19: ¿qué publica el embed de OK.ru? FrikiSeries solo enlaza ese host. */
async function round19() {
  for (const id of ['14398744169198', '14600894483182']) {
    await probeSnippets('okru ' + id, 'https://ok.ru/videoembed/' + id, [
      ['mp4/m3u8', 'https?(?:%3A|:)?(?:%2F|/){2}[^"\\\s]{10,220}\\.(?:mp4|m3u8)[^"\\\s]{0,120}'],
      ['metadata', '"metadata"|"videoUrl"|"videos"|"hls"|"playlist"'],
      ['flashvars', 'flashvars|data-options|data-video|options='],
      ['mp4 literal', '[a-z0-9_.-]+\\.(?:mp4|m3u8)']
    ], 300);
  }
  // La API pública de VK/OK para un vídeo por id (si existe) evita el HTML.
  for (const candidate of [
    'https://ok.ru/dk?cmd=videoPlayerMetadata&mid=14398744169198',
    'https://vk.com/video_ext.php?oid=&id=14398744169198'
  ]) {
    await probe('okru api', candidate, [['json', '.*'], ['mp4', '\\.mp4']]);
  }
}

/* Ronda 20: ¿cómo responde el buscador de PeliShax y sus fichas por id? */
async function round20() {
  await probeSnippets('pelishax search', 'https://pelishaxpro.com/search?q=The+Dark+Knight', [
    ['movies links', 'href="/movies/[0-9]+"[^>]*>'],
    ['cards', 'movie-card|card-title|search-result|class="[^"]*item[^"]*"'],
    ['total', 'result|Total|no se encontr'],
    ['forms', '<form[^>]*>|name="q"']
  ], 240);
  await probe('pelishax movie 155', 'https://pelishaxpro.com/movies/155', [['title', '<title>[^<]*'], ['servers', 'server-item']]);
  await probe('pelishax movie 155 ddg', 'https://pelishaxpro.com/movies/155/the-dark-knight', [['title', '<title>[^<]*'], ['servers', 'server-item']]);
}

/* Ronda 21: qué publican los hosts de PeliShax (StreamWish, Filemoon, VidHide)
 * y si el embed de OK.ru es el que sí trae enlaces. */
async function round21() {
  await probeSnippets('streamwish embed', 'https://streamwish.to/e/6dz22bl4exq4', [
    ['eval/packer', 'eval\\(function\\(p,a,c,k,e'], ['m3u8/mp4', '\\.m3u8|\\.mp4'],
    ['sources', 'sources\\s*[:=]|file\\s*[:=]'], ['scripts', '<script[^>]*src="[^"]+"']
  ], 260);
  await probeSnippets('filemoon embed', 'https://filemoon.sx/e/d02q4wt2b80n', [
    ['eval/packer', 'eval\\(function\\(p,a,c,k,e'], ['m3u8/mp4', '\\.m3u8|\\.mp4'],
    ['sources', 'sources\\s*[:=]|file\\s*[:=]'], ['api', '\\/api\\/|\\/dl\\?']
  ], 260);
  await probeSnippets('vidhide embed', 'https://vidhidevip.com/v/7edm3v3ca7mf', [
    ['eval/packer', 'eval\\(function\\(p,a,c,k,e'], ['m3u8/mp4', '\\.m3u8|\\.mp4'], ['sources', 'sources\\s*[:=]']
  ], 260);
  await probeSnippets('okru video page', 'https://ok.ru/video/7652106504857', [
    ['m3u8', 'video\\.m3u8|\\.mp4'], ['videoembed link', 'videoembed/[0-9]+']
  ], 200);
}

/* Ronda 22: StreamWish por su API interna y el packer de VidHide ya descomprimido. */
async function round22() {
  await probeSnippets('streamwish main.js', 'https://streamwish.to/main.js?v=1.1.9',
    [['api', '\\/dl\\?[^"\'`]{0,80}|op=embed|file_code'], ['fetch', 'fetch\\([^)]{0,120}'], ['eval', 'eval\\(|atob\\(']], 220);
  for (const u of ['https://streamwish.to/dl?op=embed&file_code=6dz22bl4exq4&referer=',
                   'https://streamwish.to/dl?op=view&file_code=6dz22bl4exq4']) {
    await probeSnippets('streamwish dl', u, [['m3u8/mp4', '\\.m3u8|\\.mp4'], ['packer', 'eval\\(function\\(p,a,c,k,e']], 300);
  }
  await probeSnippets('vidhide packed', 'https://vidhidevip.com/v/7edm3v3ca7mf',
    [['url en tabla', 'https?[^"\'\\s]{0,120}\\.(?:m3u8|mp4)'], ['file', 'm3u8|master\\.']], 400);
}

/* Ronda 23: hosts con packer. Se usa la lista blanca del addon en vez de
 * extraer funciones sueltas: un recorte por índice rompe las expresiones. */
async function round23() {
  const { loadUnpack } = require('./unpack-helper');
  const unpack = loadUnpack();
  if (!unpack) { console.log('===== unpack\nno se pudo cargar el descompresor'); return; }
  for (const url of ['https://vidhidevip.com/v/7edm3v3ca7mf', 'https://filemoon.sx/e/d02q4wt2b80n',
    'https://streamwish.to/e/6dz22bl4exq4']) {
    let out = '';
    let status = 0;
    try {
      const res = await fetchRaw(url);
      status = res.status;
      out = unpack(res.text || '') || '';
    } catch (e) { out = ''; }
    console.log('===== unpack ' + url);
    console.log('status=' + status + ' descomprimido=' + out.length);
    const media = out.match(/https?:[^"'\\s]{10,220}\.(?:m3u8|mp4)[^"'\\s]{0,120}/g) || [];
    console.log('--- media:\n' + (media.length ? media.slice(0, 6).map((u) => '   ' + u).join('\n') : '   (sin coincidencias)'));
  }
}

/* Ronda 24: el selector de idiomas de KatDrama. ¿De dónde sale «Latino»? */
async function round24() {
  const page = 'https://k-drama.in/watch/tv/n-a-117376-episode-1';
  await probe('kd selector idioma', page, [
    ['switchServer', "switchServer\\([^)]{0,160}"],
    ['botones', "<button[^>]{0,200}switchServer[\\s\\S]{0,260}?</button>"],
    ['idiomas', 'idioma|language|doblaje|audio|latino|castellano|subtitulado'],
    ['select/option', '<select[\\s\\S]{0,500}?</select>|<option[^>]*>[^<]{0,40}'],
    ['data attrs', 'data-(?:lang|language|audio|dub|server)[a-z-]*="[^"]{0,40}"']
  ]);
  await probe('kd ficha idioma', 'https://k-drama.in/detail/tv/vincenzo-117376', [
    ['idiomas', 'idioma|language|doblaje|audio|latino|castellano|subtitulado'],
    ['select/option', '<select[\\s\\S]{0,500}?</select>|<option[^>]*>[^<]{0,40}'],
    ['botones', '<button[^>]{0,160}>[^<]{0,40}</button>']
  ]);
  await probe('kd player lang', 'https://k-drama.in/tubi2.php?id=117376&s=1&e=1',
    [['idioma', 'latino|castellano|subtitulado'], ['switchServer', 'switchServer[^)]{0,120}']]);
}

/* Ronda 25: doramaslatinox.com — estructura de fichas, episodios y reproductores. */
async function round25() {
  const B = 'https://doramaslatinox.com';
  await probeSnippets('dlx serie', B + '/series/gift/', [
    ['temporadas', 'Temporada|season|episodios|episode'],
    ['episodios', 'href="[^"]*/episodio/[^"]+"'],
    ['servidores', 'server-item|data-link|data-lang|dooplay_player|playeroptions'],
    ['tmdb', 'themoviedb|tmdb[^0-9]{0,6}[0-9]+']
  ], 300);
  await probeSnippets('dlx episodio', B + '/episodio/gift-1x2-episodio-2/', [
    ['servidores', 'server-item|data-link|data-lang|dooplay_player_option|data-nume|data-post'],
    ['iframes', '<iframe[^>]{0,200}>'],
    ['script opts', 'var\s+\w*\s*=\s*\\{["\']|sources\s*[:=]|file\s*[:=]'],
    ['hls', '\\.m3u8|\\.mp4'],
    ['idioma', 'latino|castellano|subtitulado']
  ], 300);
  await probeSnippets('dlx pelicula', B + '/peliculas/un-poco-de-compania-antes-de-morir/', [
    ['servidores', 'server-item|data-link|data-lang|dooplay_player_option|data-nume'],
    ['iframes', '<iframe[^>]{0,200}>'], ['hls', '\\.m3u8|\\.mp4']
  ], 300);
  await probeSnippets('dlx busqueda', B + '/?s=gift', [
    ['resultados', 'result-item|href="[^"]*/(series|peliculas)/[^"]+"'],
    ['forms', 'name="s"|action="[^"]*"']
  ], 250);
  await probeSnippets('dlx ajax', B + '/wp-admin/admin-ajax.php?action=doo_player_ajax&post=0&nume=1&type=tv', [
    ['json', '.*']
  ], 200);
}

/* Ronda 26: el AJAX de DooPlay de doramaslatinox devuelve el embed real. */
async function round26() {
  const B = 'https://doramaslatinox.com';
  for (const nume of [1, 2, 3]) {
    await probeSnippets('dlx ajax tv ' + nume,
      B + '/wp-admin/admin-ajax.php?action=doo_player_ajax&post=43619&nume=' + nume + '&type=tv',
      [['json', '.*']], 300);
  }
  await probeSnippets('dlx ajax movie 43611',
    B + '/wp-admin/admin-ajax.php?action=doo_player_ajax&post=43611&nume=1&type=movie',
    [['json', '.*']], 300);
  // ¿El slug del episodio resuelve por id de TMDB? y ¿qué hosts usa?
  await probeSnippets('dlx home hosts', B + '/', [['hosts', 'https?://[a-z0-9.-]+/(?:embed|e|v|player)/']], 200);
}

/* Ronda 27: ¿qué necesita el AJAX de DooPlay de doramaslatinox? */
async function round27() {
  const B = 'https://doramaslatinox.com';
  const page = B + '/episodio/gift-1x2-episodio-2/';
  await probeSnippets('dlx episodio nonce', page, [
    ['nonce', 'nonce["\']?\\s*[:=]\\s*["\'][a-z0-9]+'],
    ['doo ajax ref', 'doo_player_ajax[^"\']{0,120}'],
    ['player js', 'src="[^"]*(?:player|dooplay|ajax)[^"]*\\.js[^"]*"'],
    ['data attrs', "data-(?:post|nume|type|nonce)=['\"][^'\"]{0,30}"],
    ['scripts inline', 'ajaxurl|admin-ajax']
  ], 300);
  for (const extra of ['', '&nonce=b963428b95']) {
    await probeSnippets('dlx ajax nonce' + (extra ? ' si' : ' no'),
      B + '/wp-admin/admin-ajax.php?action=doo_player_ajax&post=43619&nume=1&type=tv' + extra,
      [['json', '.*']], 300);
  }
  // El JS del tema dice cómo pide los reproductores.
  await probeSnippets('dlx dooplay js', B + '/wp-content/themes/NIVEL-DIOSSSSSSSSS/assets/js/dooplay.js', [['ajax', 'doo_player_ajax[\s\S]{0,200}']], 300);
}

async function playersRaw() {
  const targets = [
    ['homecine película', 'https://www3.homecine.to/pequenos-secretos'],
    ['frikiserie serie', 'https://www.frikiserie.com/ver-serie/los-caballeros-del-zodiaco-1986'],
    ['pelishax película', 'https://pelishaxpro.com/movies/5084']
  ];
  for (const [name, url] of targets) {
    await probeSnippets(name + ' data-*', url,
      [['data', 'data-[a-z-]+="[^"]{4,200}"'], ['iframe', '<iframe[^>]{0,300}'],
        ['video', '<video[^>]{0,200}|<source[^>]{0,200}'], ['m3u8', 'm3u8|\\.mp4'],
        ['onclick', 'onclick="[^"]{4,200}"']], 300);
  }
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
  if (only === 'all' || only === 'round11') await round11();
  if (only === 'all' || only === 'round12') await round12();
  if (only === 'all' || only === 'round13') await round13();
  if (only === 'all' || only === 'round14') await round14();
  if (only === 'all' || only === 'kdesa') await kdesa();
  if (only === 'all' || only === 'homecine') await homecine();
  if (only === 'all' || only === 'frikiserie') await frikiserie();
  if (only === 'all' || only === 'pelishax') await pelishax();
  if (only === 'all' || only === 'players') await playersRaw();
  if (only === 'all' || only === 'friki-state') await frikiState();
  if (only === 'all' || only === 'round16') await round16();
  if (only === 'all' || only === 'round17') await round17();
  if (only === 'all' || only === 'round18') await round18();
  if (only === 'all' || only === 'round19') await round19();
  if (only === 'all' || only === 'round20') await round20();
  if (only === 'all' || only === 'round21') await round21();
  if (only === 'all' || only === 'round22') await round22();
  if (only === 'all' || only === 'round23') await round23();
  if (only === 'all' || only === 'round24') await round24();
  // Solo esta ronda: útil mientras se investiga un sitio concreto.
  else if (only === 'round24only') await round24();
  if (only === 'doramaslatinox' || only === 'dlx') { await round25(); await round26(); }
  if (only === 'dlx26') await round26();
  if (only === 'dlx27') await round27();
}

if (require.main === module) {
  main().catch(error => { console.error(error && error.stack || error); process.exitCode = 1; });
}

module.exports = { probe, interesting };
