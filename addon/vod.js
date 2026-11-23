'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { safeFetch } = require('./fetch');
const { mediaUrl, safeUrl, isAdvertisementUrl } = require('../sports/http');

// FlixLatam queda fuera de la lista por decisión del usuario (Embed69 devuelve
// 403 a las IP del servidor y su PoW ya no es fiable). Sigue en el repositorio.
const PROVIDERS = ['tioanime', 'fuegocine', 'kdrama', 'framextv', 'latanime', 'cineplus123'];
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
  if (!['movie', 'series', 'tv', 'anime'].includes(kind)) return null;
  const raw = String(id || '').trim();
  if (!raw || raw.length > 200 || /[\/\\?#@\s]/.test(raw)) return null;
  const episodic = kind !== 'movie';

  // El ID de contenido puede llevar prefijo con «:» (tmdb:1399) y después la
  // temporada y el episodio: el prefijo se comprueba antes de partir por «:».
  let contentId = '';
  let rest = '';
  // El lookahead no puede solaparse con el grupo que consume el separador.
  const prefixed = /^(tt\d{5,12}|(?:(?:tmdb|tvdb|kitsu|mal|anilist|anidb)[:_-][1-9][0-9]{0,8}))(?=$|:)/i.exec(raw);
  if (prefixed) {
    contentId = prefixed[1].toLowerCase();
    rest = raw.slice(prefixed[0].length);
  } else {
    const numeric = /^([1-9]\d{0,8})(?=$|:)/.exec(raw);
    if (!numeric) return null;
    contentId = numeric[1];
    rest = raw.slice(numeric[0].length);
  }
  const tail = rest ? rest.slice(1).split(':') : [];

  if (!episodic) {
    if (tail.length) return null;
    return { id: contentId, type: 'movie', season: null, episode: null };
  }
  // Un ID sin temporada/episodio identifica el título completo, pero no
  // permite pedir fuentes: sin episodio no se adivina qué capítulo es.
  if (!tail.length) return { id: contentId, type: 'series', season: null, episode: null, incomplete: true };
  if (tail.length !== 2) return null;
  const season = Number(tail[0]);
  const episode = Number(tail[1]);
  if (!Number.isInteger(season) || !Number.isInteger(episode)) return null;
  if (season < 1 || season > 999 || episode < 1 || episode > 9999) return null;
  return { id: contentId, type: 'series', season, episode };
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
  // El idioma se rotula en el nombre para verlo sin abrir el detalle: Nuvio y
  // Stremio muestran `name` en la lista de opciones y `title`/`description` al
  // desplegarla. Solo se aceptan las etiquetas que produce el addon.
  const language = typeof item.language === 'string' && /^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,30}$/.test(item.language.trim())
    ? item.language.trim().slice(0, 30) : '';
  const quality = typeof item.quality === 'string' && /^(?:2160p|1080p|720p|576p|480p)$/i.test(item.quality)
    ? ' · ' + item.quality : '';
  const name = `Nébula · ${source}${quality}${language ? ' · ' + language : ''}`;
  const title = [String(item.title || source).slice(0, 300), language]
    .filter(Boolean).join(' · ');
  // `notWebReady` quitaba la reproducción web sin aportar nada al reproductor
  // nativo. `bingeGroup` conserva el mismo reproductor en el episodio siguiente
  // y `filename` alimenta las insignias de calidad de Nuvio.
  const hints = {};
  const binges = [];
  const group = item.bingeGroup || source.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (Array.isArray(group)) binges.push(...group);
  else if (typeof group === 'string') binges.push(group);
  // Nuvio acepta una lista: la primera entrada decide el reproductor.
  if (binges.length && binges.length <= 4 && binges.every(value => typeof value === 'string' && /^[a-z0-9._:-]{1,80}$/i.test(value))) {
    hints.bingeGroup = binges.length === 1 ? binges[0] : binges;
  }
  if (typeof item.filename === 'string' && item.filename && item.filename.length <= 200) hints.filename = item.filename;
  else if (item.quality || language) {
    // Insignias de calidad del cliente: solo leen el nombre, no el archivo.
    hints.filename = [String(item.title || source).slice(0, 120), language, item.quality].filter(Boolean).join(' ').slice(0, 200);
  }
  const headers = streamHeaders(item.headers);
  if (Object.keys(headers).length) hints.proxyHeaders = { request: headers };
  const stream = { name, title, description: title, url };
  if (Object.keys(hints).length) stream.behaviorHints = hints;
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
  // Un ID de serie sin episodio solo identifica el título: no hay nada que
  // resolver y evita abrir fichas de temporadas completas.
  if (parsed.incomplete) return [];
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
      const key = stream.url + '\n' + JSON.stringify((stream.behaviorHints && stream.behaviorHints.proxyHeaders) || {});
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
    // parseVodId acepta IMDb, TMDB (con prefijo o número) y los IDs de anime
    // que usan los clientes (kitsu, mal, anilist, anidb) y TVDB.
    const parsed = parseVodId(type, id);
    if (!parsed || parsed.incomplete) return Promise.resolve([]);
    const key = [parsed.type, parsed.id, parsed.season, parsed.episode].join('|');
    if (pending.has(key)) return pending.get(key);
    // Solo se comparten búsquedas simultáneas: los enlaces pueden caducar.
    const job = runVod(parsed, options).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  };
}

module.exports = { PROVIDERS, TIME_BUDGET_MS, REQUEST_BUDGET, PROVIDER_REQUEST_BUDGET, loadProvider, parseVodId, streamHeaders, toStremioStream, budgetFetcher, runVod, createVodResolver };
