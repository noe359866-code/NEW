'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

/** Carga el bundle como lo hace Nuvio, sin APIs de Node en el sandbox. */
function loadProvider(id, options = {}) {
  const code = fs.readFileSync(path.join(ROOT, 'providers', `${id}.js`), 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports,
    console: options.quiet === false ? console : { log() {}, info() {}, warn() {}, error() {} },
    fetch: options.fetch, TMDB_API_KEY: options.tmdbKey || 'test-key',
    SCRAPER_SETTINGS: options.settings || {},
    require: name => {
      if (name === 'crypto-js') return require('crypto-js');
      throw new Error('Módulo no permitido: ' + name);
    },
    URL: options.URL || URL, URLSearchParams, TextDecoder, TextEncoder, AbortController,
    setTimeout, clearTimeout, Promise, Uint8Array, Date, JSON, Math, RegExp, Error,
    isFinite, parseInt, parseFloat, decodeURIComponent, encodeURIComponent
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: `${id}.js` });
  return module.exports;
}

function response(body, options = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body == null ? '' : body));
  const status = options.status == null ? 200 : options.status;
  const headers = Object.fromEntries(Object.entries(options.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300, status, url: options.url,
    headers: { get: name => headers[String(name).toLowerCase()] || null },
    text: async () => buffer.toString('utf8'),
    json: async () => JSON.parse(buffer.toString('utf8')),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function mockFetch(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, method: init.method || 'GET', headers: init.headers || {}, redirect: init.redirect });
    for (const [matcher, handler] of routes) {
      const matches = typeof matcher === 'string' ? target.includes(matcher) : matcher.test(target);
      if (!matches) continue;
      const value = typeof handler === 'function' ? await handler(target, init) : handler;
      if (value == null) continue;
      if (value.__response) return response(value.body || '', { ...value.__response, url: value.__response.url || target });
      if (value.__json) return response(JSON.stringify(value.__json), { url: target });
      return response(value, { url: target });
    }
    return response('', { status: 404, url: target });
  };
  fetch.calls = calls;
  return fetch;
}

// Emula las propiedades simples del polyfill URL de NuvioTV: asignar search
// o hash no modifica href, y username/password no están disponibles.
class NuvioURL {
  constructor(value, base) {
    let full = String(value);
    if (base && !/^https?:\/\//i.test(full)) {
      const b = typeof base === 'string' ? base : base.href;
      if (full.charAt(0) === '/') {
        const origin = /^(https?:\/\/[^/]+)/.exec(b);
        full = origin ? origin[1] + full : full;
      } else full = b.replace(/\/[^/]*$/, '/') + full;
    }
    const url = new URL(full);
    this.href = full;
    for (const key of ['protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash', 'origin', 'searchParams']) this[key] = url[key];
  }
  toString() { return this.href; }
}

function tmdbMovie(id, title, year = '2014') {
  return { __json: { id: Number(id), title, original_title: title, release_date: `${year}-01-01`, imdb_id: 'tt0816692' } };
}
function tmdbTv(id, name, year = '2017', seasons = []) {
  return { __json: { id: Number(id), name, original_name: name, first_air_date: `${year}-01-01`, seasons } };
}

module.exports = { ROOT, loadProvider, mockFetch, response, tmdbMovie, tmdbTv, NuvioURL };
