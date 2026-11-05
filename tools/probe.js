#!/usr/bin/env node
/**
 * Sondeo en vivo de un sitio: descarga una página, dice si Cloudflare está
 * bloqueando y extrae los enlaces/magnets que ve el parser.
 *
 * Sirve para reconstruir los selectores cuando un sitio cambia, sin tener
 * que abrir el móvil:
 *
 *   node tools/probe.js https://grantorrent.fyi/peliculas/la-mangosta/
 *   node tools/probe.js "https://en.torrentgalaxy-official.is/movies?keyword=mongoose"
 *   node tools/probe.js https://www.cinecalidad.am/ver-pelicula/colision/ --full
 *
 * Con sesión de Cloudflare (copiada del navegador ya verificado):
 *
 *   CF_COOKIE='cf_clearance=…; __cf_bm=…' \
 *   UA='Mozilla/5.0 (Macintosh; …) Chrome/126' \
 *   node tools/probe.js https://grantorrent.fyi/?s=mangosta
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadCore() {
  const file = path.join(ROOT, 'tests', '.build', 'core.cjs');
  if (!fs.existsSync(file)) {
    console.error('Falta tests/.build/core.cjs. Ejecuta primero: node build.js');
    process.exit(1);
  }
  return require(file);
}

async function fetchPage(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    const text = await res.text();
    return { status: res.status, finalUrl: res.url || url, text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((arg) => !arg.startsWith('--'));
  const full = args.includes('--full');
  const save = args.includes('--save');

  if (!url) {
    console.error('Uso: node tools/probe.js <url> [--full] [--save]');
    process.exit(1);
  }

  const headers = {
    'User-Agent': process.env.UA ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6'
  };
  if (process.env.CF_COOKIE) {
    headers.Cookie = process.env.CF_COOKIE;
    headers.Referer = 'https://www.google.com/';
  }

  const core = loadCore();
  console.log(`→ ${url}\n  cookie: ${process.env.CF_COOKIE ? 'sí' : 'no'}`);

  let page;
  try {
    page = await fetchPage(url, headers);
  } catch (error) {
    console.error(`✗ red: ${error.message}`);
    process.exit(2);
  }

  console.log(`  status: ${page.status}`);
  console.log(`  final:  ${page.finalUrl}`);
  console.log(`  bytes:  ${page.text.length}`);
  console.log(`  tipo:   ${page.headers.get('content-type') || '—'}`);

  const challenged = core.isChallengeHtml(page.text);
  console.log(`  cloudflare: ${challenged ? 'DESAFÍO (bloqueado)' : 'no'}`);
  if (challenged) {
    const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page.text) || [])[1] || '—';
    console.log(`  título del desafío: ${String(title).trim().slice(0, 80)}`);
    console.log('\n  Sin una cookie cf_clearance válida el plugin devolverá [].');
    console.log('  Copia del navegador ya verificado: CF_COOKIE=\'cf_clearance=…\' (y UA si cambió).');
  }

  if (save) {
    const target = path.join(ROOT, 'tests', 'fixtures', `${Date.now()}.html`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, page.text, 'utf8');
    console.log(`  guardado: ${path.relative(ROOT, target)}`);
  }

  const cards = core.findDownloadLinks(page.text, page.finalUrl);
  const magnets = (page.text.match(/magnet:\?[^"'\s<>]+/gi) || [])
    .filter((value, index, list) => list.indexOf(value) === index);
  const torrents = (page.text.match(/https?:\/\/[^"'\s<>]+\.torrent(?:\?[^"'\s<>]*)?/gi) || [])
    .filter((value, index, list) => list.indexOf(value) === index);
  const hashes = core.findInfoHashes(page.text);

  console.log(`\n  magnets:  ${magnets.length}`);
  for (const magnet of magnets.slice(0, 5)) console.log(`    ${magnet.slice(0, 120)}`);
  console.log(`  .torrent: ${torrents.length}`);
  for (const torrent of torrents.slice(0, 5)) console.log(`    ${torrent.slice(0, 120)}`);
  console.log(`  infohashes sueltos: ${hashes.length}`);
  for (const hash of hashes.slice(0, 5)) console.log(`    ${hash}`);
  console.log(`  enlaces de descarga: ${cards.length}`);
  for (const link of cards.slice(0, 8)) console.log(`    ${link.slice(0, 120)}`);

  if (full) {
    const text = core.stripTags(page.text);
    console.log('\n--- texto plano (2000) ---');
    console.log(text.slice(0, 2000));
  }
}

main().catch((error) => {
  console.error('✗', error && error.stack ? error.stack : error);
  process.exit(1);
});
