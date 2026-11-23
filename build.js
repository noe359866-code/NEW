#!/usr/bin/env node
/**
 * Empaquetador de los providers internos del addon.
 *
 * Cada provider se genera como un único archivo CommonJS autocontenido: se
 * concatenan los módulos de src/core/ y se injertan en src/providers/<id>.js.
 * El servidor ejecuta los bundles para resolver las fuentes VOD.
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
  validateManifest();

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
    'norm', 'tokenize', 'titleScore', 'decodeEntities', 'stripTags', 'attrOf', 'absoluteUrl',
    'parseQuality', 'qualityRank', 'parseYear', 'parseSeasonEpisode', 'seasonEpisodeLabel',
    'b64ToBytes', 'bytesToB64', 'bytesToText', 'utf8ToBytes', 'settings', 'sha256Hex',
    'resolveMedia', 'searchQueries', 'cleanContentId', 'makeStream', 'finalizeStreams', 'mapLimit',
    'languageLabel', 'unescapePlayerText', 'publicHttpUrl', 'directMediaUrl', 'findDirectMedia',
    'unpackPlayerScript', 'pagePlayerLinks', 'embed69Links', 'solvePlayerPow', 'resolveDirectPlayers',
    'normalizeContentId', 'contentIdLabel', 'resolveRequestMedia', 'resolveAnimeMedia', 'wikidataLookup', 'aniZipLookup', 'getTextLimited', 'isSeriesLikeType',
    'solvePlayerPowHex', 'blockedObserver', 'imdbSlugTitle', 'cinemetaRequest', 'webResult', 'slugTitle',
    'languageOf', 'languageLabel', 'languageRank', 'sortByQuality', 'uniqueBy'
  ];
  const source = [
    "'use strict';",
    core,
    `module.exports = { ${exported.join(', ')} };`,
    ''
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'core.cjs'), source, 'utf8');
}

function validateManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const errors = [];
  const types = new Set(manifest.types || []);
  const resources = new Set((manifest.resources || []).map(item => typeof item === 'string' ? item : item.name));
  const ids = new Set();

  if (!manifest.id || !manifest.name || !manifest.version || !manifest.description) errors.push('faltan id, name, version o description');
  for (const resource of ['catalog', 'meta', 'stream']) if (!resources.has(resource)) errors.push('falta resource: ' + resource);
  if (!Array.isArray(manifest.catalogs) || !manifest.catalogs.length) errors.push('no hay catálogos');
  for (const catalog of manifest.catalogs || []) {
    if (!catalog.id || !catalog.name || !types.has(catalog.type)) errors.push('catálogo inválido: ' + catalog.id);
    if (ids.has(catalog.id)) errors.push('catálogo duplicado: ' + catalog.id);
    ids.add(catalog.id);
  }
  for (const id of ['flixlatam', 'latanime', 'cineplus123']) {
    const target = path.join(OUT_DIR, id + '.js');
    if (!fs.existsSync(target)) errors.push('falta el provider interno: ' + id);
    else if (fs.statSync(target).size > 5 * 1024 * 1024) errors.push('provider demasiado grande: ' + id);
  }

  if (errors.length) {
    console.error('\nManifest inválido:');
    for (const error of errors) console.error(' - ' + error);
    process.exit(1);
  }
  console.log(`✓ manifest.json  ${manifest.catalogs.length} catálogos del addon`);
}

build();
