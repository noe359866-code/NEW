/* ------------------------------------------------------------------
 * Nébula Scrapers · cinecalidad
 * Generado por build.js a partir de src/core + src/providers.
 * 2026-11-05 · no editar a mano.
 * ------------------------------------------------------------------ */
(function () {
'use strict';
/* ===== core/00-util.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/util
 * Helpers de texto, normalización, calidad, tamaño y series.
 * Sin APIs de Node: solo JS estándar (QuickJS / Hermes).
 * ------------------------------------------------------------------ */

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
var PLUGIN_TAG = 'nebula-es';

function log() {
  try {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[' + PLUGIN_TAG + ']');
    if (typeof console !== 'undefined' && console.log) console.log.apply(console, args);
  } catch (e) { /* el runtime puede no tener consola */ }
}

/** Minúsculas sin acentos ni signos: "La Emperatriz Divorciada" -> "la emperatriz divorciada" */
var ACCENT_MAP = {
  'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'ā': 'a', 'ă': 'a', 'ą': 'a',
  'Á': 'A', 'À': 'A', 'Â': 'A', 'Ä': 'A', 'Ã': 'A', 'Å': 'A', 'Ā': 'A',
  'ç': 'c', 'ć': 'c', 'č': 'c', 'Ç': 'C', 'Ć': 'C', 'Č': 'C',
  'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ě': 'e', 'ę': 'e', 'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
  'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ī': 'i', 'İ': 'I', 'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
  'ñ': 'n', 'ń': 'n', 'Ñ': 'N', 'Ń': 'N',
  'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ø': 'o', 'ō': 'o', 'Ó': 'O', 'Ò': 'O', 'Ô': 'O', 'Ö': 'O', 'Õ': 'O', 'Ø': 'O',
  'š': 's', 'ś': 's', 'Š': 'S', 'Ś': 'S',
  'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ū': 'u', 'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U', 'Ū': 'U',
  'ý': 'y', 'ÿ': 'y', 'Ý': 'Y', 'Ÿ': 'Y',
  'ž': 'z', 'ź': 'z', 'ż': 'z', 'Ž': 'Z', 'Ź': 'Z', 'Ż': 'Z',
  'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'ß': 'ss', 'ł': 'l', 'Ł': 'L', 'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'TH'
};

function norm(text) {
  var s = String(text == null ? '' : text);
  if (typeof s.normalize === 'function') {
    try {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) { /* runtime sin normalize */ }
  }
  s = s.replace(/[^\u0000-\u007F]/g, function (ch) {
    return ACCENT_MAP[ch] != null ? ACCENT_MAP[ch] : ch;
  });
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  var n = norm(text);
  return n ? n.split(' ').filter(function (t) { return t.length > 1; }) : [];
}

var STOP_WORDS = 'de la el los las del y en un una unos unas por para con sin al a of the and'.split(' ');

function significantTokens(text) {
  return tokenize(text).filter(function (t) { return STOP_WORDS.indexOf(t) === -1 && !/^\d{4}$/.test(t); });
}

/** Similitud 0..1 entre un título del sitio y el título buscado. */
function titleScore(candidate, wanted) {
  var a = significantTokens(candidate);
  var b = significantTokens(wanted);
  if (!a.length || !b.length) return 0;
  var hits = 0;
  for (var i = 0; i < b.length; i++) if (a.indexOf(b[i]) !== -1) hits++;
  var coverage = hits / b.length;
  var extra = Math.max(a.length - hits, 0);
  return coverage - Math.min(extra * 0.04, 0.2);
}

function decodeEntities(text) {
  return String(text == null ? '' : text)
    .replace(/&#0*39;|&#x27;|&apos;|&rsquo;|&#8217;/gi, "'")
    .replace(/&#0*34;|&quot;|&ldquo;|&rdquo;|&#8220;|&#8221;/gi, '"')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&uuml;/gi, 'ü').replace(/&hellip;/gi, '…')
    .replace(/&#(\d+);/g, function (_, code) { return String.fromCharCode(parseInt(code, 10)); });
}

function stripTags(html) {
  return decodeEntities(String(html == null ? '' : html).replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Valor de un atributo dentro de una etiqueta HTML ya capturada. */
function attrOf(tagHtml, name) {
  var re = new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  var m = re.exec(tagHtml);
  if (!m) return null;
  return decodeEntities(m[2] != null ? m[2] : (m[3] != null ? m[3] : m[4]));
}

function absoluteUrl(href, base) {
  if (!href) return null;
  var h = String(href).trim();
  if (/^(javascript:|#|mailto:)/i.test(h)) return null;
  if (/^https?:\/\//i.test(h)) return h;
  if (h.indexOf('//') === 0) return 'https:' + h;
  try {
    if (typeof URL === 'function') return new URL(h, base).href;
  } catch (e) { /* cae al manual */ }
  var origin = String(base).replace(/^(https?:\/\/[^/]+).*$/i, '$1');
  var path = String(base).replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '');
  if (h.charAt(0) === '/') return origin + h;
  var dir = path.replace(/[^/]*$/, '');
  return origin + dir + h;
}

/* ----------------------------- calidad ----------------------------- */

var QUALITY_RULES = [
  { re: /(2160p?|4k|uhd|4k-hdr|4kwebrip)/i, label: '2160p' },
  { re: /(1080p?|fullhd|full-hd|bdremux|bluray-1080)/i, label: '1080p' },
  { re: /(720p?)/i, label: '720p' },
  { re: /(576p?)/i, label: '576p' },
  { re: /(480p?)/i, label: '480p' },
  { re: /(hdrip|bdrip|brrip|webrip|web-dl|webdl|bluray|microhd|hdts|dvdrip|dvd-r|dvdr|hdtv|screener|camrip)/i, label: 'SD' }
];

function parseQuality(text) {
  var s = String(text == null ? '' : text);
  for (var i = 0; i < QUALITY_RULES.length; i++) {
    if (QUALITY_RULES[i].re.test(s)) return QUALITY_RULES[i].label;
  }
  return 'SD';
}

function qualityRank(quality) {
  var order = ['2160p', '1080p', '720p', '576p', '480p', 'SD'];
  var i = order.indexOf(quality);
  return i === -1 ? order.length : i;
}

/* ----------------------------- tamaño ----------------------------- */

var SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(GB|GBs|GIGAS?|MB|MBs|MEGAS?|KB|TB)\b/i;

function parseSize(text) {
  var m = SIZE_RE.exec(String(text == null ? '' : text));
  if (!m) return null;
  var value = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(value)) return null;
  var unit = m[2].toUpperCase();
  var multiplier = unit.indexOf('TB') === 0 ? 1024 * 1024 * 1024 * 1024
    : unit.indexOf('G') === 0 ? 1024 * 1024 * 1024
      : unit.indexOf('M') === 0 ? 1024 * 1024
        : 1024;
  return Math.round(value * multiplier);
}

function formatSize(bytes) {
  if (!bytes || !isFinite(bytes)) return null;
  var units = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = 0;
  var n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i < 2 ? Math.round(n) : Math.round(n * 100) / 100) + ' ' + units[i];
}

function parseYear(text) {
  var m = /(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/.exec(String(text == null ? '' : text));
  return m ? parseInt(m[1], 10) : null;
}

/* --------------------------- temporadas ---------------------------- */

var RESOLUTION_RE = /(?:1920|1280|3840|2560|1440|1366|1080|720|2160|576|480|900)\s*[x\u00D7]\s*\d{3,4}/g;

var SEASON_ONLY_RE = /\b(?:temp(?:orada)?|temporada|season)\s*0*(\d{1,2})\b/i;
var SEASON_PRE_RE = /\b0*(\d{1,2})\s*[\u00AA\u00BA\u00B0]?\s*(?:temp(?:orada)?|temporada|season)\b/i;
var SEASON_T_RE = /\bT0*(\d{1,2})\b/;
var EPISODE_ONLY_RE = /\b(?:cap(?:[ií]tulo)?|ep(?:isodio)?)\.?\s*0*(\d{1,3})\b/i;

/** "1x05" sin exigir límite de palabra (Reacher4x5), evitando resoluciones 1920x1080. */
function matchNX(s) {
  var m = /(^|[^0-9])(\d{1,2})\s*x\s*(\d{1,3})(?![0-9])/i.exec(s);
  if (!m) return null;
  var season = parseInt(m[2], 10);
  var episode = parseInt(m[3], 10);
  if (season > 30 || episode > 300) return null;
  return { season: season, episode: episode };
}

/** Devuelve { season, episode, episodeEnd, isPack } */
function parseSeasonEpisode(text) {
  var s = String(text == null ? '' : text)
    .replace(/[\u00D7\u2715\u2716]/g, 'x')
    .replace(RESOLUTION_RE, ' ');
  var out = { season: null, episode: null, episodeEnd: null, isPack: false };

  var se = /\bs(?:eason)?\s*0*(\d{1,2})\s*[ ._-]*e(?:p|pisode)?\s*0*(\d{1,3})\b/i.exec(s);
  if (se) {
    out.season = parseInt(se[1], 10);
    out.episode = parseInt(se[2], 10);
  }

  if (out.season == null) {
    var nx = matchNX(s);
    if (nx) {
      out.season = nx.season;
      out.episode = nx.episode;
    }
  }

  if (out.season == null) {
    var so = SEASON_ONLY_RE.exec(s);
    if (so) {
      out.season = parseInt(so[1], 10);
    } else {
      var pre = SEASON_PRE_RE.exec(s);
      if (pre) out.season = parseInt(pre[1], 10);
      else {
        var tOnly = SEASON_T_RE.exec(s);
        if (tOnly && !/\bT\d{1,2}E\d/i.test(s)) out.season = parseInt(tOnly[1], 10);
      }
    }
  }

  if (out.episode == null) {
    var eo = EPISODE_ONLY_RE.exec(s);
    if (eo) out.episode = parseInt(eo[1], 10);
  }

  var range = /\b(?:cap(?:[íi]tulos?)?|ep(?:isodios?)?)[^\d]{0,6}0*(\d{1,3})\s*(?:-|al|a)\s*0*(\d{1,3})\b/i.exec(s);
  if (!range) range = /\b0*(\d{1,3})\s*-\s*0*(\d{1,3})\b/.exec(s);
  if (range && out.episode != null && parseInt(range[1], 10) === out.episode) {
    out.episodeEnd = parseInt(range[2], 10);
    out.isPack = out.episodeEnd > out.episode;
  }

  if (/\b(temporada completa|serie completa|pack|completa)\b/i.test(s)) out.isPack = true;

  return out;
}

function seasonCode(n) {
  var value = parseInt(n, 10);
  if (!isFinite(value)) return null;
  return 'S' + (value < 10 ? '0' + value : String(value));
}

function episodeCode(n) {
  var value = parseInt(n, 10);
  if (!isFinite(value)) return null;
  return 'E' + (value < 10 ? '0' + value : String(value));
}

function seasonEpisodeLabel(season, episode) {
  if (season == null && episode == null) return '';
  if (season == null) return episodeCode(episode);
  if (episode == null) return seasonCode(season);
  return seasonCode(season) + episodeCode(episode);
}

/**
 * ¿Sirve este resultado para la petición (temporada/episodio) del usuario?
 * Acepta packs que cubran el episodio y descarta temporadas distintas.
 */
function matchesEpisode(candidateText, season, episode) {
  var parsed = parseSeasonEpisode(candidateText);
  if (season == null && episode == null) return true;

  if (parsed.season != null && season != null && parsed.season !== season) return false;

  if (episode != null) {
    if (parsed.episode == null) return parsed.isPack || parsed.season != null;
    if (parsed.episode === episode) return true;
    if (parsed.episodeEnd != null && episode >= parsed.episode && episode <= parsed.episodeEnd) return true;
    return false;
  }

  return parsed.season != null ? true : true;
}

/* ----------------------------- varios ----------------------------- */

function uniqueBy(items, keyFn) {
  var seen = {};
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var key = keyFn(items[i]);
    if (!key || seen[key]) continue;
    seen[key] = true;
    out.push(items[i]);
  }
  return out;
}

function sortByQuality(streams) {
  return streams.slice().sort(function (a, b) {
    var qa = qualityRank(a.quality);
    var qb = qualityRank(b.quality);
    if (qa !== qb) return qa - qb;
    return (b.size || 0) - (a.size || 0);
  });
}

function safeCall(fn, fallback) {
  try {
    var value = fn();
    return value == null ? fallback : value;
  } catch (e) {
    log('error', e && e.message ? e.message : e);
    return fallback;
  }
}

/* ----------------------------- base64 ----------------------------- */

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64ToBytes(input) {
  var src = String(input == null ? '' : input).replace(/[\s\r\n]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  var padding = src.indexOf('=');
  if (padding !== -1) src = src.slice(0, padding);
  var out = new Uint8Array(Math.floor((src.length * 3) / 4));
  var buffer = 0;
  var bits = 0;
  var index = 0;
  for (var i = 0; i < src.length; i++) {
    var value = B64_CHARS.indexOf(src.charAt(i));
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, index);
}

function bytesToB64(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i];
    var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS.charAt(b0 >> 2);
    out += B64_CHARS.charAt(((b0 & 3) << 4) | (b1 >> 4));
    out += i + 1 < bytes.length ? B64_CHARS.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=';
    out += i + 2 < bytes.length ? B64_CHARS.charAt(b2 & 63) : '=';
  }
  return out;
}

function bytesToUtf8(bytes) {
  var out = '';
  var i = 0;
  while (i < bytes.length) {
    var byte = bytes[i++];
    if (byte < 0x80) {
      out += String.fromCharCode(byte);
    } else if (byte >= 0xc0 && byte < 0xe0) {
      out += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (byte >= 0xe0 && byte < 0xf0) {
      out += String.fromCharCode(((byte & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else {
      var cp = ((byte & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

function bytesToText(bytes) {
  try {
    if (typeof TextDecoder === 'function') return new TextDecoder('utf-8').decode(bytes);
  } catch (e) { /* sin TextDecoder */ }
  return bytesToUtf8(bytes);
}

function bytesToBinary(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function bytesToHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
  return hex;
}

function binaryToBytes(binary) {
  var out = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

function utf8ToBytes(text) {
  var s = String(text == null ? '' : text);
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var code = s.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      var extra = s.charCodeAt(++i);
      var cp = 0x10000 + ((code - 0xd800) << 10) + (extra - 0xdc00);
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function rot13(text) {
  return String(text == null ? '' : text).replace(/[a-zA-Z]/g, function (ch) {
    var base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/** Ajustes del usuario inyectados por Nuvio (SCRAPER_SETTINGS). */
function settings(defaults) {
  var out = {};
  var key;
  for (key in defaults) if (Object.prototype.hasOwnProperty.call(defaults, key)) out[key] = defaults[key];
  var provided = typeof SCRAPER_SETTINGS !== 'undefined' && SCRAPER_SETTINGS ? SCRAPER_SETTINGS : null;
  if (provided && typeof provided === 'object') {
    for (key in provided) {
      if (Object.prototype.hasOwnProperty.call(provided, key)) out[key] = provided[key];
    }
  }
  return out;
}

/* ===== core/10-http.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/http
 * Capa de red mínima sobre el fetch que inyecta Nuvio.
 * - Nunca lanza por HTTP no-2xx: devuelve { ok, status }.
 * - Timeout propio (AbortController) y reintentos cortos.
 * - Sin APIs de Node: solo fetch / AbortController / Promise.
 * ------------------------------------------------------------------ */

var DEFAULT_TIMEOUT = 12000;

function sleep(ms) {
  return new Promise(function (resolve) {
    try {
      setTimeout(resolve, ms);
    } catch (e) {
      resolve();
    }
  });
}

function timeoutError(ms) {
  var err = new Error('timeout ' + ms + 'ms');
  err.code = 'ETIMEDOUT';
  return err;
}

function withTimeout(promise, ms) {
  if (typeof AbortController === 'function') {
    var controller = new AbortController();
    var timer = null;
    var timed = new Promise(function (_, reject) {
      try {
        timer = setTimeout(function () {
          try { controller.abort(); } catch (e) { /* ignora */ }
          reject(timeoutError(ms));
        }, ms);
      } catch (e) { /* sin timers */ }
    });
    var wrapped = promise(controller.signal);
    return Promise.race([wrapped, timed]).then(function (value) {
      if (timer) clearTimeout(timer);
      return value;
    }, function (error) {
      if (timer) clearTimeout(timer);
      throw error;
    });
  }
  return promise(null);
}

/* Tarro de cookies mínimo: algunos sitios (DonTorrent, MejorTorrent) atan
 * la descarga protegida a la sesión que abrió la ficha. Nuvio no garantiza
 * un cookie jar nativo, así que lo llevamos nosotros por host. */
var COOKIE_JAR = {};

function hostKeyOf(url) {
  var match = /^https?:\/\/([^/?#]+)/i.exec(String(url));
  return match ? match[1].toLowerCase() : '';
}

function absorbCookies(hostKey, headers) {
  try {
    var raw = headers && headers.get ? headers.get('set-cookie') : null;
    if (!raw || !hostKey) return;
    var parts = String(raw).split(/,(?=[^;,]+=)/);
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split(';')[0];
      var eq = pair.indexOf('=');
      if (eq <= 0) continue;
      COOKIE_JAR[hostKey] = COOKIE_JAR[hostKey] || {};
      COOKIE_JAR[hostKey][pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  } catch (e) { /* headers opacos */ }
}

function cookieHeaderFor(hostKey) {
  var jar = COOKIE_JAR[hostKey];
  if (!jar) return null;
  var parts = [];
  for (var name in jar) {
    if (Object.prototype.hasOwnProperty.call(jar, name)) parts.push(name + '=' + jar[name]);
  }
  return parts.length ? parts.join('; ') : null;
}

function baseHeaders(extra) {
  var headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6'
  };
  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) headers[key] = extra[key];
    }
  }
  return headers;
}

/**
 * Petición HTTP con timeout.
 * @returns {Promise<{ok:boolean,status:number,url:string,bytes:Uint8Array,text:string,headers:any}>}
 */
function request(url, options) {
  var opts = options || {};
  var ms = opts.timeout || DEFAULT_TIMEOUT;
  var retries = opts.retries == null ? 1 : opts.retries;
  var attempt = 0;

  function run() {
    attempt++;
    return withTimeout(function (signal) {
      var hostKey = hostKeyOf(url);
      var headers = baseHeaders(opts.headers);
      if (hostKey && !headers.Cookie) {
        var jarCookie = cookieHeaderFor(hostKey);
        if (jarCookie) headers.Cookie = jarCookie;
      }
      var init = {
        method: opts.method || 'GET',
        headers: headers
      };
      if (signal) init.signal = signal;
      if (opts.body != null) init.body = opts.body;
      if (opts.redirect) init.redirect = opts.redirect;

      return fetch(url, init).then(function (response) {
        absorbCookies(hostKey, response && response.headers);
        var status = response && typeof response.status === 'number' ? response.status : 0;
        var finalUrl = (response && response.url) || url;
        if (!response || !response.ok) {
          return { ok: false, status: status, url: finalUrl, bytes: new Uint8Array(0), text: '', headers: (response && response.headers) || {} };
        }
        return response.arrayBuffer().then(function (buffer) {
          var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
          return { ok: true, status: status, url: finalUrl, bytes: bytes, text: bytesToText(bytes), headers: response.headers || {} };
        }, function () {
          return response.text().then(function (text) {
            return { ok: true, status: status, url: finalUrl, bytes: utf8ToBytes(text), text: text, headers: response.headers || {} };
          });
        });
      });
    }, ms).catch(function (error) {
      return { ok: false, status: 0, url: url, bytes: new Uint8Array(0), text: '', error: error, headers: {} };
    });
  }

  return run().then(function (result) {
    if (!result.ok && attempt <= retries && result.status !== 404 && result.status !== 403) {
      return sleep(280 * attempt).then(run);
    }
    return result;
  });
}

function getText(url, options) {
  return request(url, options).then(function (res) {
    if (!res.ok) {
      log('http', res.status || res.error && res.error.message, url);
      return '';
    }
    return res.text;
  });
}

function getBytes(url, options) {
  return request(url, options).then(function (res) {
    if (!res.ok) return null;
    return res.bytes;
  });
}

function getJson(url, options) {
  return request(url, options).then(function (res) {
    if (!res.ok || !res.text) return null;
    try {
      return JSON.parse(res.text);
    } catch (e) {
      return null;
    }
  });
}

function postForm(url, fields, options) {
  var body = '';
  for (var key in fields) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    if (body) body += '&';
    body += encodeURIComponent(key) + '=' + encodeURIComponent(fields[key] == null ? '' : fields[key]);
  }
  var opts = {};
  if (options) for (var k in options) if (Object.prototype.hasOwnProperty.call(options, k)) opts[k] = options[k];
  opts.method = 'POST';
  opts.body = body;
  opts.headers = baseHeaders({
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': opts.origin || '',
    'Referer': opts.referer || url
  });
  delete opts.origin;
  return request(url, opts);
}

function postJson(url, payload, options) {
  var opts = {};
  if (options) for (var k in options) if (Object.prototype.hasOwnProperty.call(options, k)) opts[k] = options[k];
  opts.method = 'POST';
  opts.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  opts.headers = baseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': opts.origin || '',
    'Referer': opts.referer || url
  });
  delete opts.origin;
  return request(url, opts);
}

/**
 * Prueba hosts en orden hasta que uno responda con HTML útil.
 * @param {string[]} hosts lista de orígenes
 * @param {function(string):string} pathFn ruta relativa por host
 * @param {object} options { headers, method, body, expect }
 */
function pickHost(hosts, pathFn, options) {
  var opts = options || {};
  var index = 0;

  function next() {
    if (index >= hosts.length) return Promise.resolve(null);
    var host = hosts[index++];
    var url = host.replace(/\/$/, '') + pathFn(host);
    var reqOpts = { headers: opts.headers, method: opts.method, body: opts.body, timeout: opts.timeout };
    return request(url, reqOpts).then(function (res) {
      if (!res.ok || !res.text) return next();
      if (opts.expect && !opts.expect.test(res.text)) return next();
      return { host: host.replace(/\/$/, ''), url: url, text: res.text, response: res };
    }, next);
  }

  return next();
}

/** Extrae el valor de `<meta property="og:title" content="...">` y similares. */
function metaContent(html, property) {
  var re = new RegExp('<meta[^>]+(?:property|name)=["\']' + property + '["\'][^>]*>', 'i');
  var tag = re.exec(String(html || ''));
  return tag ? attrOf(tag[0], 'content') : null;
}

/* ===== core/15-cloudflare.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/cloudflare
 * Ayudas para los sitios que se sirven detrás de Cloudflare
 * (TorrentGalaxy y GranTorrent, entre otros).
 *
 * Un plugin no puede resolver el desafío «Just a moment…»: no hay
 * navegador ni espacio para ejecutar el reto JS. Lo que sí puede hacer
 * es reutilizar la sesión ya verificada del usuario:
 *
 *   SCRAPER_SETTINGS = { cfCookie: 'cf_clearance=…; __cf_bm=…',
 *                        userAgent: 'Mozilla/5.0 …' }
 *
 * Ese par cookie+UA es el que el navegador ya negoció, así que las
 * peticiones del plugin pasan como tráfico normal. Si no hay cookie,
 * los providers siguen funcionando: devuelven [] cuando aparece el
 * desafío en vez de fallar.
 * ------------------------------------------------------------------ */

var CLOUDFLARE_CHALLENGE_RE = /just a moment|performing security verification|checking your browser|cf-chl|cdn-cgi\/challenge|attention required|enable javascript and cookies|verifying you are human|ddos-guard/i;

/** ¿El HTML es la pantalla de verificación en lugar del sitio? */
function isChallengeHtml(html) {
  if (!html) return true;
  var sample = String(html).slice(0, 4000);
  if (!sample.trim()) return true;
  // un 200 con la portada del sitio nunca trae estos marcadores
  return CLOUDFLARE_CHALLENGE_RE.test(sample);
}

/** Ajustes de sesión del usuario (cookie de Cloudflare y User-Agent). */
function cloudflareSettings() {
  return settings({ cfCookie: '', userAgent: '' });
}

/**
 * Cabeceras con la sesión del usuario cuando existe.
 * @param {object} extra cabeceras adicionales (Referer, Accept…)
 */
function browserHeaders(extra) {
  var conf = cloudflareSettings();
  var headers = {};
  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) headers[key] = extra[key];
    }
  }

  var ua = String(conf.userAgent == null ? '' : conf.userAgent).trim();
  if (ua) headers['User-Agent'] = ua;

  var cookie = String(conf.cfCookie == null ? '' : conf.cfCookie).trim();
  if (cookie) {
    // acepta tanto "cf_clearance=abc" como el valor pelado de cf_clearance
    if (cookie.indexOf('=') === -1) cookie = 'cf_clearance=' + cookie;
    headers.Cookie = cookie;
    if (!headers.Referer && !headers.referer) headers.Referer = 'https://www.google.com/';
  }

  return headers;
}

/** Texto del ajuste `cfCookie` (para decidir si merece la pena reintentar). */
function hasCloudflareSession() {
  var conf = cloudflareSettings();
  return String(conf.cfCookie || '').trim().length > 0;
}

/* ===== core/20-hash.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/hash
 * SHA-1 y SHA-256 en JS puro (sin crypto de Node ni crypto.subtle).
 * - SHA-1: infohash BTIH del diccionario "info" de un .torrent
 * - SHA-256: proof-of-work de las descargas de DonTorrent/MejorTorrent
 * ------------------------------------------------------------------ */

function rotl32(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function rotr32(value, bits) {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function bytesToWords(bytes) {
  var words = new Array(((bytes.length + 3) >> 2));
  for (var i = 0; i < words.length; i++) words[i] = 0;
  for (var j = 0; j < bytes.length; j++) {
    words[j >> 2] |= bytes[j] << (24 - (j % 4) * 8);
  }
  return words;
}

function paddedWords(bytes, littleEndianLength) {
  var lengthBitsHigh = Math.floor((bytes.length * 8) / 4294967296);
  var lengthBitsLow = (bytes.length * 8) >>> 0;
  var total = (((bytes.length + 8) >> 6) + 1) << 4;
  var words = new Array(total);
  for (var i = 0; i < total; i++) words[i] = 0;
  for (var j = 0; j < bytes.length; j++) {
    words[j >> 2] |= bytes[j] << (24 - (j % 4) * 8);
  }
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  if (littleEndianLength) {
    words[total - 1] = lengthBitsLow;
    words[total - 2] = lengthBitsHigh;
  } else {
    words[total - 1] = lengthBitsLow;
    words[total - 2] = lengthBitsHigh;
  }
  return words;
}

function wordsToHex(words) {
  var hex = '';
  for (var i = 0; i < words.length; i++) hex += ('00000000' + (words[i] >>> 0).toString(16)).slice(-8);
  return hex;
}

/** SHA-1 de un Uint8Array -> hex */
function sha1Bytes(bytes) {
  var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var words = paddedWords(data, false);
  var h0 = 0x67452301;
  var h1 = 0xEFCDAB89;
  var h2 = 0x98BADCFE;
  var h3 = 0x10325476;
  var h4 = 0xC3D2E1F0;
  var w = new Array(80);

  for (var block = 0; block < words.length; block += 16) {
    for (var i = 0; i < 16; i++) w[i] = words[block + i] | 0;
    for (var t = 16; t < 80; t++) w[t] = rotl32(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);

    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;

    for (var s = 0; s < 80; s++) {
      var f;
      var k;
      if (s < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5A827999;
      } else if (s < 40) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1;
      } else if (s < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDC;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6;
      }
      var temp = (rotl32(a, 5) + (f | 0) + e + k + w[s]) | 0;
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  return wordsToHex([h0, h1, h2, h3, h4]);
}

var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

/** SHA-256 de un Uint8Array -> hex */
function sha256Bytes(bytes) {
  var data = bytes instanceof Uint8Array ? bytes : utf8ToBytes(bytes);
  var words = paddedWords(data, false);
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var w = new Array(64);

  for (var block = 0; block < words.length; block += 16) {
    for (var i = 0; i < 16; i++) w[i] = words[block + i] | 0;
    for (var t = 16; t < 64; t++) {
      var s0 = rotr32(w[t - 15], 7) ^ rotr32(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      var s1 = rotr32(w[t - 2], 17) ^ rotr32(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    var a = h[0];
    var b = h[1];
    var c = h[2];
    var d = h[3];
    var e = h[4];
    var f = h[5];
    var g = h[6];
    var hh = h[7];

    for (var k = 0; k < 64; k++) {
      var S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      var ch = (e & f) ^ ((~e) & g);
      var temp1 = (hh + S1 + ch + SHA256_K[k] + w[k]) | 0;
      var S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) | 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }

  return wordsToHex(h);
}

function sha256Hex(text) {
  return sha256Bytes(utf8ToBytes(String(text == null ? '' : text)));
}

function sha1Hex(text) {
  return sha1Bytes(utf8ToBytes(String(text == null ? '' : text)));
}

/* ===== core/30-bencode.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/bencode
 * Lector mínimo de .torrent para obtener nombre, tamaño e infohash.
 * El infohash BTIH es SHA-1 de los bytes exactos del diccionario "info".
 * ------------------------------------------------------------------ */

function bdecodeStringAt(bytes, index) {
  var i = index;
  var length = 0;
  var digits = 0;
  while (i < bytes.length && bytes[i] >= 48 && bytes[i] <= 57) {
    length = length * 10 + (bytes[i] - 48);
    i++;
    digits++;
  }
  if (!digits || bytes[i] !== 58) return null;
  i++;
  var end = i + length;
  if (end > bytes.length) return null;
  return { value: bytesToText(bytes.subarray(i, end)), start: i, end: end, next: end };
}

function bdecodeIntAt(bytes, index) {
  var i = index;
  if (bytes[i] !== 105) return null;
  i++;
  var sign = 1;
  if (bytes[i] === 45) { sign = -1; i++; }
  var value = 0;
  var digits = 0;
  while (i < bytes.length && bytes[i] >= 48 && bytes[i] <= 57) {
    value = value * 10 + (bytes[i] - 48);
    i++;
    digits++;
  }
  if (!digits || bytes[i] !== 101) return null;
  return { value: sign * value, next: i + 1 };
}

/** Devuelve el índice inmediatamente posterior al valor que empieza en `index`. */
function bdecodeSkip(bytes, index) {
  if (index >= bytes.length) return -1;
  var code = bytes[index];
  if (code === 105) { // i
    var parsedInt = bdecodeIntAt(bytes, index);
    return parsedInt ? parsedInt.next : -1;
  }
  if (code === 108) { // l
    var i = index + 1;
    while (i < bytes.length && bytes[i] !== 101) {
      i = bdecodeSkip(bytes, i);
      if (i < 0) return -1;
    }
    return i + 1;
  }
  if (code === 100) { // d
    var j = index + 1;
    while (j < bytes.length && bytes[j] !== 101) {
      var key = bdecodeStringAt(bytes, j);
      if (!key) return -1;
      j = bdecodeSkip(bytes, key.next);
      if (j < 0) return -1;
    }
    return j + 1;
  }
  var str = bdecodeStringAt(bytes, index);
  return str ? str.next : -1;
}

/** Lista de pares clave → rango de bytes de una cadena o diccionario. */
function bdecodeDictEntries(bytes, index) {
  if (bytes[index] !== 100) return [];
  var entries = [];
  var i = index + 1;
  while (i < bytes.length && bytes[i] !== 101) {
    var key = bdecodeStringAt(bytes, i);
    if (!key) break;
    var valueStart = key.next;
    var valueEnd = bdecodeSkip(bytes, valueStart);
    if (valueEnd < 0) break;
    entries.push({ key: key.value, start: valueStart, end: valueEnd });
    i = valueEnd;
  }
  return entries;
}

function bdecodeInfoSize(bytes, infoStart, infoEnd) {
  var entries = bdecodeDictEntries(bytes, infoStart);
  var total = 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (entry.key === 'length') {
      var lengthInt = bdecodeIntAt(bytes, entry.start);
      if (lengthInt) total += lengthInt.value;
    } else if (entry.key === 'files' && bytes[entry.start] === 108) {
      var cursor = entry.start + 1;
      while (cursor < entry.end - 1 && bytes[cursor] !== 101) {
        var fileEntries = bdecodeDictEntries(bytes, cursor);
        for (var f = 0; f < fileEntries.length; f++) {
          if (fileEntries[f].key === 'length') {
            var fileInt = bdecodeIntAt(bytes, fileEntries[f].start);
            if (fileInt) total += fileInt.value;
          }
        }
        var nextCursor = bdecodeSkip(bytes, cursor);
        if (nextCursor <= cursor) break;
        cursor = nextCursor;
      }
    }
  }
  return total || null;
}

/**
 * @param {Uint8Array} bytes contenido de un .torrent
 * @returns {{name:string, infoHash:string, size:number|null}|null}
 */
function parseTorrent(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes[0] !== 100) return null;
  var root = bdecodeDictEntries(bytes, 0);
  var info = null;
  var name = null;
  for (var i = 0; i < root.length; i++) {
    if (root[i].key === 'info') info = root[i];
  }
  if (!info) return null;

  var infoEntries = bdecodeDictEntries(bytes, info.start);
  for (var j = 0; j < infoEntries.length; j++) {
    if (infoEntries[j].key === 'name') {
      var nameStr = bdecodeStringAt(bytes, infoEntries[j].start);
      if (nameStr) name = nameStr.value;
    } else if (infoEntries[j].key === 'name.utf-8' && !name) {
      var utfName = bdecodeStringAt(bytes, infoEntries[j].start);
      if (utfName) name = utfName.value;
    }
  }

  return {
    name: name,
    infoHash: sha1Bytes(bytes.subarray(info.start, info.end)),
    size: bdecodeInfoSize(bytes, info.start, info.end)
  };
}

/* ===== core/40-magnet.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/magnet
 * Construcción de enlaces magnet a partir del infohash de un .torrent.
 * Nuvio resuelve magnets con su integración de debrid nativa.
 * ------------------------------------------------------------------ */

var MAGNET_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce'
];

function buildMagnet(infoHash, name, size) {
  if (!infoHash) return null;
  var hash = String(infoHash).toLowerCase();
  var url = 'magnet:?xt=urn:btih:' + hash;
  if (name) url += '&dn=' + encodeURIComponent(name);
  if (size) url += '&xl=' + size;
  for (var i = 0; i < MAGNET_TRACKERS.length; i++) {
    url += '&tr=' + encodeURIComponent(MAGNET_TRACKERS[i]);
  }
  return url;
}

/** Extrae el infohash de un magnet ya existente (hex 40 o base32 32). */
function infoHashFromMagnet(magnet) {
  var m = /xt=urn:btih:([a-z0-9]{32,40})/i.exec(String(magnet || ''));
  if (!m) return null;
  var hash = m[1];
  if (hash.length === 40) return hash.toLowerCase();
  // base32 -> hex
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var bits = '';
  var upper = hash.toUpperCase();
  for (var i = 0; i < upper.length; i++) {
    var value = alphabet.indexOf(upper.charAt(i));
    if (value < 0) return null;
    bits += ('00000' + value.toString(2)).slice(-5);
  }
  var hex = '';
  for (var b = 0; b + 4 <= bits.length; b += 4) {
    hex += parseInt(bits.slice(b, b + 4), 2).toString(16);
  }
  return hex.slice(0, 40);
}

/** Nombre legible dentro de un magnet (`dn`). */
function magnetName(magnet) {
  var m = /[?&]dn=([^&]+)/i.exec(String(magnet || ''));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

/* ===== core/50-tmdb.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/tmdb
 * De id de TMDB (lo único que entrega Nuvio) a títulos buscables.
 *
 * Orden de resolución:
 *   1. id IMDb (tt…)  -> Cinemeta
 *   2. TMDB API       -> global TMDB_API_KEY que inyecta Nuvio
 *   3. themoviedb.org -> lectura del <title>/og:title (sin clave)
 * ------------------------------------------------------------------ */

function cleanContentId(rawId) {
  var id = String(rawId == null ? '' : rawId).trim();
  if (!id) return '';
  var prefixed = /^tmdb[:_-](\d+)/i.exec(id);
  if (prefixed) return prefixed[1];
  var imdb = /(tt\d{5,})/i.exec(id);
  if (imdb) return imdb[1];
  var numeric = /(\d+)/.exec(id);
  return numeric ? numeric[1] : id.split(':')[0];
}

function tmdbApiKey() {
  var fromGlobal = typeof TMDB_API_KEY !== 'undefined' && typeof TMDB_API_KEY === 'string' ? TMDB_API_KEY.trim() : '';
  if (fromGlobal) return fromGlobal;
  var conf = settings({ tmdbKey: '' });
  return conf.tmdbKey ? String(conf.tmdbKey).trim() : '';
}

function titleFromHtml(html) {
  var raw = metaContent(html, 'og:title') || '';
  if (!raw) {
    var titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ''));
    raw = titleTag ? stripTags(titleTag[1]) : '';
  }
  if (!raw) return null;
  var clean = raw.split('—').join('|').split('|')[0].replace(/\s*\(\d{4}\)\s*$/, '').trim();
  var year = parseYear(raw);
  return clean ? { title: clean, year: year } : null;
}

function resolveImdb(id) {
  var isTv = false;
  return request('https://v3-cinemeta.strem.io/meta/movie/' + encodeURIComponent(id) + '.json', { timeout: 9000 })
    .then(function (movieRes) {
      if (movieRes.ok && movieRes.text && movieRes.text.indexOf('"meta"') !== -1) return movieRes;
      isTv = true;
      return request('https://v3-cinemeta.strem.io/meta/series/' + encodeURIComponent(id) + '.json', { timeout: 9000 });
    })
    .then(function (res) {
      if (!res || !res.ok) return null;
      var parsed = null;
      try { parsed = JSON.parse(res.text); } catch (e) { return null; }
      var meta = parsed && parsed.meta;
      if (!meta) return null;
      return {
        tmdbId: null,
        imdbId: id,
        isTv: isTv || meta.type === 'series',
        title: meta.name || meta.original_name || '',
        originalTitle: meta.original_name || meta.name || '',
        year: meta.year ? parseInt(String(meta.year).slice(0, 4), 10) : null,
        titles: [meta.name, meta.original_name].filter(Boolean)
      };
    });
}

function resolveFromApi(id, mediaType) {
  var key = tmdbApiKey();
  if (!key) return Promise.resolve(null);
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  var base = 'https://api.themoviedb.org/3/' + type + '/' + encodeURIComponent(id);
  var esUrl = base + '?api_key=' + encodeURIComponent(key) + '&language=es-ES';
  var enUrl = base + '?api_key=' + encodeURIComponent(key) + '&language=en-US';

  return Promise.all([getJson(esUrl), getJson(enUrl)]).then(function (results) {
    var es = results[0];
    var en = results[1];
    if (!es && !en) return null;
    var primary = es || en;
    var secondary = en || es;
    var title = (type === 'tv' ? primary.name : primary.title) || '';
    var original = primary.original_title || primary.original_name || '';
    var alt = (type === 'tv' ? secondary.name : secondary.title) || '';
    var date = primary.release_date || primary.first_air_date || secondary.release_date || secondary.first_air_date || '';
    return {
      tmdbId: String(id),
      imdbId: primary.imdb_id || null,
      isTv: type === 'tv',
      title: title,
      originalTitle: original || title,
      year: date ? parseInt(String(date).slice(0, 4), 10) : null,
      titles: [title, original, alt].filter(function (value, index, arr) {
        return value && arr.indexOf(value) === index;
      })
    };
  });
}

function resolveFromWeb(id, mediaType) {
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  return getText('https://www.themoviedb.org/' + type + '/' + encodeURIComponent(id), { timeout: 9000 })
    .then(function (html) {
      if (!html) return null;
      var info = titleFromHtml(html);
      if (!info) return null;
      return {
        tmdbId: String(id),
        imdbId: null,
        isTv: type === 'tv',
        title: info.title,
        originalTitle: info.title,
        year: info.year,
        titles: [info.title]
      };
    });
}

/**
 * @param {string} rawId id de TMDB (o IMDb) que entrega Nuvio
 * @param {string} mediaType "movie" | "tv" | "series"
 * @param {number|null} season
 * @param {number|null} episode
 */
function resolveMedia(rawId, mediaType, season, episode) {
  var id = cleanContentId(rawId);
  var isTv = mediaType === 'tv' || mediaType === 'series' || season != null;
  var info = {
    id: id,
    tmdbId: /^\d+$/.test(id) ? id : null,
    imdbId: /^tt\d+$/i.test(id) ? id : null,
    isTv: isTv,
    season: season == null ? null : parseInt(season, 10),
    episode: episode == null ? null : parseInt(episode, 10),
    title: '',
    originalTitle: '',
    year: null,
    titles: []
  };

  var resolver;
  if (info.imdbId) {
    resolver = resolveImdb(info.imdbId);
  } else if (info.tmdbId) {
    resolver = resolveFromApi(info.tmdbId, isTv ? 'tv' : 'movie').then(function (result) {
      if (result) return result;
      return resolveFromWeb(info.tmdbId, isTv ? 'tv' : 'movie');
    });
  } else {
    resolver = Promise.resolve(null);
  }

  return resolver.then(function (meta) {
    if (!meta) return info;
    info.title = meta.title || '';
    info.originalTitle = meta.originalTitle || meta.title || '';
    info.year = meta.year || null;
    info.titles = meta.titles && meta.titles.length ? meta.titles : [info.title].filter(Boolean);
    if (meta.imdbId) info.imdbId = meta.imdbId;
    if (meta.tmdbId) info.tmdbId = meta.tmdbId;
    if (meta.isTv != null) info.isTv = meta.isTv;
    return info;
  });
}

/** Consultas de búsqueda ordenadas por probabilidad de éxito. */
function searchQueries(info) {
  var list = [];
  if (!info) return list;
  var year = info.year ? String(info.year) : '';
  if (info.title) list.push(info.title);
  if (info.originalTitle && info.originalTitle !== info.title) list.push(info.originalTitle);
  if (year && info.title) list.push(info.title + ' ' + year);
  if (info.title) {
    // el título sin artículos suele ayudar en buscadores simples
    list.push(info.title.replace(/^(el|la|los|las|the)\s+/i, ''));
  }
  return list.filter(function (value, index, arr) {
    return value && value.length > 1 && arr.indexOf(value) === index;
  });
}

/* ===== core/60-stream.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/stream
 * Construcción del objeto de stream que espera Nuvio:
 *   { name, title, url, quality, size, language, provider, type,
 *     infoHash, seeders, headers, subtitles }
 * ------------------------------------------------------------------ */

function makeStream(data) {
  var stream = {
    name: data.name || data.provider || 'Nébula',
    title: data.title || data.name || 'Sin título',
    url: data.url,
    quality: data.quality || 'SD',
    provider: data.provider || PLUGIN_TAG,
    type: data.type || 'torrent'
  };
  if (data.size) stream.size = typeof data.size === 'number' ? formatSize(data.size) : data.size;
  if (data.language) stream.language = data.language;
  if (data.infoHash) stream.infoHash = data.infoHash;
  if (data.seeders != null) stream.seeders = data.seeders;
  if (data.peers != null) stream.peers = data.peers;
  if (data.headers) stream.headers = data.headers;
  if (data.subtitles && data.subtitles.length) stream.subtitles = data.subtitles;
  return stream;
}

function finalizeStreams(label, streams, options) {
  var opts = options || {};
  var max = opts.max || 12;
  var playable = (streams || []).filter(function (stream) {
    return stream && typeof stream.url === 'string' && stream.url.length > 8 && !/^https?:\/\/www\./i.test(stream.url);
  });
  playable = uniqueBy(playable, function (stream) {
    return (stream.infoHash || stream.url).toLowerCase();
  });
  playable = sortByQuality(playable);
  playable = playable.slice(0, max);
  var prefix = opts.prefix || label || 'Nébula';
  for (var i = 0; i < playable.length; i++) {
    if (playable[i].name && playable[i].name.indexOf(prefix) !== 0) {
      playable[i].name = prefix + ' · ' + playable[i].name;
    } else if (!playable[i].name) {
      playable[i].name = prefix;
    }
  }
  return playable;
}

/**
 * Descarga un .torrent y devuelve su magnet + metadatos.
 * Acepta URLs que responden con el archivo o con una redirección al mismo.
 */
function torrentToMagnet(url, options) {
  var opts = options || {};
  return getBytes(url, { timeout: opts.timeout || 14000, headers: opts.headers })
    .then(function (bytes) {
      if (!bytes || bytes.length < 30) return null;
      var torrent = parseTorrent(bytes);
      if (!torrent || !torrent.infoHash) return null;
      return {
        magnet: buildMagnet(torrent.infoHash, torrent.name, torrent.size),
        infoHash: torrent.infoHash,
        name: torrent.name,
        size: torrent.size
      };
    })
    .catch(function () { return null; });
}

/** Aplica un límite de concurrencia simple a una lista de tareas. */
function mapLimit(items, limit, iterator) {
  var results = new Array(items.length);
  var index = 0;

  function worker() {
    if (index >= items.length) return Promise.resolve();
    var current = index++;
    return Promise.resolve()
      .then(function () { return iterator(items[current], current); })
      .then(function (value) { results[current] = value; }, function () { results[current] = null; })
      .then(worker);
  }

  var workers = [];
  for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  return Promise.all(workers).then(function () { return results; });
}

/** Añade un distintivo de idioma cuando el sitio lo declara. */
function languageLabel(text) {
  var s = String(text == null ? '' : text);
  if (/latino/i.test(s)) return 'Latino';
  if (/castellano|espa(ñ|n)ol/i.test(s)) return 'Castellano';
  if (/vose|subtitulad/i.test(s)) return 'VOSE';
  if (/dual/i.test(s)) return 'Dual';
  return null;
}

function onSettingsLayout(items) {
  return function () {
    return Promise.resolve(items || []);
  };
}

/* ===== core/70-donengine.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/donengine
 * Motor compartido por DonTorrent y MejorTorrent (mismo software).
 *
 * Flujo verificado contra los sitios (noviembre 2026):
 *   búsqueda   POST /buscar   valor=<término>&Buscar=Buscar&p=1
 *   ficha      /pelicula/<id>/<slug>  ·  /serie/<id>/<id>/<slug>
 *   descarga   <a class="protected-download" data-content-id data-tabla>
 *              → POST /api_validate_pow.php (generate) → PoW SHA-256 (3 ceros)
 *              → POST /api_validate_pow.php (validate) → download_url (.torrent)
 *              → infohash BTIH → magnet
 * ------------------------------------------------------------------ */

var POW_MAX_ATTEMPTS = 4000000;

function solveProofOfWork(challenge, difficulty) {
  var zeros = new Array((difficulty || 3) + 1).join('0');
  for (var nonce = 0; nonce < POW_MAX_ATTEMPTS; nonce++) {
    if (sha256Hex(String(challenge) + nonce).slice(0, zeros.length) === zeros) return nonce;
  }
  return null;
}

function collectProtectedAnchors(html) {
  var anchors = [];
  var re = /<a\b[^>]*>/gi;
  var match;
  while ((match = re.exec(html))) {
    var tag = match[0];
    var classes = attrOf(tag, 'class') || '';
    var contentId = attrOf(tag, 'data-content-id');
    var tabla = attrOf(tag, 'data-tabla');
    var href = attrOf(tag, 'href');
    if (contentId && tabla) {
      anchors.push({ kind: 'pow', contentId: contentId, tabla: tabla });
    } else if (/protected-download/.test(classes) && contentId && tabla) {
      anchors.push({ kind: 'pow', contentId: contentId, tabla: tabla });
    } else if (href && /\.torrent(\?|$)/i.test(href)) {
      anchors.push({ kind: 'direct', href: href });
    } else if (href && /\bdownload\b/i.test(tag) && /torrent|descarg/i.test(tag)) {
      anchors.push({ kind: 'direct', href: href });
    }
  }
  return anchors;
}

function parseDonSearch(html, host) {
  var results = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/(?:pelicula|serie|documental)\/[^"']+)["'][^>]*>([\s\S]{0,220}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(match[1], host);
    var title = stripTags(match[2]).replace(/^Descargar\s+/i, '').trim();
    if (!url || !title || title.length < 2 || seen[url]) continue;
    if (/^(ver|descargar|inicio|siguenos|contacto)$/i.test(title)) continue;
    seen[url] = true;
    var tail = html.slice(match.index, match.index + 900);
    var qualityMatch = /\(([A-Za-z0-9][^)]{1,24})\)/.exec(tail);
    results.push({
      url: url,
      title: title,
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : parseQuality(title + ' ' + url),
      isSeries: /\/serie\//i.test(url)
    });
  }
  return results;
}

function donResolveProtected(host, contentId, tabla, referer) {
  var apiUrl = host + '/api_validate_pow.php';
  var headers = { Referer: referer, Origin: host };

  return postJson(apiUrl, { action: 'generate', content_id: parseInt(contentId, 10), tabla: tabla }, { headers: headers })
    .then(function (res) {
      if (!res.ok || !res.text) return null;
      var parsed = null;
      try { parsed = JSON.parse(res.text); } catch (e) { return null; }
      if (!parsed || !parsed.success || !parsed.challenge) return null;
      var difficulty = parseInt(parsed.difficulty, 10);
      var nonce = solveProofOfWork(parsed.challenge, isFinite(difficulty) ? difficulty : 3);
      if (nonce == null) return null;
      return postJson(apiUrl, { action: 'validate', challenge: parsed.challenge, nonce: nonce }, { headers: headers });
    })
    .then(function (res) {
      if (!res || !res.ok || !res.text) return null;
      var parsed = null;
      try { parsed = JSON.parse(res.text); } catch (e) { return null; }
      if (!parsed || !parsed.success || !parsed.download_url) return null;
      var url = String(parsed.download_url).replace(/\\\//g, '/');
      return absoluteUrl(url, host);
    });
}

function donParseDetail(html, host) {
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  var title = h1 ? stripTags(h1[1]) : null;
  var yearMatch = /(?:A[ñn]o|Año)\s*:?\s*<?[^>]*>?\s*((?:19|20)\d{2})/i.exec(html);
  var formatMatch = /Formato\s*:?\s*(?:<\/?[^>]+>\s*)*([A-Za-z0-9 .\-]{2,30})/i.exec(html);
  return {
    title: title,
    year: yearMatch ? parseInt(yearMatch[1], 10) : null,
    quality: formatMatch ? parseQuality(formatMatch[1]) : parseQuality(html.slice(0, 4000))
  };
}

/** Filas de episodios: texto con 1x01 / Cap. 1-2 junto a su ancla protegida. */
function donParseEpisodeRows(html, host, pageUrl) {
  var rows = [];
  var chunks = html.split(/<tr\b/i);
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var label = stripTags(chunk).slice(0, 160);
    var anchors = collectProtectedAnchors(chunk);
    if (!anchors.length) continue;
    for (var j = 0; j < anchors.length; j++) {
      rows.push({
        label: label,
        anchor: anchors[j],
        pageUrl: pageUrl,
        quality: parseQuality(chunk),
        size: parseSize(label)
      });
    }
  }
  return rows;
}

function createDonEngine(config) {
  var label = config.label;
  var providerId = config.id;
  var hosts = config.hosts || [];
  var maxResults = config.maxResults || 8;
  var qualityPreference = config.qualityPreference || '';

  function searchHost(host, term) {
    return postForm(host + '/buscar', { valor: term, Buscar: 'Buscar', p: '1' }, {
      referer: host + '/',
      origin: host
    }).then(function (res) {
      if (!res.ok || !res.text) return { host: host, results: [] };
      return { host: host, results: parseDonSearch(res.text, host) };
    });
  }

  function searchAllHosts(term) {
    var index = 0;
    function attempt() {
      if (index >= hosts.length) return Promise.resolve([]);
      var host = hosts[index++].replace(/\/$/, '');
      return searchHost(host, term).then(function (found) {
        if (found.results.length) return found;
        return attempt();
      });
    }
    return attempt();
  }

  function streamsFromDetail(candidate, info) {
    return getText(candidate.url, { timeout: 14000 }).then(function (html) {
      if (!html) return [];
      var detail = donParseDetail(html, candidate.url);
      var quality = detail.quality || candidate.quality || 'SD';
      var host = candidate.url.replace(/^(https?:\/\/[^/]+).*$/i, '$1');

      var targets = [];
      if (info.isTv && info.season != null) {
        var rows = donParseEpisodeRows(html, host, candidate.url);
        for (var i = 0; i < rows.length; i++) {
          var rowQuality = rows[i].quality !== 'SD' ? rows[i].quality : quality;
          if (matchesEpisode(rows[i].label, info.season, info.episode)) {
            targets.push({ anchor: rows[i].anchor, label: rows[i].label, quality: rowQuality, size: rows[i].size });
          }
        }
        if (!targets.length) {
          // la ficha puede ser un pack: se ofrece con aviso de episodios
          var packAnchors = collectProtectedAnchors(html);
          for (var p = 0; p < packAnchors.length && p < 2; p++) {
            targets.push({ anchor: packAnchors[p], label: seasonEpisodeLabel(info.season, info.episode), quality: quality, size: null });
          }
        }
      } else {
        var anchors = collectProtectedAnchors(html);
        for (var a = 0; a < anchors.length && a < 4; a++) {
          targets.push({ anchor: anchors[a], label: null, quality: quality, size: parseSize(html.slice(0, 6000)) });
        }
      }

      return mapLimit(targets, 3, function (target) {
        var promise;
        if (target.anchor.kind === 'direct') {
          promise = Promise.resolve(absoluteUrl(target.anchor.href, candidate.url));
        } else {
          promise = donResolveProtected(host, target.anchor.contentId, target.anchor.tabla, candidate.url);
        }
        return promise.then(function (downloadUrl) {
          if (!downloadUrl) return null;
          return torrentToMagnet(downloadUrl, {
            headers: { Referer: candidate.url, 'User-Agent': UA }
          }).then(function (torrent) {
            if (!torrent) return null;
            var suffix = target.label ? ' · ' + String(target.label).slice(0, 60) : '';
            return makeStream({
              name: label,
              title: (detail.title || candidate.title) + suffix + ' · ' + (target.quality || quality),
              url: torrent.magnet,
              infoHash: torrent.infoHash,
              quality: target.quality || quality,
              size: target.size || torrent.size,
              provider: providerId,
              type: 'torrent',
              language: 'Castellano',
              headers: { Referer: candidate.url }
            });
          });
        }).catch(function () { return null; });
      }).then(function (streams) {
        return streams.filter(Boolean);
      });
    });
  }

  function getStreams(tmdbId, mediaType, season, episode) {
    var conf = settings({ maxResults: maxResults, qualityPreference: qualityPreference });

    return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
      var queries = searchQueries(info).slice(0, 2);
      if (!queries.length) return [];

      var collection = [];
      var cursor = 0;

      function nextQuery() {
        if (cursor >= queries.length) return Promise.resolve(collection);
        var term = queries[cursor++];
        return searchAllHosts(term).then(function (found) {
          if (found && found.results && found.results.length) {
            collection = collection.concat(found.results.map(function (item) {
              item.host = found.host;
              return item;
            }));
            if (collection.length >= 6) return collection;
          }
          return nextQuery();
        });
      }

      return nextQuery().then(function (candidates) {
        var filtered = uniqueBy(candidates, function (item) { return item.url; }).filter(function (candidate) {
          if (info.isTv && !candidate.isSeries) return false;
          if (!info.isTv && candidate.isSeries) return false;
          if (titleScore(candidate.title, info.title) < 0.5 && titleScore(candidate.title, info.originalTitle) < 0.5) return false;
          if (info.year && parseYear(candidate.title) && Math.abs(parseYear(candidate.title) - info.year) > 1) return false;
          return true;
        });

        var limit = parseInt(conf.maxResults, 10);
        if (!isFinite(limit) || limit <= 0) limit = maxResults;
        filtered = filtered.slice(0, Math.min(limit, 10));

        if (!filtered.length) return [];
        return mapLimit(filtered, 3, function (candidate) {
          return streamsFromDetail(candidate, info).catch(function () { return []; });
        }).then(function (groups) {
          var all = [];
          for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
          return finalizeStreams(label, all, { max: limit });
        });
      });
    }).catch(function (error) {
      log(providerId, 'error', error && error.message ? error.message : error);
      return [];
    });
  }

  return {
    id: providerId,
    label: label,
    getStreams: getStreams,
    // exportados para pruebas
    _internal: {
      parseDonSearch: parseDonSearch,
      collectProtectedAnchors: collectProtectedAnchors,
      solveProofOfWork: solveProofOfWork,
      parseDonEpisodeRows: donParseEpisodeRows
    }
  };
}

/* ===== core/80-shortlink.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/shortlink
 * Decodificador de los enlaces ofuscados de EliteTorrent y DivxTotal
 * (acortame-esto.com / short-info.link):
 *
 *   capas de Base64  →  ROT13  →  https://…/archivo.torrent  o  magnet:
 *
 * Ejemplo real (EliteTorrent, 05/11/2026):
 *   i=VjJ0YWEyRXlTbk5o…  → 5 capas → "uggcf://jjj.ryvgrgbeerag.pbz/…"
 *   → ROT13 → "https://www.elitetorrent.com/wp-content/uploads/…"
 * ------------------------------------------------------------------ */

function looksLikeTarget(value) {
  return /^https?:\/\//i.test(value) || /^magnet:\?/i.test(value);
}

function printableText(text) {
  if (!text || text.length > 4096) return false;
  // Debe ser texto imprimible (una URL o magnet no lleva binario).
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
}

/**
 * @param {string} raw valor del parámetro `i` o `u`
 * @returns {string|null} URL .torrent o magnet
 */
function decodeShortLink(raw) {
  var value = String(raw == null ? '' : raw).trim();
  if (!value) return null;

  try {
    value = decodeURIComponent(value);
  } catch (e) { /* se queda como está */ }

  for (var layer = 0; layer < 10; layer++) {
    if (looksLikeTarget(value)) return value;

    var rotated = rot13(value);
    if (looksLikeTarget(rotated)) return rotated;

    var bytes = b64ToBytes(value);
    if (!bytes.length) return null;
    var text = bytesToText(bytes);
    if (!printableText(text) || text === value) return null;
    value = text;
  }
  return null;
}

/** Extrae el parámetro ofuscado (`i`, `u` o `url`) de un enlace completo. */
function shortParamOf(value) {
  var match = /[?&](?:i|u|url)=([^&#]+)/i.exec(String(value == null ? '' : value));
  return match ? match[1] : null;
}

/**
 * Variante tolerante: acepta el valor pelado o el enlace completo
 * (`acortame-esto.com/s.php?i=…`, `download_tt.php?u=…`, `ddlUrl.php?url=…`),
 * y devuelve las URLs que ya vienen en claro.
 */
function decodeShortLinkOrUrl(raw) {
  var direct = String(raw == null ? '' : raw).trim();
  if (!direct) return null;
  var param = shortParamOf(direct);
  if (param) {
    var decoded = decodeShortLink(param);
    if (decoded) return decoded;
    if (looksLikeTarget(param)) return param;
  }
  if (looksLikeTarget(direct)) return direct;
  return decodeShortLink(direct);
}

/* ===== core/85-torrentlink.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/torrentlink
 * Puente entre un enlace de descarga y un magnet reproducible.
 *
 * Los tres sitios nuevos (TorrentGalaxy, GranTorrent y Cinecalidad)
 * entregan la fuente de tres formas distintas:
 *
 *   1. magnet ya montado            (Cinecalidad, series)
 *   2. .torrent directo             (wp-content, files host)
 *   3. página intermedia con botón  (files host, acortadores)
 *
 * `resolveTorrentOrMagnet()` acepta las tres, sigue como mucho dos
 * saltos y siempre devuelve un objeto o null. Nunca lanza.
 * ------------------------------------------------------------------ */

/** ¿Los bytes son un .torrent? Un bencode válido empieza por "d8:" y suele traer "announce". */
function looksLikeTorrentBytes(bytes) {
  if (!bytes || bytes.length < 40) return false;
  if (bytes[0] !== 0x64 || bytes[1] !== 0x38) return false; // 'd' '8'
  var sample = bytesToText(bytes.subarray(0, Math.min(bytes.length, 512)));
  return sample.indexOf('announce') !== -1 || sample.indexOf('info') !== -1;
}

/**
 * Enlaces candidatos a descargar un .torrent dentro de un HTML.
 * Cubre href/magnet, atributos data-*, formularios de descarga y
 * redirecciones JS del tipo `location.href = "…"`.
 */
function findDownloadLinks(html, baseUrl) {
  var text = String(html == null ? '' : html);
  var out = [];
  var seen = {};

  function push(value) {
    if (!value) return;
    var href = decodeEntities(String(value).replace(/\\\//g, '/')).trim();
    if (!href || seen[href]) return;
    if (/^(javascript:|#|mailto:)/i.test(href)) return;
    seen[href] = true;
    out.push(href);
  }

  var anchor = /<a\b[^>]*>/gi;
  var match;
  while ((match = anchor.exec(text))) {
    var tag = match[0];
    var href = attrOf(tag, 'href');
    if (!href) continue;
    if (/^magnet:/i.test(href)) push(href);
    else if (/\.torrent(\?|$)/i.test(href)) push(absoluteUrl(href, baseUrl));
    else if (/(?:^|\/)(?:download|descargar|bajar|enlaces?)(?:[/?]|$)/i.test(href)) push(absoluteUrl(href, baseUrl));
    else if (/[?&](?:download|dl)=/i.test(href)) push(absoluteUrl(href, baseUrl));
  }

  var attribute = /<[a-z][^>]*\bdata-(?:magnet|torrent|href|url)=["']([^"']+)["'][^>]*>/gi;
  while ((match = attribute.exec(text))) {
    var value = decodeEntities(match[1]);
    if (/^magnet:/i.test(value) || /\.torrent(\?|$)/i.test(value)) push(absoluteUrl(value, baseUrl));
  }

  var form = /<form\b[^>]*action=["']([^"']+)["'][^>]*>/gi;
  while ((match = form.exec(text))) {
    var action = absoluteUrl(decodeEntities(match[1]), baseUrl);
    if (action && /(?:download|descargar|bajar|get)/i.test(action)) push(action);
  }

  var script = /(?:location(?:\.href)?\s*=|window\.open\()\s*["']([^"']+)["']/gi;
  while ((match = script.exec(text))) {
    var target = decodeEntities(match[1]);
    if (/^https?:\/\//i.test(target) && /(?:download|descargar|\.torrent)/i.test(target)) push(target);
  }

  return out;
}

/** Infohashes sueltos en un HTML/JSON (`infoHash`, `data-hash`, `infohash=…`). */
function findInfoHashes(text) {
  var haystack = String(text == null ? '' : text);
  var out = [];
  var seen = {};
  var re = /(?:info[_-]?hash|btih)["'\s:=]{1,6}([a-f0-9]{40}|[a-z2-7]{32})/gi;
  var match;
  while ((match = re.exec(haystack))) {
    var hash = String(match[1]).toLowerCase();
    if (seen[hash]) continue;
    seen[hash] = true;
    out.push(hash.length === 32 ? infoHashFromMagnet('magnet:?xt=urn:btih:' + hash) : hash);
  }
  return out;
}

function mimeLooksTorrent(response) {
  if (!response || !response.headers || !response.headers.get) return false;
  var type = String(response.headers.get('content-type') || '').toLowerCase();
  return type.indexOf('bittorrent') !== -1 || type.indexOf('x-torrent') !== -1;
}

/**
 * Convierte un enlace de descarga en magnet.
 * @param {string} url  magnet, .torrent o página intermedia
 * @param {object} options { headers, timeout, depth, maxDepth }
 * @returns {Promise<{magnet:string, infoHash:string, name:string, size:number|null}|null>}
 */
function resolveTorrentOrMagnet(url, options) {
  var opts = options || {};
  var depth = opts.depth || 0;
  var maxDepth = opts.maxDepth == null ? 2 : opts.maxDepth;
  var target = String(url == null ? '' : url).trim();
  if (!target) return Promise.resolve(null);

  if (/^magnet:/i.test(target)) {
    var hash = infoHashFromMagnet(target);
    if (!hash) return Promise.resolve(null);
    return Promise.resolve({
      magnet: target,
      infoHash: hash,
      name: magnetName(target),
      size: null
    });
  }

  return getBytes(target, { timeout: opts.timeout || 15000, headers: opts.headers })
    .then(function (bytes) {
      if (!bytes || !looksLikeTorrentBytes(bytes)) return null;
      var torrent = parseTorrent(bytes);
      if (!torrent || !torrent.infoHash) return null;
      return {
        magnet: buildMagnet(torrent.infoHash, torrent.name, torrent.size),
        infoHash: torrent.infoHash,
        name: torrent.name,
        size: torrent.size
      };
    })
    .then(function (found) {
      if (found) return found;
      if (depth >= maxDepth) return null;

      return getText(target, { timeout: opts.timeout || 15000, headers: opts.headers })
        .then(function (html) {
          if (!html) return null;
          var links = findDownloadLinks(html, target).filter(function (link) {
            return link !== target;
          });
          if (!links.length) return null;

          var index = 0;
          function next() {
            if (index >= links.length || index >= 4) return Promise.resolve(null);
            var link = links[index++];
            return resolveTorrentOrMagnet(link, {
              headers: opts.headers,
              timeout: opts.timeout,
              depth: depth + 1,
              maxDepth: maxDepth
            }).then(function (result) {
              return result || next();
            });
          }
          return next();
        });
    })
    .catch(function () { return null; });
}

/** Solo la parte de host (`https://x.y`) de una URL. */
function originOf(url) {
  var match = /^(https?:\/\/[^/?#]+)/i.exec(String(url == null ? '' : url));
  return match ? match[1] : null;
}


/* ------------------------------------------------------------------
 * Cinecalidad · www.cinecalidad.am  (WordPress + reproductor propio)
 * Cine y series en latino (dual con audio original).
 *
 *   búsqueda  GET /?s=<término>                 (tarjetas .in_title)
 *   película  /ver-pelicula/<slug>/
 *   serie     /ver-serie/<slug>/  →  /ver-el-episodio/<slug>-<n>x<m>/
 *   fuentes   bloque DESCARGAR:
 *             · magnets directos          → se entregan tal cual
 *             · uTorrent / «Obtener torrent» → acortalink.net/s.php?i=<Base64>
 *             · Mega / Megaup / 1fichier / Mediafire → ?download=<Base64>
 *
 * El sitio es DooPlay: los reproductores online están en
 * `#playeroptionsul li[data-option]` (Vimeos, Hlswish…), pero sus
 * embeds van cifrados y con captcha, así que el provider se queda con
 * las descargas (torrent + magnet); los hosts de ficheros (Mega,
 * 1fichier) no son reproducibles desde Nuvio y se descartan.
 *
 * Aviso: el dominio cambia (cinecalidad.am → .org → …). Hay ajuste de
 * dominio y respaldo en los espejos conocidos.
 * ------------------------------------------------------------------ */

var CC_HOSTS = [
  'https://www.cinecalidad.am',
  'https://cinecalidad.am',
  'https://www.cinecalidad.org',
  'https://www.cinecalidad.ro',
  'https://www.cinecalidad.is'
];

var CC_HOST_LINKS = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:mega\.nz|megaup\.net|1fichier\.com|mediafire\.com|fireload\.com|krakenfiles\.com|ouo\.io|acortalink\.[a-z]+|acortame-esto\.com|short-info\.link)/i;

/** Charset propio del acortador del sitio: dígitos, minúsculas, mayúsculas, + y /. */
var CC_SAFE_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';

/** Base64 de verdad (descarta espacios, normaliza URL-safe y rellena). */
function ccB64Decode(raw) {
  var value = String(raw == null ? '' : raw).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!value) return null;
  value += '===='.slice(0, (4 - (value.length % 4)) % 4);
  var text = bytesToText(b64ToBytes(value));
  return text || null;
}

/**
 * `acortalink.net/s.php?i=` usa base64 con el alfabeto reordenado.
 * Se prueban las dos variantes conocidas antes de rendirse:
 *   1. Base64 estándar
 *   2. Base64 con el alfabeto propio del acortador
 */
function ccDecodeAportalink(raw) {
  var direct = decodeShortLinkOrUrl(raw);
  if (direct) return direct;

  var payload = String(raw == null ? '' : raw);
  var param = /[?&]i=([^&#]+)/i.exec(payload);
  if (param) payload = param[1];
  try { payload = decodeURIComponent(payload); } catch (e) { /* tal cual */ }
  payload = payload.replace(/\s+/g, '');
  if (!payload) return null;

  var standard = ccB64Decode(payload);
  if (standard && /^(?:https?:\/\/|magnet:\?)/i.test(standard.trim())) return standard.trim();

  // alfabeto propio: se traduce cada símbolo a su índice estándar
  var normalized = payload.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  var rebuilt = '';
  for (var i = 0; i < normalized.length; i++) {
    var index = CC_SAFE_CHARS.indexOf(normalized.charAt(i));
    if (index < 0) { rebuilt = ''; break; }
    rebuilt += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.charAt(index);
  }
  if (rebuilt) {
    var swapped = ccB64Decode(rebuilt);
    if (swapped && /^(?:https?:\/\/|magnet:\?)/i.test(swapped.trim())) return swapped.trim();
  }
  return null;
}

/** Tarjetas de /?s=<término>. */
function ccParseCards(html, baseUrl) {
  var items = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/(?:ver-pelicula|ver-serie|ver-el-episodio)\/[^"']+)["'][^>]*>([\s\S]{0,600}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(decodeEntities(match[1]), baseUrl);
    if (!url || seen[url]) continue;
    var inner = match[2];
    var titleEl = /<[^>]+class=["'][^"']*in_title[^"']*["'][^>]*>([\s\S]{1,200}?)<\/[a-z]+>/i.exec(inner);
    var titleAlt = attrOf(/<img\b[^>]*>/i.exec(inner) ? /<img\b[^>]*>/i.exec(inner)[0] : '', 'alt');
    var title = titleEl ? stripTags(titleEl[1]) : (titleAlt || stripTags(inner));
    title = title ? title.replace(/\s+/g, ' ').trim() : null;
    if (!title || title.length < 2) continue;
    if (/^(ver|descargar|cinecalidad|inicio|pel[ií]culas|series)$/i.test(title)) continue;
    seen[url] = true;

    var windowHtml = html.slice(match.index, match.index + 900);
    var qualityMatch = /(dual\s*1080p|4k|2160p|1080p|720p|full hd|hd|bluray|dvdrip|cam)/i.exec(windowHtml);
    items.push({
      url: url,
      title: title,
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : 'SD',
      year: parseYear(windowHtml.slice(0, 500)),
      isSeries: /\/ver-(?:serie|el-episodio)\//i.test(url)
    });
  }
  return items;
}

function ccSearch(host, term) {
  var url = host + '/?s=' + encodeURIComponent(String(term).replace(/\s+/g, '+'));
  return getText(url, { timeout: 16000 }).then(function (html) {
    return html ? ccParseCards(html, host) : [];
  });
}

/** Bloque DESCARGAR: filas con su etiqueta, calidad, audio y enlace. */
function ccParseDownloads(html, baseUrl) {
  var rows = [];
  var chunks = String(html).split(/<a\b/i);
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var hrefMatch = /^[^>]*href=["']([^"']+)["']/i.exec(chunk);
    if (!hrefMatch) continue;
    var href = decodeEntities(hrefMatch[1]);
    var tagEnd = chunk.indexOf('>');
    var tail = tagEnd >= 0 ? chunk.slice(tagEnd + 1, tagEnd + 400) : '';
    var label = stripTags(tail.split(/<\/a>/i)[0] || '').replace(/\s+/g, ' ').trim();
    var url = absoluteUrl(href, baseUrl);
    if (!url) continue;

    var isMagnet = /^magnet:/i.test(href);
    var isAportalink = /acortalink\.[a-z]+\/s\.php\?i=/i.test(href);
    var isInternalDownload = /[?&]download=/i.test(href) && /\/ver-(?:pelicula|el-episodio|serie)\//i.test(href);
    var isTorrentFile = /\.torrent(\?|$)/i.test(href);
    var isFileHost = CC_HOST_LINKS.test(href);

    if (!isMagnet && !isAportalink && !isInternalDownload && !isTorrentFile) continue;
    if (!isMagnet && isFileHost && !isAportalink) continue; // Mega, 1fichier…: no reproducibles

    var qualityMatch = /(dual\s*1080p|1080p|720p|4k|2160p|full hd|bluray|dvdrip|hdr|web-?dl)/i.exec(label);
    rows.push({
      url: url,
      label: label,
      payload: isAportalink ? (/[?&]i=([^&#]+)/i.exec(href) || [])[1] :
        isInternalDownload ? (/[?&]download=([^&#]+)/i.exec(href) || [])[1] : null,
      kind: isMagnet ? 'magnet' : isAportalink ? 'short' : isInternalDownload ? 'download' : 'torrent',
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : 'SD'
    });
  }
  return rows;
}

/** `?download=<Base64>` → URL del host de ficheros (se intenta el .torrent). */
function ccDecodeDownloadParam(payload) {
  var decoded = ccB64Decode(payload);
  if (!decoded) return null;
  var value = decoded.trim();
  if (/^magnet:/i.test(value) || /^https?:\/\//i.test(value)) return value;
  return null;
}

function ccPageAudio(html) {
  var audio = /Audio\s*:?\s*(?:<\/?[^>]+>\s*)*([^<|]{3,60})/i.exec(html);
  return audio ? (languageLabel(audio[1]) || 'Latino') : 'Latino';
}

function ccStreamsFromPage(pageUrl, info, label) {
  return getText(pageUrl, { timeout: 16000 }).then(function (html) {
    if (!html) return [];
    var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = h1 ? stripTags(h1[1]).replace(/\s+/g, ' ').trim() : (label || info.title);
    var language = ccPageAudio(html) || 'Latino';
    var qualityField = /Calidad\s*:?\s*(?:<\/?[^>]+>\s*)*([^<|]{2,40})/i.exec(html);
    var pageQuality = qualityField ? parseQuality(qualityField[1]) : 'SD';
    var rows = ccParseDownloads(html, pageUrl);

    if (!rows.length) return [];

    var suffix = label && label !== pageTitle ? ' · ' + label : '';

    return mapLimit(rows.slice(0, 6), 2, function (row) {
      var quality = row.quality !== 'SD' ? row.quality : pageQuality;

      if (row.kind === 'magnet') {
        return Promise.resolve(makeStream({
          name: 'Cinecalidad',
          title: pageTitle + suffix + ' · ' + quality,
          url: row.url,
          infoHash: infoHashFromMagnet(row.url),
          quality: quality,
          size: parseSize(row.label),
          language: language,
          provider: 'cinecalidad',
          type: 'torrent',
          headers: { Referer: pageUrl }
        }));
      }

      var target = null;
      if (row.kind === 'short') target = ccDecodeAportalink(row.payload);
      else if (row.kind === 'download') target = ccDecodeDownloadParam(row.payload);
      else target = row.url;

      if (!target) {
        log('cinecalidad', 'no se pudo decodificar ' + row.kind + ' en ' + pageUrl);
        return Promise.resolve(null);
      }

      if (/^magnet:/i.test(target)) {
        return Promise.resolve(makeStream({
          name: 'Cinecalidad',
          title: pageTitle + suffix + ' · ' + quality,
          url: target,
          infoHash: infoHashFromMagnet(target),
          quality: quality,
          size: parseSize(row.label),
          language: language,
          provider: 'cinecalidad',
          type: 'torrent',
          headers: { Referer: pageUrl }
        }));
      }

      return resolveTorrentOrMagnet(target, {
        headers: { Referer: pageUrl, 'User-Agent': UA },
        timeout: 16000,
        maxDepth: 2
      }).then(function (torrent) {
        if (!torrent) return null;
        return makeStream({
          name: 'Cinecalidad',
          title: pageTitle + suffix + ' · ' + quality,
          url: torrent.magnet,
          infoHash: torrent.infoHash,
          quality: quality,
          size: torrent.size || parseSize(row.label),
          language: language,
          provider: 'cinecalidad',
          type: 'torrent',
          headers: { Referer: pageUrl }
        });
      }).catch(function () { return null; });
    }).then(function (list) { return list.filter(Boolean); });
  });
}

function ccGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8', baseUrl: '' });

  return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
    var limit = parseInt(conf.maxResults, 10);
    if (!isFinite(limit) || limit <= 0) limit = 8;

    var hosts = CC_HOSTS.slice();
    if (conf.baseUrl) hosts.unshift(String(conf.baseUrl).replace(/\/$/, ''));

    var queries = searchQueries(info).slice(0, 2);
    if (!queries.length) return [];

    var cursor = 0;
    var found = [];

    function nextQuery() {
      if (cursor >= queries.length || found.length >= 8) return Promise.resolve(found);
      var term = queries[cursor++];
      var hostIndex = 0;

      function tryHost() {
        if (hostIndex >= hosts.length) return nextQuery();
        var host = hosts[hostIndex++].replace(/\/$/, '');
        return ccSearch(host, term).then(function (items) {
          if (items.length) {
            found = found.concat(items.map(function (item) { item.host = host; return item; }));
            return found;
          }
          return tryHost();
        }).catch(function () { return tryHost(); });
      }
      return tryHost();
    }

    return nextQuery().then(function (candidates) {
      var filtered = uniqueBy(candidates, function (item) { return item.url; }).filter(function (candidate) {
        if (info.isTv !== !!candidate.isSeries) return false;
        var score = Math.max(
          titleScore(candidate.title, info.title),
          titleScore(candidate.title, info.originalTitle)
        );
        return score >= 0.5;
      });

      filtered = filtered.slice(0, Math.min(limit, 5));
      if (!filtered.length) return [];

      return mapLimit(filtered, 2, function (candidate) {
        var host = candidate.host;

        if (!info.isTv) return ccStreamsFromPage(candidate.url, info);

        var slugMatch = /\/(?:ver-serie|ver-el-episodio)\/([^/]+?)(?:-\d{1,2}x\d{1,3})?\/?$/i.exec(candidate.url);
        var slug = slugMatch ? slugMatch[1] : null;
        var seasonNo = info.season == null ? 1 : info.season;
        var episodeNo = info.episode == null ? 1 : info.episode;

        if (slug && !/-\d{1,2}x\d{1,3}$/i.test(candidate.url)) {
          var episodeUrl = host + '/ver-el-episodio/' + slug + '-' + seasonNo + 'x' + episodeNo + '/';
          return ccStreamsFromPage(episodeUrl, info, seasonEpisodeLabel(seasonNo, episodeNo))
            .catch(function () { return []; });
        }

        return ccStreamsFromPage(candidate.url, info, seasonEpisodeLabel(seasonNo, episodeNo))
          .catch(function () { return []; });
      }).then(function (groups) {
        var all = [];
        for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
        return finalizeStreams('Cinecalidad', all, { max: limit });
      });
    });
  }).catch(function (error) {
    log('cinecalidad', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'Cinecalidad' },
    { type: 'info', label: 'Las fuentes salen del bloque DESCARGAR: magnets directos y enlaces uTorrent protegidos con acortalink (Base64). Los hosts de ficheros (Mega, 1fichier) no se incluyen porque no se pueden reproducir.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] },
    { type: 'text', key: 'baseUrl', label: 'Dominio actual (opcional)', placeholder: 'https://www.cinecalidad.am' }
  ]);
}

module.exports = { getStreams: ccGetStreams, onSettings: onSettings };

})();
