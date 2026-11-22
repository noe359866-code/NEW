'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { safeFetch } = require('./fetch');
const { mediaUrl, safeUrl, isAdvertisementUrl } = require('../sports/http');

const PROVIDERS = ['flixlatam', 'latanime', 'cineplus123'];
const TIME_BUDGET_MS = 30000;
const REQUEST_BUDGET = 96;
const PROVIDER_REQUEST_BUDGET = 32;
const scripts = new Map();

// Solo se ejecutan los bundles propios del repositorio, no scripts descargados
// de los sitios. Un contexto nuevo por provider/solicitud aísla sus cookies.
function loadProvider(id, { fetcher = safeFetch, tmdbKey = '', settings = {}, onStream = () => {} } = {}) {
  if (!PROVIDERS.includes(id)) throw new Error('Provider desconocido');
  if (!scripts.has(id)) {
    const file = path.join(__dirname, '..', 'providers', id + '.js');
    scripts.set(id, new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }));
  }
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports,
    // No registrar las consultas de los usuarios, tokens ni claves de API.
    console: { log() {}, info() {}, warn() {}, error() {} },
    fetch: fetcher, TMDB_API_KEY: String(tmdbKey || ''), SCRAPER_SETTINGS: settings,
    HOSTED_MAX_POW_MS: 1500,
    HOSTED_SHA256_HEX: value => createHash('sha256').update(value, 'utf8').digest('hex'),
    // Permite conservar medios ya resueltos si otro reproductor se agota.
    HOSTED_PUBLISH_STREAM: onStream,
    require(name) {
      if (name === 'crypto-js') return require('crypto-js');
      throw new Error('Módulo no permitido');
    },
    URL, URLSearchParams, TextDecoder, TextEncoder, AbortController,
    setTimeout, clearTimeout, Promise, Uint8Array, Date, JSON, Math, RegExp,
    Error, isFinite, parseInt, parseFloat, decodeURIComponent, encodeURIComponent
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  scripts.get(id).runInContext(sandbox, { timeout: 2000 });
  if (typeof module.exports.getStreams !== 'function') throw new Error('Provider inválido');
  return module.exports;
}

/** Acepta el ID completo de Stremio/Nuvio, no una URL ni un título libre. */
function parseVodId(type, id) {
  const kind = String(type || '').toLowerCase();
  if (!['movie', 'series', 'tv'].includes(kind)) return null;
  const match = /^(tt\d{5,12}|tmdb[:_-][1-9]\d{0,11}|[1-9]\d{0,11})(?::(\d{1,4}):(\d{1,4}))?$/i.exec(String(id || ''));
  if (!match) return null;
  const episodic = kind !== 'movie';
  if (!episodic && match[2] != null) return null;
  if (episodic && (match[2] == null || Number(match[2]) < 1 || Number(match[3]) < 1)) return null;
  return {
    id: match[1].toLowerCase(),
    type: episodic ? 'series' : 'movie',
    season: episodic ? Number(match[2]) : null,
    episode: episodic ? Number(match[3]) : null
  };
}

function streamHeaders(raw) {
  const names = { referer: 'Referer', origin: 'Origin', 'user-agent': 'User-Agent', cookie: 'Cookie' };
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, value] of Object.entries(raw)) {
    const lower = String(key).toLowerCase();
    if (!Object.hasOwn(names, lower) || typeof value !== 'string' || !value || value.length > 8192 || /[\r\n\0]/.test(value)) continue;
    if ((lower === 'referer' || lower === 'origin') && !safeUrl(value)) continue;
    result[names[lower]] = value;
  }
  return result;
}

function streamSubtitles(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  const seen = new Set();
  for (const sub of raw.slice(0, 20)) {
    if (!sub || typeof sub !== 'object' || typeof sub.url !== 'string' || sub.url.length > 8192) continue;
    const url = safeUrl(sub.url);
    const lang = typeof sub.lang === 'string' ? sub.lang.trim().slice(0, 40) : '';
    if (!url || isAdvertisementUrl(url) || !/\.(?:vtt|srt|ass|ssa)$/i.test(new URL(url).pathname) || !lang || /[\x00-\x1f\x7f]/.test(lang)) continue;
    const key = url + '\n' + lang;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = typeof sub.id === 'string' && sub.id && sub.id.length <= 100 && !/[\x00-\x1f\x7f]/.test(sub.id)
      ? sub.id : 'subtitle-' + (result.length + 1);
    const value = { id, url, lang };
    if (typeof sub.label === 'string' && sub.label && !/[\x00-\x1f\x7f]/.test(sub.label)) value.label = sub.label.slice(0, 80);
    result.push(value);
  }
  return result;
}

