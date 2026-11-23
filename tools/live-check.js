#!/usr/bin/env node
/** Comprueba los bundles VOD contra los sitios, sin descargar medios. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { safeFetch } = require('../addon/fetch');
const { PROVIDERS } = require('../addon/vod');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = { type: 'movie', season: null, episode: null };
  const fields = new Set(['--site', '--type', '--id', '--season', '--episode', '--settings', '--title', '--year', '--season-counts']);
  // --trace imprime cada petición real: sirve para ver dónde se corta una fuente.
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--all') args.all = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--trace') args.trace = true;
    else if (fields.has(token)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Falta el valor de ${token}`);
      const value = argv[++i];
      if (token === '--season' || token === '--episode') args[token.slice(2)] = Number(value);
      else if (token === '--settings') args.settings = JSON.parse(value);
      else if (token === '--season-counts') args.seasonCounts = value.split(',').map(Number);
      else args[token.slice(2)] = value;
    } else throw new Error(`Opción desconocida: ${token}`);
  }
  return args;
}

function validateArgs(args) {
  if (args.help) return;
  if (!args.id || (!args.site && !args.all) || (args.site && args.all)) throw new Error('Indica --id y exactamente uno de --site o --all');
  if (!/^(?:\d+|tmdb[:_-]\d+|tt\d{5,})$/i.test(args.id)) throw new Error('--id debe ser un identificador TMDB o IMDb');
  if (!['movie', 'tv'].includes(args.type)) throw new Error('--type debe ser movie o tv');
  if (args.type === 'tv' && (!Number.isInteger(args.season) || args.season < 1 || !Number.isInteger(args.episode) || args.episode < 1)) {
    throw new Error('Para TV indica --season y --episode, enteros mayores que cero');
  }
  if (args.settings && (typeof args.settings !== 'object' || Array.isArray(args.settings))) throw new Error('--settings debe ser un objeto JSON');
  if (args.seasonCounts && args.seasonCounts.some(count => !Number.isInteger(count) || count < 1)) throw new Error('--season-counts debe ser una lista de enteros positivos');
}

function usage() {
  console.log(`Uso:
  node tools/live-check.js --site flixlatam --id 157336 --type movie
  node tools/live-check.js --site latanime --id 37854 --type tv --season 1 --episode 1
  node tools/live-check.js --site cineplus123 --id 157336 --type movie --title "Interstellar" --year 2014
  node tools/live-check.js --site kdrama --id 117376 --type tv --season 1 --episode 1 --title "Vincenzo" --year 2021
  node tools/live-check.js --site framextv --id 155 --type movie --title "The Dark Knight" --year 2008
  node tools/live-check.js --all --id 157336 --title "Interstellar"

--site flixlatam|latanime|cineplus123|kdrama|framextv|fuegocine|tioanime
                              proveedor; --all prueba todos
--settings '{"maxResults":"4"}'  ajustes de Nuvio
--title "Título"             simula los metadatos TMDB/IMDb, no el sitio
--year 2014                  año para la simulación de metadatos
--season-counts 12,10        episodios previos por temporada (con --title)
--trace                      imprime cada petición real (para depurar una fuente)
TMDB_API_KEY                 clave de TMDB; sin ella se intenta la web pública

La herramienta analiza páginas y muestra enlaces hallados; no solicita ni
verifica las playlists, segmentos o vídeos, y no demuestra reproducción.`);
}

function tmdbStubFetch(title, year, type, fetcher, seasonCounts = []) {
  return async (url, init) => {
    const target = new URL(String(url));
    if (target.hostname === 'v3-cinemeta.strem.io') {
      return new Response(JSON.stringify({ meta: { name: title, original_name: title, type: type === 'tv' ? 'series' : 'movie', year: year || '' } }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    if (target.hostname === 'api.themoviedb.org') {
      const date = year ? `${year}-01-01` : '';
      const payload = type === 'tv'
        ? { name: title, original_name: title, first_air_date: date,
            seasons: seasonCounts.map((count, index) => ({ season_number: index + 1, episode_count: count })) }
        : { title, original_title: title, release_date: date };
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return fetcher(url, init);
  };
}

function loadProvider(id, { settings = {}, fetcher, tmdbKey = '' } = {}) {
  const file = path.join(ROOT, 'providers', `${id}.js`);
  const code = fs.readFileSync(file, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports, console,
    fetch: fetcher || safeFetch,
    TMDB_API_KEY: tmdbKey,
    SCRAPER_SETTINGS: settings,
    require(name) {
      if (name === 'crypto-js') return require('crypto-js');
      throw new Error('Módulo no permitido en Nuvio: ' + name);
    },
    URL, URLSearchParams, TextDecoder, TextEncoder, AbortController,
    setTimeout, clearTimeout, Promise, Uint8Array, Date, JSON, Math, RegExp,
    Error, isFinite, parseInt, parseFloat, decodeURIComponent, encodeURIComponent
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return module.exports;
}

function displayUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin + parsed.pathname + (parsed.search ? '?[oculto]' : '');
  } catch { return '[URL inválida]'; }
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try { args = parseArgs(argv); validateArgs(args); } catch (error) {
    console.error('Error:', error.message); usage(); return 1;
  }
  if (args.help) { usage(); return 0; }

  if (args.title) console.log('Metadatos simulados; las peticiones al sitio y los reproductores son reales.');
  else if (!process.env.TMDB_API_KEY && !/^tt/i.test(args.id)) console.warn('Sin TMDB_API_KEY: se intentará obtener el título desde la web pública de TMDB.');

  const targets = args.all ? PROVIDERS : [args.site];
  if (targets.some(id => !PROVIDERS.includes(id))) {
    console.error('El proveedor no existe en el addon.'); return 1;
  }

  let connectionFailed = false;
  for (const id of targets) {
    const stats = { requests: 0, success: 0, failures: 0 };
    const networkFetch = async (url, init) => {
      stats.requests++;
      const label = String(url).replace(/[?#].*$/, '').slice(0, 150);
      try {
        const response = await safeFetch(url, init);
        if (response.ok || (response.status >= 300 && response.status < 400)) stats.success++;
        else stats.failures++;
        if (args.trace) console.log(`  · ${response.status} ${label}`);
        return response;
      } catch (error) {
        stats.failures++;
        if (args.trace) console.log(`  · ERR ${label} (${error && error.message})`);
        throw error;
      }
    };
    const fetcher = args.title ? tmdbStubFetch(args.title, args.year, args.type, networkFetch, args.seasonCounts) : networkFetch;
    const provider = loadProvider(id, { settings: args.settings, fetcher, tmdbKey: args.title ? 'metadatos-simulados' : (process.env.TMDB_API_KEY || '') });
    const started = Date.now();
    const streams = await provider.getStreams(args.id, args.type, args.season, args.episode);
    console.log(`\n${id}: ${streams.length} enlace(s), ${Date.now() - started} ms; peticiones reales: ${stats.requests}, fallidas: ${stats.failures}`);
    for (const stream of streams.slice(0, 6)) {
      console.log(`  [${stream.quality}] ${stream.title}\n  ${displayUrl(stream.url)}`);
    }
    if (!streams.length) console.log('  Sin enlaces: puede ser red, título no encontrado, protección o reproductor no compatible.');
    if (stats.requests && !stats.success && stats.failures) connectionFailed = true;
  }
  console.log('\nNo se han probado ni descargado los medios.');
  return connectionFailed ? 1 : 0;
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { parseArgs, validateArgs, tmdbStubFetch, loadProvider, displayUrl, main };
