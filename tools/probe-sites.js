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
  if (only === 'all' || only === 'fuegocine') {
    await probe('fuegocine home', 'https://fuegocine.com/', playerPatterns);
    await probe('fuegocine watch', 'https://fuegocine.com/movies/watch/la-odisea/227', playerPatterns);
    for (const candidate of ['/search?q=odisea', '/movies?search=odisea', '/search/movie?q=odisea', '/movies?q=odisea']) {
      await probe('fuegocine búsqueda', 'https://fuegocine.com' + candidate, [['resultados', '/movies/details|/shows/details']]);
    }
  }
}

main().catch(error => { console.error(error); process.exit(1); });
