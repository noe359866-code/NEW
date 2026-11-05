#!/usr/bin/env node
/**
 * Prueba real contra los sitios (necesita red y, idealmente, una clave TMDB).
 *
 *   TMDB_API_KEY=tu_clave node tools/live-check.js --site dontorrent --type movie --id 31199
 *   TMDB_API_KEY=tu_clave node tools/live-check.js --all --type tv --id 94997 --season 1 --episode 2
 *
 * Nuvio inyecta TMDB_API_KEY como global; aquí se toma del entorno.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = { type: 'movie', season: null, episode: null };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--all') args.all = true;
    else if (token === '--site') args.site = argv[++i];
    else if (token === '--type') args.type = argv[++i];
    else if (token === '--id') args.id = argv[++i];
    else if (token === '--season') args.season = Number(argv[++i]);
    else if (token === '--episode') args.episode = Number(argv[++i]);
    else if (token === '--settings') args.settings = JSON.parse(argv[++i]);
    else if (token === '--title') args.title = argv[++i];
    else if (token === '--year') args.year = argv[++i];
    else if (token === '--help' || token === '-h') args.help = true;
  }
  return args;
}

function usage() {
  console.log(`Uso:
  node tools/live-check.js --site <id> --id <tmdbId> [--type movie|tv] [--season N --episode N]
  node tools/live-check.js --all --id <tmdbId> [--type movie|tv]

Opciones:
  --settings '{"maxResults":"4"}'   ajustes equivalentes a SCRAPER_SETTINGS
  --title "Reacher" --year 2022     simula TMDB (útil sin TMDB_API_KEY)
Variables:
  TMDB_API_KEY   clave de TMDB (Nuvio la inyecta como global; aquí del entorno)
`);
}

function tmdbStubFetch(title, year, type) {
  return async (url, init) => {
    const target = String(url);
    if (target.includes('api.themoviedb.org')) {
      const payload = type === 'tv'
        ? { name: title, original_name: title, first_air_date: `${year || ''}-01-01`, id: 1 }
        : { title, original_title: title, release_date: `${year || ''}-01-01`, id: 1 };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (target.includes('themoviedb.org')) {
      return new Response('<html><body></body></html>', { status: 200 });
    }
    return fetch(url, init);
  };
}

function loadProvider(id, settings, stub) {
  const file = path.join(ROOT, 'providers', `${id}.js`);
  const code = fs.readFileSync(file, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    console,
    fetch: stub || ((...args) => fetch(...args)),
    TMDB_API_KEY: process.env.TMDB_API_KEY || '',
    SCRAPER_SETTINGS: settings || {},
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    AbortController,
    setTimeout,
    clearTimeout,
    Promise,
    Uint8Array,
    Date,
    JSON,
    Math,
    RegExp,
    Error,
    isFinite,
    parseInt,
    parseFloat,
    decodeURIComponent,
    encodeURIComponent
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return module.exports;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.id || (!args.site && !args.all)) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  if (!process.env.TMDB_API_KEY) {
    console.warn('⚠ Sin TMDB_API_KEY: los providers intentarán leer themoviedb.org como respaldo.\n');
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const targets = args.all
    ? manifest.scrapers.map((scraper) => scraper.id)
    : [args.site];

  for (const id of targets) {
    if (!manifest.scrapers.some((scraper) => scraper.id === id)) {
      console.error(`✗ ${id}: no está en manifest.json`);
      continue;
    }
    const stub = args.title ? tmdbStubFetch(args.title, args.year, args.type) : null;
    const provider = loadProvider(id, args.settings, stub);
    const started = Date.now();
    process.stdout.write(`→ ${id} … `);
    let streams = [];
    try {
      streams = await provider.getStreams(args.id, args.type, args.season, args.episode);
    } catch (error) {
      console.log(`ERROR ${error && error.message}`);
      continue;
    }
    const elapsed = Date.now() - started;
    console.log(`${streams.length} fuente(s) en ${elapsed} ms`);
    streams.slice(0, 6).forEach((stream, index) => {
      console.log(`   ${index + 1}. [${stream.quality}] ${stream.title}`);
      console.log(`      ${String(stream.url).slice(0, 120)}${String(stream.url).length > 120 ? '…' : ''}`);
      if (stream.infoHash) console.log(`      infohash ${stream.infoHash}`);
    });
    if (!streams.length) console.log('   (sin resultados: dominio caído, captcha o título no encontrado)');
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
