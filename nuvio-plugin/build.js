#!/usr/bin/env node
/**
 * Empaquetador de los providers de Nuvio.
 *
 * Nuvio descarga UN archivo por scraper y lo ejecuta en QuickJS dentro de un
 * IIFE, con `module` disponible. Por eso cada provider se genera como un
 * único archivo CommonJS autocontenido: se concatenan los módulos de
 * src/core/ en orden y se injertan en src/providers/<id>.js.
 *
 * Uso: node build.js [id...]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CORE_DIR = path.join(ROOT, 'src', 'core');
const PROVIDER_DIR = path.join(ROOT, 'src', 'providers');
const OUT_DIR = path.join(ROOT, 'providers');
const MANIFEST = path.join(ROOT, 'manifest.json');
const MARKER = '/*__CORE__*/';

function readCore() {
  return fs.readdirSync(CORE_DIR)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => {
      const file = path.join(CORE_DIR, name);
      return `/* ===== core/${name} ===== */\n${fs.readFileSync(file, 'utf8').trim()}\n`;
    })
    .join('\n');
}

function providerFiles(only) {
  return fs.readdirSync(PROVIDER_DIR)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => !only.length || only.includes(path.basename(name, '.js')))
    .sort();
}

function build() {
  const only = process.argv.slice(2);
  const core = readCore();
  const files = providerFiles(only);
  if (!files.length) {
    console.error('No hay providers que compilar.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const built = [];

  for (const file of files) {
    const id = path.basename(file, '.js');
    const source = fs.readFileSync(path.join(PROVIDER_DIR, file), 'utf8');
    if (!source.includes(MARKER)) {
      console.error(`✗ ${id}: falta el marcador ${MARKER}`);
      process.exit(1);
    }

    const body = source.replace(MARKER, core);
    const output = [
      '/* ------------------------------------------------------------------',
      ` * Nébula Scrapers · ${id}`,
      ' * Generado por build.js a partir de src/core + src/providers.',
      ` * ${new Date().toISOString().slice(0, 10)} · no editar a mano.`,
      ' * ------------------------------------------------------------------ */',
      '(function () {',
      "'use strict';",
      body,
      '})();',
      ''
    ].join('\n');

    const target = path.join(OUT_DIR, `${id}.js`);
    fs.writeFileSync(target, output, 'utf8');
    built.push({ id, bytes: Buffer.byteLength(output) });
  }

  buildCoreBundle(core);
  validateManifest(built);

  for (const item of built) {
    const kb = (item.bytes / 1024).toFixed(1);
    console.log(`✓ providers/${item.id}.js  ${kb} KB`);
  }
}

/**
 * Bundle auxiliar solo para tests: expone las funciones internas del core.
 * Se genera en tests/.build (ignorado por git y por Nuvio).
 */
function buildCoreBundle(core) {
  const dir = path.join(ROOT, 'tests', '.build');
  fs.mkdirSync(dir, { recursive: true });
  const exported = [
    'norm', 'tokenize', 'significantTokens', 'titleScore', 'decodeEntities', 'stripTags', 'attrOf',
    'absoluteUrl', 'parseQuality', 'qualityRank', 'parseSize', 'formatSize', 'parseYear',
    'parseSeasonEpisode', 'seasonCode', 'episodeCode', 'seasonEpisodeLabel', 'matchesEpisode',
    'uniqueBy', 'sortByQuality', 'b64ToBytes', 'bytesToB64', 'bytesToText', 'bytesToHex',
    'utf8ToBytes', 'rot13', 'settings',
    'request', 'getText', 'getBytes', 'getJson', 'postForm', 'postJson', 'pickHost', 'metaContent',
    'sha1Bytes', 'sha256Bytes', 'sha256Hex', 'sha1Hex',
    'parseTorrent', 'buildMagnet', 'infoHashFromMagnet', 'magnetName',
    'resolveMedia', 'searchQueries', 'cleanContentId',
    'makeStream', 'finalizeStreams', 'torrentToMagnet', 'mapLimit', 'languageLabel',
    'decodeShortLink', 'decodeShortLinkOrUrl', 'createDonEngine',
    'looksLikeTorrentBytes', 'findDownloadLinks', 'findInfoHashes', 'mimeLooksTorrent',
    'resolveTorrentOrMagnet', 'originOf'
  ];
  const source = [
    "'use strict';",
    core,
    `module.exports = { ${exported.join(', ')} };`,
    ''
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'core.cjs'), source, 'utf8');
}

function validateManifest(built) {
  if (!fs.existsSync(MANIFEST)) return;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const ids = new Set();
  const errors = [];

  if (!manifest.name || !manifest.version) errors.push('manifest: faltan name/version');
  if (!Array.isArray(manifest.scrapers) || !manifest.scrapers.length) errors.push('manifest: scrapers vacío');

  for (const scraper of manifest.scrapers || []) {
    if (!scraper.id) errors.push('scraper sin id');
    if (ids.has(scraper.id)) errors.push(`id duplicado: ${scraper.id}`);
    ids.add(scraper.id);
    for (const field of ['name', 'version', 'filename']) {
      if (!scraper[field]) errors.push(`${scraper.id}: falta ${field}`);
    }
    if (scraper.filename && !scraper.filename.startsWith('http')) {
      const target = path.join(ROOT, scraper.filename);
      if (!fs.existsSync(target)) errors.push(`${scraper.id}: no existe ${scraper.filename} (compila antes)`);
      else if (fs.statSync(target).size > 5 * 1024 * 1024) errors.push(`${scraper.id}: supera 5 MB`);
    }
  }

  if (errors.length) {
    console.error('\nManifest inválido:');
    for (const error of errors) console.error(' - ' + error);
    process.exit(1);
  }
  console.log(`✓ manifest.json  ${manifest.scrapers.length} scrapers`);
}

build();
