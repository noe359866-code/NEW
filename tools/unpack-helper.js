'use strict';

/* Carga el descompresor P.A.C.K.E.R del addon reutilizando el propio bundle de
 * un provider ya compilado: así la sonda usa exactamente el mismo código que
 * el addon, sin recortar funciones por índice (eso rompe las expresiones). */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadUnpack() {
  const file = path.join(__dirname, '..', 'providers', 'homecine.js');
  if (!fs.existsSync(file)) return null;
  const code = fs.readFileSync(file, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports,
    console: { log() {}, info() {}, warn() {}, error() {} },
    fetch: async () => new Response('', { status: 404 }),
    TMDB_API_KEY: '', SCRAPER_SETTINGS: {},
    require: () => { throw new Error('no'); },
    URL, URLSearchParams, TextDecoder, TextEncoder, AbortController,
    setTimeout, clearTimeout, Promise, Uint8Array, Date, JSON, Math, RegExp,
    Error, isFinite, parseInt, parseFloat, decodeURIComponent, encodeURIComponent
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox); } catch { return null; }
  // El bundle no exporta helpers internos: se recompila solo la sección de
  // descompresión a partir del fuente que sí los declara en ámbito global.
  try {
    const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', '00-util.js'), 'utf8')
      + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'core', '70-direct.js'), 'utf8');
    const clean = core.replace(/module\.exports[\s\S]*$/, '');
    const box = { console, URL, decodeURIComponent, String, RegExp, parseInt };
    box.globalThis = box;
    vm.createContext(box);
    vm.runInContext(clean + '\n;globalThis.__unpack = unpackPlayerScript;', box, { timeout: 5000 });
    return typeof box.__unpack === 'function' ? box.__unpack : null;
  } catch { return null; }
}

module.exports = { loadUnpack };
