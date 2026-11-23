#!/usr/bin/env node
/**
 * Comprueba un provider que NO está en la lista activa del addon.
 *
 * `tools/live-check.js` solo acepta los IDs de `PROVIDERS`; este lanzador
 * reutiliza su cargador y sus metadatos simulados para poder revisar una
 * fuente retirada (por ejemplo FlixLatam) sin volver a activarla.
 *
 * Uso: node tools/check-provider.js <provider> <id> <movie|tv> --title "Título" --year 2014 --trace
 *      --query "otro título" busca con un nombre distinto al de los metadatos.
 */
'use strict';

const path = require('node:path');
const { loadProvider, tmdbStubFetch } = require('./live-check');
const { safeFetch } = require('../addon/fetch');

function parse(argv) {
  const args = { id: argv[1], type: argv[2] || 'movie', season: null, episode: null, options: {} };
  for (let i = 3; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--trace') { args.options.trace = true; continue; }
    if (token === '--season' || token === '--episode') { args[token.slice(2)] = Number(argv[++i]); continue; }
    if (token === '--title') { args.options.title = argv[++i]; continue; }
    if (token === '--year') { args.options.year = argv[++i]; continue; }
    if (token === '--season-counts') { args.options.seasonCounts = argv[++i].split(',').map(Number); continue; }
    if (token === '--dump-page') { args.options.dumpPage = argv[++i]; continue; }
    // Permite un título distinto al del ID para forzar una búsqueda concreta.
    if (token === '--query') { args.options.query = argv[++i]; continue; }
    if (token === '--settings') { args.options.settings = JSON.parse(argv[++i]); continue; }
    throw new Error('Opción desconocida: ' + token);
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const site = argv[0];
  if (!site) { console.error('Uso: node tools/check-provider.js <provider> <id> <movie|tv> [opciones]'); return 1; }
  const args = parse(argv);
  // Diagnóstico: guarda el HTML de una URL concreta (ficha o reproductor) para
  // revisar qué publica el sitio sin depender de la salida del proveedor.
  if (args.options.dumpPage) {
    const res = await safeFetch(args.options.dumpPage, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131' } });
    const html = await res.text();
    console.log(`===== volcado ${args.options.dumpPage} (${res.status}, ${html.length} bytes)`);
    const marks = /(?:<iframe|<video|<source|data-player|data-url|file\s*:|sources\s*:|"file"|m3u8)/gi;
    let match;
    const seen = new Set();
    while ((match = marks.exec(html)) && seen.size < 12) {
      const start = Math.max(0, match.index - 90);
      const chunk = html.slice(start, match.index + 260).replace(/\s+/g, ' ');
      if (seen.has(chunk.slice(0, 60))) continue;
      seen.add(chunk.slice(0, 60));
      console.log('  · ' + chunk);
    }
    return 0;
  }
  const stats = { requests: 0, success: 0, failures: 0 };
  const networkFetch = async (url, init) => {
    stats.requests++;
    const label = String(url).replace(/[?#].*$/, '').slice(0, 150);
    const response = await safeFetch(url, init);
    if (response.ok || (response.status >= 300 && response.status < 400)) stats.success++;
    else stats.failures++;
    if (args.options.trace) console.log(`  · ${response.status} ${label}`);
    return response;
  };
  const fetcher = args.options.title
    ? tmdbStubFetch(args.options.query || args.options.title, args.options.year, args.type, networkFetch, args.options.seasonCounts || [])
    : networkFetch;
  const provider = loadProvider(site, { settings: args.options.settings || {}, fetcher,
    tmdbKey: args.options.title ? 'metadatos-simulados' : (process.env.TMDB_API_KEY || '') });
  const started = Date.now();
  const streams = await provider.getStreams(args.id, args.type, args.season, args.episode);
  console.log(`\n${site}: ${streams.length} enlace(s), ${Date.now() - started} ms; peticiones reales: ${stats.requests}, fallidas: ${stats.failures}`);
  for (const stream of streams.slice(0, 8)) {
    console.log(`  [${stream.quality}] ${stream.title}\n  ${String(stream.url).replace(/[?#].*$/, '')}${/[?#]/.test(stream.url) ? '?[oculto]' : ''}`);
  }
  if (!streams.length) console.log('  Sin enlaces: puede ser red, título no encontrado, protección o reproductor no compatible.');
  console.log('\nNo se han probado ni descargado los medios.');
  return 0;
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { parse, main };
