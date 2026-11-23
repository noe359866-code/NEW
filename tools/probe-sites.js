#!/usr/bin/env node
/**
 * Sonda de reconocimiento: descarga el HTML crudo de las fuentes candidatas y
 * muestra solo las líneas relacionadas con reproductores y búsqueda.
 *
 * Se ejecuta a mano (GitHub Actions, workflow_dispatch), no en CI: sirve para
 * mantener los selectores cuando un sitio cambia. No reproduce ni descarga
 * medios y no envía datos de usuario.
 *
 * Uso: node tools/probe-sites.js [pelis24|fuegocine|all]
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

async function main() {
  const only = (process.argv[2] || 'all').toLowerCase();
  const playerPatterns = [
    ['iframe/embed', 'iframe|<embed|data-src|data-url|embed_url|data-link'],
    ['servers/ajax', 'servidor|server|ajax|api/|player|reproductor'],
    ['json-inline', '"link"|"url"|"file"|"embed"|"server"']
  ];

  if (only === 'all' || only === 'pelis24') {
    await probe('pelis24 search', 'https://ww1.pelis24.blog/search?q=interstellar', playerPatterns);
    await probe('pelis24 detail', 'https://ww1.pelis24.blog/pelicula/interestelar-2014', playerPatterns);
  }
  if (only === 'all' || only === 'fuegocine12') {
    await probe('fc ficha tmdb', 'https://fuegocine.com/shows/details/avatar-la-leyenda-de-aang/33',
      [['tmdb', 'tmdb|moviedb'], ['año', '<h1|year|release']]);
    await probe('fc excelastic inglés', 'https://fuegocine.com/search_elastic?s=avatar%20the%20last%20airbender',
      [['resultados', 'details|alt=']]);
  }
  if (only === 'all' || only === 'fuegocine11') {
    // Catálogo: cómo se llama el sitio a los títulos populares (para el matcher).
    for (const page of [1, 2, 3]) {
      await probe('fc catálogo', 'https://fuegocine.com/movies?page=' + page,
        [['fichas', 'details/.*title=|details/']]);
    }
    await probe('fc catálogo series', 'https://fuegocine.com/shows?page=1', [['fichas', 'details/']]);
  }
  if (only === 'all' || only === 'fuegocine10') {
    for (const q of ['interstellar', 'interestelar', 'shingeki', 'breaking%20bad', 'dune']) {
      await probe('fc excelastic ' + q, 'https://fuegocine.com/search_elastic?s=' + q,
        [['resultados', 'details|alt=']]);
    }
  }
  if (only === 'all' || only === 'fuegocine9') {
    for (const url of [
      'https://vimeos.unlimplay.com/?id=213375',
      'https://vimeos.unlimplay.com/?id=213375&s=1&e=2',
      'https://vimeos.unlimplay.com/?id=213375&season=1&episode=2',
      'https://vimeos.unlimplay.com/?tmdb=213375&season=1&episode=2'
    ]) {
      await probe('ulp tv', url, [['json', '.*']]);
    }
  }
  if (only === 'all' || only === 'fuegocine8') {
    await probe('fc episodio', 'https://fuegocine.com/shows/visionquest/01x02-teseo/50',
      [['iframe', 'iframe'], ['watch', 'watch'], ['temporada', 'temporada|season']]);
    await probe('fc detalles show', 'https://fuegocine.com/shows/details/visionquest/24',
      [['temporadas', 'seasons/'], ['episodios', '\\dx\\d']]);
  }
  if (only === 'all' || only === 'fuegocine7') {
    for (const q of ['odisea', 'la%20odisea', 'visionquest']) {
      await probe('fc search_elastic ' + q, 'https://fuegocine.com/search_elastic?s=' + q,
        [['resultados', 'details|title|poster']]);
    }
    await probe('fc search_elastic POST', 'https://fuegocine.com/search_elastic?s=odisea',
      [['resultados', 'details']]);
  }
  if (only === 'all' || only === 'fuegocine6') {
    await probe('fc showSuggestions', 'https://fuegocine.com/',
      [['funcion', 'showSuggestions'], ['rutas', 'suggest|autocomplete|search_|ajax']]);
  }
  if (only === 'all' || only === 'fuegocine5') {
    await probe('fc search error', 'https://fuegocine.com/search?s=odisea',
      [['error', 'ErrorException|Undefined|Exception:']]);
    await probe('fc movies page2', 'https://fuegocine.com/movies?page=2',
      [['detalles', 'details\\/(\\d+)"|pagination|/movies\\?page']]);
    await probe('fc form', 'https://fuegocine.com/',
      [['navbar-form', 'navbar-form|</form>|name="|action=']]);
    await probe('fc api', 'https://fuegocine.com/api/movies',
      [['json', '.*']]);
  }
  if (only === 'all' || only === 'fuegocine4') {
    await probe('fc show watch', 'https://fuegocine.com/shows/watch/visionquest/24',
      [['iframe', 'iframe'], ['episodios', 'data-path|episode|Episodio']]);
    await probe('fc sitemap', 'https://fuegocine.com/sitemap.xml', [['urls', 'movies/details|shows/details']]);
    await probe('fc season raw', 'https://fuegocine.com/shows/visionquest/seasons/temporada-1/55',
      [['data-path', 'data-path'], ['links', '/shows/watch|<a ']]);
    await probe('fc search post-like', 'https://fuegocine.com/search?s=la%20odisea&type=movie',
      [['resultados', '/movies/details|/shows/details']]);
  }
  if (only === 'all' || only === 'fuegocine3') {
    await probe('fc search', 'https://fuegocine.com/search?s=odisea',
      [['tarjetas', '/movies/details|/shows/details|title=']]);
    await probe('fc series temporada', 'https://fuegocine.com/shows/visionquest/seasons/temporada-1/55',
      [['episodios', 'watch|episode|Episodio|capítulo|capitulo|data-']]);
    await probe('fc abyss', 'https://player.abyssplayer.com/KxBGoCWcV',
      [['claves', '"|sources|file|m3u8|mp4|url']]);
    await probe('fc unlimplay api', 'https://vimeos.unlimplay.com/?id=1368337',
      [['json', '.*']]);
    await probe('fc unlimplay embed', 'https://unlimplay.com/f/embed/movie/1368337',
      [['finalizePlayer', 'finalizePlayer|mf\.php|vimeos']]);
  }
  if (only === 'all' || only === 'fuegocine2') {
    // Formulario de búsqueda real y episodios de una temporada.
    await probe('fuegocine home/form', 'https://fuegocine.com/', [['formularios', '<form|name=\"(?:search|q)\"|action=']]);
    await probe('fuegocine temporada', 'https://fuegocine.com/shows/visionquest/seasons/temporada-1/55',
      [['episodios', '/shows/watch|/episodes/|Episodio|Episode']]);
    // ¿Los reproductores embebidos exponen HLS directo?
    for (const [name, url] of [
      ['videro', 'https://videro.my/e/ueuf2z2cltcp6sw'],
      ['abyssplayer', 'https://player.abyssplayer.com/KxBGoCWcV'],
      ['unlimplay', 'https://unlimplay.com/f/embed/movie/1368337']
    ]) {
      await probe('embed ' + name, url, [
        ['m3u8/mp4', '\.m3u8|\.mp4|hls|playlist'],
        ['config js', 'sources|file|videoUrl|stream|eval\(']
      ]);
    }
    for (const candidate of ['/movies?keyword=odisea', '/search?query=odisea', '/movies?title=odisea',
      '/api/movies?search=odisea', '/movies?search=la+odisea']) {
      await probe('fuegocine búsqueda 2', 'https://fuegocine.com' + candidate,
        [['status', 'HTTP']]);
    }
  }
  if (only === 'all' || only === 'fuegocine') {
    await probe('fuegocine watch', 'https://fuegocine.com/movies/watch/la-odisea/227', playerPatterns);
    await probe('fuegocine show', 'https://fuegocine.com/shows/details/visionquest/24', [
      ['temporadas/episodios', 'season|episode|temporada|capitulo'],
      ['watch links', '/shows/watch']
    ]);
    for (const candidate of ['/movies?search=odisea', '/movies?q=odisea', '/movies?keyword=odisea',
      '/movies?title=odisea', '/api/search?q=odisea', '/search/odisea']) {
      await probe('fuegocine búsqueda', 'https://fuegocine.com' + candidate,
        [['status/resultados', '/movies/details|/shows/details']]);
    }
  }
}

main().catch(error => { console.error(error); process.exit(1); });
