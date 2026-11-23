'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { safeFetch } = require('./fetch');
const { mediaUrl, safeUrl, isAdvertisementUrl } = require('../sports/http');

// FlixLatam queda fuera de la lista por decisión del usuario (Embed69 devuelve
// 403 a las IP del servidor y su PoW ya no es fiable). Sigue en el repositorio.
// Solo fuentes que sirven en español: se retiraron TioAnime (japonés
// subtitulado), KatDrama (hindi/inglés/original) y frameXTV (multi/inglés).
const PROVIDERS = ['fuegocine', 'latanime', 'cineplus123', 'pelishax', 'homecine', 'frikiserie', 'doramaslatinox'];
const TIME_BUDGET_MS = 30000;
// Stremio y Nuvio abandonan la petición mucho antes que nuestro presupuesto:
// si se tarda más, el cliente muestra «sin fuentes» aunque el addon sí tenga
// enlaces. Por eso la respuesta se cierra a tiempo y se entrega lo ya resuelto.
const CLIENT_BUDGET_MS = 9000;
// Lo que falte se termina en segundo plano para dejarlo listo (y memorizado)
// en la siguiente petición del mismo título sin volver a empezar de cero.
const BACKGROUND_BUDGET_MS = 25000;
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

/** ¿El enlace está en español? Misma regla que `isSpanishAudio` del core. */
function isSpanishAudio(label) {
  const value = String(label || '');
  if (!value) return true;
  if (/^Multi/i.test(value)) return true;
  if (/^(?:Latino|Espa(?:n|ñ)ol|Castellano)/i.test(value)) return true;
  if (/Subtitulado/i.test(value) && !/\b(?:english|ingles|inglés|hindi|portugu)/i.test(value)) return true;
  return false;
}

function hostOf(url) {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

/**
 * ¿El enlace necesita que el cliente reescriba cabeceras para poder reproducirse?
 * Un CDN que solo entrega segmentos no las necesita: mandarle `Referer` de otro
 * host no aporta nada y, si el cliente no proxya, estorba. Se consideran
 * «protegidos» los reproductores y los CDN que exigen referer propio.
 */
const GUARDED_HOSTS = [
  'fastream.to', 'ok.ru', 'okcdn.ru', 'vkuser.net', 'vk.com', 'vimeos.zip',
  'unlimplay.com', 'vidara.to', 'vidmoly.biz', 'vidmoly.to', 'filemoon.sx',
  'streamwish.to', 'vidhidevip.com', 'streamtape.com', 'yourupload.com', 'vidcache.net'
];

function needsProxy(url, headers) {
  const host = hostOf(url);
  if (!host) return false;
  if (GUARDED_HOSTS.some(guarded => host === guarded || host.endsWith('.' + guarded))) return true;
  // Un `Referer` que apunta al mismo host del vídeo casi siempre es obligatorio.
  for (const value of [headers.Referer, headers.Origin]) {
    if (!value) continue;
    const refHost = hostOf(value);
    if (refHost && (refHost === host || host.endsWith('.' + refHost) || refHost.endsWith('.' + host))) return true;
  }
  return false;
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
  // Solo español: si la fuente declara un idioma que no es español y no lleva
  // subtítulos en español, el enlace no se muestra. Las opciones sin etiqueta
  // pasan (cada fuente ya decidió qué sirve) para no vaciar fuentes que no
  // declaran idioma.
  if (!isSpanishAudio(item.language)) return null;
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
  if (Object.keys(headers).length) {
    hints.proxyHeaders = { request: headers };
    // Nuvio mantiene además su propia clave; se envía igual para que el
    // reproductor reciba el Referer aunque el cliente solo lea una de las dos.
    hints.headers = { ...headers };
    // Stremio Web y los clientes sin proxy ignoran estas cabeceras: sin
    // proxy el vídeo no arranca, así que se pide explícitamente. Solo cuando
    // el enlace realmente las necesita, para no romper los que sí van en web.
    if (needsProxy(url, headers)) hints.notWebReady = true;
  }
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

/**
 * Resuelve las fuentes de un título repartiendo la espera en dos plazos:
 *  - `deadline`: cuándo se cierra la respuesta HTTP (presupuesto del cliente).
 *  - `hardDeadline`: cuándo se deja de trabajar aunque ya nadie espere.
 * Lo resuelto antes del primer plazo se devuelve tal cual; lo que llegue
 * después se guarda en `cache` para que la siguiente petición sea instantánea.
 */
async function runVod(parsed, {
  fetcher = safeFetch, tmdbKey = '', timeout = CLIENT_BUDGET_MS,
  maxRequests = REQUEST_BUDGET, settings = {}, cache = null,
  backgroundTimeout = BACKGROUND_BUDGET_MS
} = {}) {
  // Un ID de serie sin episodio solo identifica el título: no hay nada que
  // resolver y evita abrir fichas de temporadas completas.
  if (parsed.incomplete) return [];

  const startedAt = Date.now();
  const controller = new AbortController();
  const fetch = budgetFetcher(fetcher, controller.signal, maxRequests);
  const groups = PROVIDERS.map(() => []);
  const finished = new Array(PROVIDERS.length).fill(false);

  const toStremio = () => {
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
  };

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
    } catch { /* una fuente caída no cancela la otra */ } finally {
      finished[index] = true;
    }
  });
  // Nadie debe quedar esperando a la fuente más lenta: cada task resuelve
  // siempre porque sus errores se capturan arriba.
  const all = Promise.all(tasks);

  let clientTimer;
  try {
    await Promise.race([
      all,
      new Promise(resolve => { clientTimer = setTimeout(resolve, timeout); })
    ]);
  } finally {
    clearTimeout(clientTimer);
  }

  const partial = toStremio();
  const pendingSources = finished.filter(done => !done).length;
  // Se responde ya con lo que haya; el resto continúa en segundo plano y, al
  // terminar, alimenta la memoria para la próxima petición del mismo título.
  if (pendingSources) {
    const hardTimer = setTimeout(() => controller.abort(), Math.max(0, backgroundTimeout));
    if (hardTimer.unref) hardTimer.unref();
    const settled = all.then(() => {
      clearTimeout(hardTimer);
      const complete = toStremio();
      if (cache) cache.setComplete(parsed, complete);
      return complete;
    }).catch(() => {
      clearTimeout(hardTimer);
      return partial;
    });
    // La siguiente petición espera a esta misma resolución en vez de repetirla.
    if (cache) cache.setPending(parsed, { promise: settled, partial });
    return partial;
  }

  const complete = toStremio();
  if (cache) cache.setComplete(parsed, complete);
  return complete;
}