/** Convierte tanto resultados VOD como deportivos al objeto Stream de Stremio. */
function toStremioStream(item) {
  if (!item || typeof item !== 'object') return null;
  const url = mediaUrl(item.url);
  if (!url || isAdvertisementUrl(url)) return null;
  const source = String(item.name || item.provider || 'Fuente').slice(0, 100);
  const quality = typeof item.quality === 'string' && /^(?:2160p|1080p|720p|576p|480p)$/i.test(item.quality)
    ? ' · ' + item.quality : '';
  const name = `Nébula · ${source}${quality}`;
  const title = [String(item.title || source).slice(0, 300), typeof item.language === 'string' ? item.language.slice(0, 40) : '']
    .filter(Boolean).join(' · ');
  const hints = { notWebReady: true };
  const headers = streamHeaders(item.headers);
  if (Object.keys(headers).length) hints.proxyHeaders = { request: headers };
  const stream = { name, title, description: title, url, behaviorHints: hints };
  const subtitles = streamSubtitles(item.subtitles);
  if (subtitles.length) stream.subtitles = subtitles;
  return stream;
}

function budgetFetcher(fetcher, signal, maxRequests) {
  let count = 0;
  function consume() {
    if (signal.aborted || ++count > maxRequests) throw new Error('Presupuesto de búsqueda agotado');
  }
  return (url, init = {}) => {
    try { consume(); } catch (error) { return Promise.reject(error); }
    const combined = init.signal ? AbortSignal.any([signal, init.signal]) : signal;
    const previousRedirect = init.onRedirectRequest;
    return fetcher(url, {
      ...init, signal: combined,
      // safeFetch cuenta también cada redirección que abre otro socket. Las
      // capas global y por fuente se encadenan en esta misma comprobación.
      onRedirectRequest() {
        if (typeof previousRedirect === 'function') previousRedirect();
        consume();
      }
    });
  };
}

async function runVod(parsed, {
  fetcher = safeFetch, tmdbKey = '', timeout = TIME_BUDGET_MS,
  maxRequests = REQUEST_BUDGET, settings = {}
} = {}) {
  const controller = new AbortController();
  const fetch = budgetFetcher(fetcher, controller.signal, maxRequests);
  const groups = PROVIDERS.map(() => []);
  const tasks = PROVIDERS.map(async (id, index) => {
    try {
      // Limitar cada fuente además del presupuesto global evita que una sola
      // agote las solicitudes de las demás cuando sus reproductores fallan.
      const scopedFetch = budgetFetcher(fetch, controller.signal, Math.min(PROVIDER_REQUEST_BUDGET, maxRequests));
      const provider = loadProvider(id, {
        fetcher: scopedFetch, tmdbKey, settings,
        onStream(stream) {
          // Se filtra y deduplica al convertir a Stremio, igual que el resultado
          // final. El límite también evita que una fuente crezca sin control.
          if (!controller.signal.aborted && stream && groups[index].length < 20) groups[index].push(stream);
        }
      });
      const streams = await provider.getStreams(parsed.id, parsed.type, parsed.season, parsed.episode);
      if (!controller.signal.aborted && Array.isArray(streams) && streams.length) groups[index] = streams;
    } catch { /* una fuente caída no cancela la otra */ }
  });
  let timer;
  try {
    await Promise.race([
      Promise.all(tasks),
      new Promise(resolve => { timer = setTimeout(resolve, timeout); })
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  const result = [];
  const seen = new Set();
  for (const group of groups) {
    for (const raw of group) {
      const stream = toStremioStream(raw);
      if (!stream) continue;
      // El mismo medio puede necesitar cabeceras diferentes según el origen.
      const key = stream.url + '\n' + JSON.stringify(stream.behaviorHints.proxyHeaders || {});
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(stream);
    }
  }
  return result;
}

function createVodResolver(options = {}) {
  const pending = new Map();
  return function resolve(type, id) {
    const parsed = parseVodId(type, id);
    if (!parsed) return Promise.resolve([]);
    const key = [parsed.type, parsed.id, parsed.season, parsed.episode].join('|');
    if (pending.has(key)) return pending.get(key);
    // Solo se comparten búsquedas simultáneas: los enlaces pueden caducar.
    const job = runVod(parsed, options).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  };
}

module.exports = { PROVIDERS, TIME_BUDGET_MS, REQUEST_BUDGET, PROVIDER_REQUEST_BUDGET, loadProvider, parseVodId, streamHeaders, toStremioStream, budgetFetcher, runVod, createVodResolver };
