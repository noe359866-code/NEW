'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

/** Carga un provider compilado dentro de un contexto tipo QuickJS. */
function loadProvider(id, options = {}) {
  const file = path.join(ROOT, 'providers', `${id}.js`);
  const code = fs.readFileSync(file, 'utf8');
  const module = { exports: {} };

  const sandbox = {
    module,
    exports: module.exports,
    console: options.quiet === false ? console : { log() {}, info() {}, warn() {}, error() {} },
    fetch: options.fetch,
    TMDB_API_KEY: options.tmdbKey || 'test-key',
    SCRAPER_SETTINGS: options.settings || {},
    URL,
    URLSearchParams,
    TextDecoder,
    TextEncoder,
    AbortController,
    setTimeout,
    clearTimeout,
    CryptoJS: options.cryptoJs,
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

function response(body, options = {}) {
  const text = Buffer.isBuffer(body) ? body.toString('binary') : String(body == null ? '' : body);
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(text);
  return {
    ok: options.status == null || options.status < 400,
    status: options.status || 200,
    url: options.url,
    headers: { get: () => null },
    text: async () => text,
    json: async () => JSON.parse(text),
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

/**
 * Router de fetch falso.
 * routes: [[RegExp|string, body|function(url, init)]]
 */
function mockFetch(routes, options = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, method: init.method || 'GET', body: init.body, headers: init.headers || {} });
    for (const [matcher, handler] of routes) {
      const matches = typeof matcher === 'string' ? target.indexOf(matcher) !== -1 : matcher.test(target);
      if (!matches) continue;
      const value = typeof handler === 'function' ? await handler(target, init) : handler;
      if (value == null) continue;
      if (value.__binary) return response(value.bytes, { url: target });
      if (typeof value === 'object' && value.__json) return response(JSON.stringify(value.__json), { url: target });
      return response(value, { url: target });
    }
    if (options.fallback) return options.fallback(target, init);
    return response('', { status: 404, url: target });
  };
  fn.calls = calls;
  return fn;
}

/** Construye un .torrent mínimo válido (bencode) y devuelve bytes + infohash. */
function makeTorrent(name = 'Nebula.Test.1080p.mkv', length = 123456789, announce = 'udp://tracker.example:1337') {
  const pieceLength = 16384;
  const pieces = crypto.createHash('sha1').update(String(name)).digest().toString('binary');
  const info = `d6:lengthi${length}e4:name${Buffer.byteLength(name)}:${name}12:piece lengthi${pieceLength}e6:pieces20:${pieces}e`;
  const torrent = `d8:announce${Buffer.byteLength(announce)}:${announce}4:info${info}e`;
  const bytes = Buffer.from(torrent, 'binary');
  const infoBytes = Buffer.from(info, 'binary');
  return {
    bytes,
    name,
    length,
    infoHash: crypto.createHash('sha1').update(infoBytes).digest('hex')
  };
}

function tmdbMovie(id, title, year = '2026') {
  return {
    __json: {
      id: Number(id),
      title,
      original_title: title,
      release_date: `${year}-01-15`,
      imdb_id: 'tt0000001'
    }
  };
}

function tmdbTv(id, name, year = '2022') {
  return {
    __json: {
      id: Number(id),
      name,
      original_name: name,
      first_air_date: `${year}-02-04`
    }
  };
}

module.exports = {
  ROOT,
  loadProvider,
  mockFetch,
  response,
  makeTorrent,
  tmdbMovie,
  tmdbTv
};