/**
 * Memoria breve por título. La primera petición puede salir incompleta (el
 * cliente no espera); la siguiente del mismo título recibe lo ya resuelto al
 * instante y, si aún no estaba completo, espera el resto.
 */
function createStreamCache({ ttlMs = 10 * 60 * 1000, pendingTtlMs = 2 * 60 * 1000, now = Date.now } = {}) {
  const complete = new Map();
  const pending = new Map();
  const keyOf = parsed => [parsed.type, parsed.id, parsed.season, parsed.episode].join('|');
  const fresh = (entry, ttl) => entry && now() - entry.at < ttl;

  function prune() {
    const current = now();
    for (const [key, entry] of complete) if (current - entry.at >= ttlMs) complete.delete(key);
    for (const [key, entry] of pending) if (current - entry.at >= pendingTtlMs) pending.delete(key);
  }

  return {
    keyOf,
    getComplete(parsed) {
      const entry = complete.get(keyOf(parsed));
      return fresh(entry, ttlMs) ? entry.streams : null;
    },
    setComplete(parsed, streams) {
      const key = keyOf(parsed);
      if (!Array.isArray(streams) || !streams.length) return;
      complete.set(key, { at: now(), streams });
      pending.delete(key);
      prune();
    },
    getPending(parsed) {
      const entry = pending.get(keyOf(parsed));
      return fresh(entry, pendingTtlMs) ? entry : null;
    },
    setPending(parsed, job) {
      pending.set(keyOf(parsed), { at: now(), ...job });
      prune();
    },
    clear() { complete.clear(); pending.clear(); }
  };
}

function createVodResolver(options = {}) {
  const pending = new Map();
  const cache = options.cache || createStreamCache(options.cacheOptions);
  return function resolve(type, id) {
    // parseVodId acepta IMDb, TMDB (con prefijo o número) y los IDs de anime
    // que usan los clientes (kitsu, mal, anilist, anidb) y TVDB.
    const parsed = parseVodId(type, id);
    if (!parsed || parsed.incomplete) return Promise.resolve([]);

    // Un resultado completo reciente evita volver a golpear los sitios.
    const cached = cache.getComplete(parsed);
    if (cached) return Promise.resolve(cached);

    const key = [parsed.type, parsed.id, parsed.season, parsed.episode].join('|');
    if (pending.has(key)) return pending.get(key);

    // Hay una resolución en curso que ya devolvió lo parcial: esta segunda
    // petición sí puede esperar un poco más para completar la lista.
    const running = cache.getPending(parsed);
    const timeout = running ? CLIENT_BUDGET_MS * 2 : CLIENT_BUDGET_MS;
    // Solo se comparten búsquedas simultáneas: los enlaces pueden caducar.
    const job = (running && running.promise ? running.promise : runVod(parsed, {
      ...options, cache, timeout
    })).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  };
}

module.exports = { PROVIDERS, TIME_BUDGET_MS, CLIENT_BUDGET_MS, BACKGROUND_BUDGET_MS, REQUEST_BUDGET, PROVIDER_REQUEST_BUDGET, loadProvider, parseVodId, streamHeaders, toStremioStream, budgetFetcher, runVod, createStreamCache, createVodResolver };
