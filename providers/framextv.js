/* ------------------------------------------------------------------
 * Nébula Scrapers · framextv
 * Generado por build.js a partir de src/core + src/providers.
 * 2026-11-23 · no editar a mano.
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

/** Tipo de contenido según el ID que entregue el cliente (Nuvio usa tv/anime). */
function isSeriesLikeType(value) {
  var kind = String(value == null ? '' : value).trim().toLowerCase();
  return kind === 'series' || kind === 'tv' || kind === 'show' || kind === 'anime';
}


/** Nombre de archivo sintético para que las insignias de calidad del cliente
 * (resolución, códec, idioma) puedan leer la opción. No es una ruta real. */
function syntheticFilename(title, quality, language) {
  var base = norm(title).replace(/\s+/g, '.').slice(0, 90) || 'nebula';
  var parts = [base];
  if (language) parts.push(norm(language).replace(/\s+/g, '') || 'und');
  if (quality && quality !== 'SD') parts.push(String(quality).toLowerCase());
  return parts.join('.') + '.mp4';
}

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

/* Una similitud parcial no basta: evita confundir secuelas y títulos parecidos.
 * Solo se quitan marcas al final; las palabras dentro del título importan. */
function titleIdentity(value, stripSeason) {
  var title = norm(value).replace(/^(?:el|la|los|las|the)\s+/, '');
  var previous;
  do {
    previous = title;
    title = title.replace(/\s+(?:latino|latina|castellano|espanol|subtitulado|vose|dual)$/, '');
    if (stripSeason) {
      title = title.replace(/\s+(?:(?:s|t)\s*0*\d{1,2}|(?:temporada|season|temp)\s*0*\d{1,2}|0*\d{1,2}\s*(?:temporada|season))$/, '');
    }
  } while (title !== previous);
  return title;
}

function sameCatalogTitle(candidate, info, stripSeason) {
  var identity = titleIdentity(candidate, stripSeason);
  if (!identity) return false;
  var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
  for (var i = 0; i < titles.length; i++) {
    if (identity === titleIdentity(titles[i], stripSeason)) return true;
  }
  return false;
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
  var re = new RegExp('(?:^|[\\s<])' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
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

/** Observador de bloqueos que inyecta el servidor (no el usuario).
 * Se mantiene fuera de `settings()` para que ningún ajuste del cliente pueda
 * sustituirlo por una función arbitraria. */
function blockedObserver() {
  var provided = typeof SCRAPER_SETTINGS !== 'undefined' && SCRAPER_SETTINGS ? SCRAPER_SETTINGS : null;
  return provided && typeof provided.onBlocked === 'function' ? provided.onBlocked : null;
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

/* Algunos reproductores atan sus desafíos a la sesión que abrió la página.
 * Nuvio no garantiza un cookie jar nativo, así que lo llevamos por host. */
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
        var status = response && typeof response.status === 'number' ? response.status : 0;
        var finalUrl = (response && response.url) || url;
        absorbCookies(hostKeyOf(finalUrl) || hostKey, response && response.headers);
        // Algunos bloqueos llegan con 403/503 y un desafío (Anubis, LiteSpeed)
        // que hay que reconocer en el cuerpo. En páginas se conserva ese texto
        // para poder resolverlo; nunca se convierte un error en éxito.
        var challengeStatus = opts.pageOnly && (status === 403 || status === 503);
        if (!response || (!response.ok && !challengeStatus)) {
          return { ok: false, status: status, url: finalUrl, bytes: new Uint8Array(0), text: '', headers: (response && response.headers) || {} };
        }
        var contentType = response.headers && response.headers.get ? String(response.headers.get('content-type') || '') : '';
        // Un 403 puede traer el cuerpo vacío o binario: se marca recordable
        // para que el orquestador printe las cabeceras del bloqueo.
        var recordable = opts.pageOnly === 'record' && (status === 403 || status === 503);
        if (opts.pageOnly && (directMediaUrl(finalUrl) || /^(?:video\/|audio\/|application\/(?:vnd\.apple\.mpegurl|x-mpegurl|octet-stream))/i.test(contentType))) {
          return { ok: !!response.ok, status: status, url: finalUrl, isMedia: true, bytes: new Uint8Array(0), text: '', headers: response.headers || {} };
        }
        if (recordable && !/text\/|json|html/i.test(contentType)) {
          // Sin cuerpo legible: solo queda el estado y las cabeceras.
          try { response.arrayBuffer().catch(function () {}); } catch (e) { /* ignora */ }
          return { ok: false, status: status, url: finalUrl, bytes: new Uint8Array(0), text: '',
            headers: response.headers || {}, challenge: true, blocked: true };
        }
        return response.arrayBuffer().then(function (buffer) {
          var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
          return { ok: !!response.ok, status: status, url: finalUrl, bytes: bytes, text: bytesToText(bytes),
            headers: response.headers || {}, challenge: challengeStatus, blocked: challengeStatus };
        }, function () {
          return response.text().then(function (text) {
            return { ok: !!response.ok, status: status, url: finalUrl, bytes: utf8ToBytes(text), text: text, headers: response.headers || {} };
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
      // El query puede contener claves de API o tokens temporales.
      log('http', res.status || res.error && res.error.message, String(url).replace(/[?#].*$/, '?…'));
      return '';
    }
    return res.text;
  });
}

/* Texto para documentos grandes y de confianza (mapas de IDs de anime).
 * Mismo transporte, con un límite de lectura propio: si el cuerpo no cabe, la
 * promesa queda vacía en lugar de crecer sin control. */
function getTextLimited(url, maxBytes, options) {
  var limit = Math.max(1024, Math.min(Number(maxBytes) || 65536, 4000000));
  return request(url, options).then(function (res) {
    if (!res.ok || !res.text) return '';
    if (res.bytes && res.bytes.length > limit) return '';
    if (res.text.length > limit) return '';
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

/* ===== core/20-hash.js ===== */
/* SHA-256 en JS puro para los desafíos de los reproductores; funciona en
 * QuickJS sin depender de crypto de Node ni de crypto.subtle. */

function rotr32(value, bits) {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function paddedWords(bytes) {
  var lengthBitsHigh = Math.floor((bytes.length * 8) / 4294967296);
  var lengthBitsLow = (bytes.length * 8) >>> 0;
  var total = (((bytes.length + 8) >> 6) + 1) << 4;
  var words = new Array(total);
  for (var i = 0; i < total; i++) words[i] = 0;
  for (var j = 0; j < bytes.length; j++) {
    words[j >> 2] |= bytes[j] << (24 - (j % 4) * 8);
  }
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[total - 1] = lengthBitsLow;
  words[total - 2] = lengthBitsHigh;
  return words;
}

function wordsToHex(words) {
  var hex = '';
  for (var i = 0; i < words.length; i++) hex += ('00000000' + (words[i] >>> 0).toString(16)).slice(-8);
  return hex;
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
  var words = paddedWords(data);
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
  var value = String(text == null ? '' : text);
  // El servidor Node puede inyectar su implementación nativa para acotar
  // el tiempo de CPU. Los runtimes sin ella conservan el SHA-256 puro.
  if (typeof HOSTED_SHA256_HEX === 'function') {
    try { return HOSTED_SHA256_HEX(value); } catch (e) { /* usa el fallback */ }
  }
  return sha256Bytes(utf8ToBytes(value));
}

/* ===== core/40-ids.js ===== */
/* ------------------------------------------------------------------
 * Nébula Scrapers · core/ids
 * Formas de ID que envían los clientes (Stremio, Nuvio) → metadatos.
 *
 * Nuvio nombra los mismos títulos de varias formas:
 *   tt0944947:1:2      IMDb con temporada y episodio
 *   tmdb:1399:1:2      TMDB con temporada y episodio (y tmdb-1399, tmdb_1399, 1399)
 *   tvdb:121361:1:2    TheTVDB (no es consultable aquí: se convierte con Wikidata)
 *   kitsu:7442:1       anime (Kitsu)
 *   mal:21:1           anime (MyAnimeList)
 *   anilist:16498:1    anime (AniList)
 *   anidb:1:1          anime (AniDB)
 * Un ID con URL, esquema o demasiados segmentos no es un identificador de
 * catálogo y se rechaza antes de consultar ninguna fuente.
 * ------------------------------------------------------------------ */

var ID_KINDS = ['imdb', 'tmdb', 'tvdb', 'kitsu', 'mal', 'anilist', 'anidb'];
var ANIME_KINDS = ['kitsu', 'mal', 'anilist', 'anidb'];

/**
 * @returns {{type:'movie'|'series', season:number|null, episode:number|null,
 *            imdbId:string|null, tmdbId:string|null, tvdbId:string|null,
 *            anime:{site:string,id:string}|null}|null}
 */
function normalizeContentId(type, raw) {
  var kind = String(type || '').toLowerCase();
  var text = String(raw == null ? '' : raw).trim();
  if (!text || text.length > 200 || /[\/\\?#@\s]/.test(text)) return null;
  if (kind !== 'movie' && kind !== 'series' && kind !== 'tv' && kind !== 'anime') return null;
  var parts = text.split(':');
  if (parts.length > 4) return null;
  for (var i = 0; i < parts.length; i++) if (!parts[i]) return null;

  var head = parts[0].toLowerCase();
  var body = parts[1] || '';
  var tail = parts.slice(2);
  var result = {
    type: kind === 'movie' ? 'movie' : 'series',
    season: null, episode: null,
    imdbId: null, tmdbId: null, tvdbId: null, anime: null
  };

  if (/^tt\d{5,12}$/.test(head)) {
    result.imdbId = head;
  } else if (parts.length > 1 && ID_KINDS.indexOf(head) !== -1) {
    if (!/^\d{1,9}$/.test(body) || /^0+$/.test(body)) return null;
    if (head === 'imdb') return null;
    if (head === 'tmdb') result.tmdbId = body;
    else if (head === 'tvdb') result.tvdbId = body;
    else result.anime = { site: head, id: body };
  } else if (/^\d{1,9}$/.test(head) && !/^0+$/.test(head)) {
    result.tmdbId = head;
  } else {
    return null;
  }

  // Películas: sin temporada ni episodio. Series, TVDB y anime: exactamente
  // dos segmentos (o ninguno para una película de anime).
  if (result.type === 'movie') {
    if (tail.length) return null;
    return result;
  }
  // El cliente puede enviar el ID de contenido solo (la temporada y el
  // episodio llegan como argumentos aparte) o con «:temporada:episodio».
  if (!tail.length) return result;
  if (tail.length !== 2) return null;
  var season = Number(tail[0]);
  var episode = Number(tail[1]);
  if (!Number.isInteger(season) || !Number.isInteger(episode)) return null;
  if (season < 1 || season > 999 || episode < 1 || episode > 9999) return null;
  result.season = season;
  result.episode = episode;
  return result;
}

/** Edad mínima para mostrar: «tt0944947», «tmdb:1399», «kitsu:7442». */
function contentIdLabel(parsed) {
  if (!parsed) return '';
  if (parsed.imdbId) return parsed.imdbId;
  if (parsed.anime) return parsed.anime.site + ':' + parsed.anime.id;
  if (parsed.tmdbId) return 'tmdb:' + parsed.tmdbId;
  if (parsed.tvdbId) return 'tvdb:' + parsed.tvdbId;
  return '';
}

/* ------------------------- Wikidata (sin clave) ------------------------- */

/* Solo se consultan propiedades externas conocidas y el valor es siempre
 * numérico, así que la consulta no incorpora texto del cliente. */
function wikidataLookup(property, value) {
  if (!/^P\d{1,6}$/.test(String(property)) || !/^\d{1,9}$/.test(String(value))) return Promise.resolve(null);
  var query = 'SELECT ?imdb ?tmdb ?tvdb WHERE {' +
    ' ?item wdt:' + property + ' "' + value + '" .' +
    ' OPTIONAL { ?item wdt:P345 ?imdb }' +
    ' OPTIONAL { ?item wdt:P4983 ?tmdb }' +
    ' OPTIONAL { ?item wdt:P4835 ?tvdb }' +
    '} LIMIT 1';
  var url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);
  return getJson(url, { timeout: 9000, retries: 0, headers: { Accept: 'application/sparql-results+json' } })
    .then(function (data) {
      var rows = data && data.results && Array.isArray(data.results.bindings) ? data.results.bindings : [];
      if (!rows.length) return null;
      var row = rows[0];
      function text(key) { return row[key] && typeof row[key].value === 'string' ? row[key].value : ''; }
      var imdb = /^tt\d{5,12}$/i.test(text('imdb')) ? text('imdb').toLowerCase() : null;
      var tmdb = /^\d{1,9}$/.test(text('tmdb')) ? text('tmdb') : null;
      var tvdb = /^\d{1,9}$/.test(text('tvdb')) ? text('tvdb') : null;
      if (!imdb && !tmdb && !tvdb) return null;
      return { imdbId: imdb, tmdbId: tmdb, tvdbId: tvdb };
    }, function () { return null; });
}

/* -------------------------- Anime (sin clave) -------------------------- */

/* ani.zip reúne los IDs de cada anime (Kitsu, MAL, AniList, AniDB), sus
 * títulos y los episodios. La respuesta puede ser muy grande, así que se lee
 * con un límite de bytes propio; solo se usan títulos, año y si es película. */
function aniZipLookup(site, id) {
  var param = site === 'mal' ? 'mal_id' : site === 'kitsu' ? 'kitsu_id'
    : site === 'anilist' ? 'anilist_id' : site === 'anidb' ? 'anidb_id' : '';
  if (!param || !/^\d{1,9}$/.test(String(id))) return Promise.resolve(null);
  var url = 'https://api.ani.zip/mappings?' + param + '=' + id;
  return getTextLimited(url, 4000000, { timeout: 12000, retries: 0 }).then(function (text) {
    if (!text) return null;
    var data = null;
    try { data = JSON.parse(text); } catch (e) { return null; }
    if (!data || typeof data !== 'object') return null;
    var titles = data.titles && typeof data.titles === 'object' ? data.titles : {};
    var names = [];
    var order = ['es', 'es-419', 'es-CA', 'en', 'x-jat', 'ja', 'pt-BR', 'fr', 'it'];
    for (var i = 0; i < order.length; i++) {
      if (typeof titles[order[i]] === 'string' && titles[order[i]]) names.push(titles[order[i]].trim());
    }
    var episodes = data.episodes && typeof data.episodes === 'object' ? data.episodes : {};
    var first = episodes['1'] || episodes[1] || null;
    var year = null;
    if (first && typeof first.airDate === 'string') {
      var match = /^(\d{4})/.exec(first.airDate);
      if (match) year = parseInt(match[1], 10);
    }
    return {
      titles: names.filter(function (value, index, all) { return value && all.indexOf(value) === index; }),
      year: year,
      isMovie: !first || !first.seasonNumber,
      tvdbId: first && /^\d{1,9}$/.test(String(first.tvdbShowId || '')) ? String(first.tvdbShowId) : null
    };
  }, function () { return null; });
}

/**
 * Metadatos buscables para un ID de anime. `isTv` se decide por los episodios
 * publicados; el número de episodio lo aporta el cliente y estos sitios usan
 * numeración continua, así que no se recalcula.
 */
function resolveAnimeMedia(parsed) {
  if (!parsed || !parsed.anime) return Promise.resolve(null);
  return aniZipLookup(parsed.anime.site, parsed.anime.id).then(function (info) {
    if (!info || !info.titles.length) return null;
    var isTv = info.isMovie !== true;
    var pending = info.tvdbId && isTv ? wikidataLookup('P4835', info.tvdbId) : Promise.resolve(null);
    return pending.then(function (ids) {
      var extra = ids || {};
      return {
        id: contentIdLabel(parsed),
        tmdbId: extra.tmdbId || null,
        imdbId: extra.imdbId || null,
        isTv: isTv,
        season: isTv ? parsed.season : null,
        episode: isTv ? parsed.episode : null,
        title: info.titles[0],
        originalTitle: info.titles[0],
        year: info.year || null,
        titles: info.titles,
        seasons: []
      };
    });
  });
}

/**
 * Punto único que usan los providers: convierte el ID ya normalizado en los
 * metadatos que necesitan las búsquedas, sea IMDb, TMDB, TVDB o anime.
 */
function resolveRequestMedia(parsed) {
  if (!parsed) return Promise.resolve(null);
  if (parsed.anime) return resolveAnimeMedia(parsed);
  if (parsed.tvdbId) {
    return wikidataLookup('P4835', parsed.tvdbId).then(function (ids) {
      var target = ids && (ids.imdbId || ids.tmdbId);
      if (!target) return null;
      return resolveMedia(target, 'series', parsed.season, parsed.episode);
    });
  }
  return resolveMedia(contentIdLabel(parsed), parsed.type, parsed.season, parsed.episode);
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

/** Cinemeta: metadatos de IMDb sin clave. Una sola tentativa: si el host no
 * responde, la resolución sigue por la ficha pública de IMDb. */
function cinemetaRequest(id, type) {
  return request('https://v3-cinemeta.strem.io/meta/' + type + '/' + encodeURIComponent(id) + '.json',
    { timeout: 7000, retries: 0 })
    .then(function (res) {
      if (!res || !res.ok) return null;
      var parsed = null;
      try { parsed = JSON.parse(res.text); } catch (e) { return null; }
      var meta = parsed && parsed.meta;
      if (!meta) return null;
      // Cinemeta publica el id de TMDB: sirve para no depender de la página
      // pública (que responde 403 al servidor) al resolver un título.
      var tmdbId = /^\d{1,9}$/.test(String(meta.moviedb_id || meta.themoviedb_id || ''))
        ? String(meta.moviedb_id || meta.themoviedb_id) : null;
      return {
        tmdbId: tmdbId,
        imdbId: id,
        isTv: meta.type === 'series',
        title: meta.name || meta.original_name || '',
        originalTitle: meta.original_name || meta.name || '',
        year: meta.year ? parseInt(String(meta.year).slice(0, 4), 10) : null,
        titles: [meta.name, meta.original_name].filter(Boolean)
      };
    }, function () { return null; });
}

/** Título deducido del slug de IMDb: /title/tt0816692/ → /title/tt0816692/interstellar.
 * Evita quedarse sin ninguna consulta cuando Cinemeta y TMDB no responden. */
function imdbSlugTitle(id) {
  return request('https://www.imdb.com/title/' + encodeURIComponent(id) + '/',
    { timeout: 8000, retries: 0, redirect: 'manual' }).then(function (res) {
    var location = res && res.headers && res.headers.get ? res.headers.get('location') : '';
    var match = /\/title\/tt\d{5,12}\/([a-z0-9-]{2,80})\/?/i.exec(location || '');
    if (!match) return null;
    var raw = match[1];
    var state = /(\d{4})$/.exec(raw);
    var title = raw.replace(/-\d{4}$/, '').replace(/-/g, ' ').trim();
    if (!title || !/[a-z]/i.test(title)) return null;
    title = title.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return {
      tmdbId: null, imdbId: id, isTv: null,
      title: title, originalTitle: title,
      year: state ? parseInt(state[1], 10) : null,
      titles: [title]
    };
  }, function () { return null; });
}

function resolveImdb(id, isTv) {
  var type = isTv ? 'series' : 'movie';
  return cinemetaRequest(id, type).then(function (meta) {
    if (meta && meta.title) return meta;
    return imdbSlugTitle(id);
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
      }),
      seasons: type === 'tv' && Array.isArray(primary.seasons) ? primary.seasons : []
    };
  });
}

/* Para IDs IMDb, TMDB añade títulos localizados y los recuentos de las
 * temporadas, necesarios para algunos animes con numeración continua. */
function resolveImdbFromApi(imdbId, isTv) {
  var key = tmdbApiKey();
  if (!key) return Promise.resolve(null);
  var url = 'https://api.themoviedb.org/3/find/' + encodeURIComponent(imdbId) +
    '?api_key=' + encodeURIComponent(key) + '&external_source=imdb_id';
  return getJson(url, { timeout: 9000, retries: 0 }).then(function (result) {
    var matches = result && result[isTv ? 'tv_results' : 'movie_results'];
    var id = Array.isArray(matches) && matches[0] && String(matches[0].id || '');
    if (!id || !/^\d+$/.test(id)) return null;
    return resolveFromApi(id, isTv ? 'tv' : 'movie');
  });
}

function mergeImdbMetadata(imdb, tmdb, imdbId) {
  if (!tmdb) return imdb;
  var titles = (tmdb.titles || []).concat(imdb && imdb.titles || []);
  return {
    tmdbId: tmdb.tmdbId,
    imdbId: imdbId,
    isTv: tmdb.isTv,
    title: tmdb.title || imdb && imdb.title || '',
    originalTitle: tmdb.originalTitle || imdb && imdb.originalTitle || '',
    year: tmdb.year || imdb && imdb.year || null,
    titles: titles.filter(function (value, index, all) { return value && all.indexOf(value) === index; }),
    seasons: tmdb.seasons || []
  };
}

function webResult(id, type, title, year, imdbId) {
  if (!title) return null;
  return {
    tmdbId: String(id),
    imdbId: imdbId || null,
    isTv: type === 'tv',
    title: title,
    originalTitle: title,
    year: year || null,
    titles: [title],
    seasons: []
  };
}

/* Sin TMDB_API_KEY la página pública suele bloquear al servidor. Primero se
 * intenta la redirección corta, que expone el título en la URL
 * (/movie/157336-interstellar), y después Wikidata, que no pide clave. */
function slugTitle(slug) {
  // El slug de TMDB empieza por el propio ID («157336-interstellar»): se quita
  // para no buscar «157336 Interstellar».
  var text = String(slug || '').replace(/^\d+-/, '').replace(/-\d{3,}$/, '').replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); }).trim();
  return text && /[a-z]/i.test(text) && text.length <= 160 ? text : '';
}

function resolveFromWeb(id, mediaType) {
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  var found = null;

  function page() {
    return getText('https://www.themoviedb.org/' + type + '/' + encodeURIComponent(id), { timeout: 9000 })
      .then(function (html) {
        if (!html) return null;
        var info = titleFromHtml(html);
        if (!info) return null;
        var imdb = /\/(?:imdb|title)\/(tt\d{5,12})/i.exec(html);
        return webResult(id, type, info.title, info.year, imdb ? imdb[1].toLowerCase() : null);
      }, function () { return null; });
  }

  function redirectedSlug() {
    // La ficha corta redirige a /movie/157336-interstellar.
    return request('https://www.themoviedb.org/' + type + '/' + encodeURIComponent(id),
      { timeout: 9000, retries: 0, redirect: 'manual' }).then(function (res) {
      var location = res && res.headers && res.headers.get ? res.headers.get('location') : '';
      var slug = /^https?:\/\/www\.themoviedb\.org\/(?:movie|tv)\/[0-9]+-([a-z0-9-]+)\/?$/i.exec(location || '');
      var fromSlug = slug ? slugTitle(slug[1]) : '';
      return fromSlug ? webResult(id, type, fromSlug, parseYear(location), null) : null;
    }, function () { return null; });
  }

  function fromWikidata() {
    // Wikidata solo aporta IDs; el título sale de IMDb o de TVMaze.
    var property = type === 'tv' ? 'P4983' : 'P4947';
    if (typeof wikidataLookup !== 'function') return Promise.resolve(null);
    return Promise.resolve(wikidataLookup(property, id)).then(function (ids) {
      if (!ids) return null;
      if (ids.imdbId) {
        return resolveImdb(ids.imdbId, type === 'tv').then(function (imdb) {
          return imdb && imdb.title ? webResult(id, type, imdb.title, imdb.year, ids.imdbId) : null;
        }, function () { return null; });
      }
      if (ids.tvdbId) {
        return getJson('https://api.tvmaze.com/lookup/shows?thetvdb=' + ids.tvdbId, { timeout: 8000, retries: 0 })
          .then(function (show) {
            return show && show.name ? webResult(id, type, String(show.name).slice(0, 200), parseYear(show.premiered || ''), null) : null;
          }, function () { return null; });
      }
      return null;
    }, function () { return null; });
  }

  return page().then(function (result) {
    if (result) { found = result; return null; }
    return redirectedSlug().then(function (shortResult) {
      if (shortResult) found = shortResult;
      return null;
    });
  }).then(function () {
    return found || fromWikidata();
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
  var isTv = typeof isSeriesLikeType === 'function'
    ? isSeriesLikeType(mediaType) || season != null
    : mediaType === 'tv' || mediaType === 'series' || season != null;
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
    titles: [],
    seasons: []
  };

  var resolver;
  if (info.imdbId) {
    resolver = Promise.all([resolveImdb(info.imdbId, info.isTv), resolveImdbFromApi(info.imdbId, info.isTv)])
      .then(function (results) { return mergeImdbMetadata(results[0], results[1], info.imdbId); });
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
    info.seasons = Array.isArray(meta.seasons) ? meta.seasons : [];
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
  if (Array.isArray(info.titles)) {
    for (var i = 0; i < info.titles.length; i++) if (info.titles[i]) list.push(info.titles[i]);
  }
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
/* Direct streams only. Nuvio fetches the media itself; no video is relayed. */
function makeStream(data) {
  var stream = {
    name: data.name || 'Nébula',
    title: data.title || data.name || 'Sin título',
    url: data.url,
    quality: data.quality || 'SD',
    provider: data.provider || PLUGIN_TAG,
    type: 'direct'
  };
  if (data.language) stream.language = data.language;
  if (data.headers) stream.headers = data.headers;
  if (data.subtitles && data.subtitles.length) stream.subtitles = data.subtitles;
  // El mismo reproductor sigue en el siguiente episodio y las insignias de
  // Nuvio leen `filename`; ninguno de los dos cambia el enlace entregado.
  stream.bingeGroup = data.bingeGroup || providerBingeGroup(data.provider, data.name);
  stream.filename = data.filename || syntheticFilename(stream.title, stream.quality, data.language);
  return stream;
}

/** Agrupa las opciones del mismo reproductor para seguir la serie. */
function providerBingeGroup(provider, name) {
  var base = norm(String(provider || 'nebula'));
  var extra = norm(String(name || ''));
  if (extra && extra !== base && extra.indexOf(base) === -1) base = base + ' ' + extra;
  return (base.replace(/\s+/g, '-') || 'nebula').slice(0, 60);
}

function finalizeStreams(label, streams, options) {
  var limit = Math.max(1, Math.min(20, parseInt((options || {}).max, 10) || 8));
  var playable = (streams || []).filter(function (stream) {
    return stream && directMediaUrl(stream.url);
  });
  playable = uniqueBy(playable, function (stream) { return stream.url; });
  return sortByQuality(playable).slice(0, limit);
}

function mapLimit(items, limit, iterator) {
  var results = new Array(items.length);
  var index = 0;
  function worker() {
    if (index >= items.length) return Promise.resolve();
    var current = index++;
    return Promise.resolve().then(function () { return iterator(items[current], current); })
      .then(function (value) { results[current] = value; }, function () { results[current] = null; })
      .then(worker);
  }
  var workers = [];
  for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  return Promise.all(workers).then(function () { return results; });
}

function languageLabel(text) {
  var s = String(text == null ? '' : text);
  if (/\b(?:latino|lat)\b/i.test(s)) return 'Latino';
  if (/castellano|espa(ñ|n)ol|\besp\b/i.test(s)) return 'Castellano';
  if (/vose|subtitulado|\bsub\b/i.test(s)) return 'Subtitulado';
  if (/\bjap\b/i.test(s)) return 'Japonés';
  return null;
}

/* ===== core/70-direct.js ===== */
/*
 * Resolución de páginas de reproductores a HLS/MP4. Solo analiza texto: nunca
 * ejecuta JavaScript de terceros ni solicita playlists, segmentos o vídeos.
 */

function unescapePlayerText(value) {
  return decodeEntities(String(value || ''))
    .replace(/\\u0026/gi, '&').replace(/\\u003d/gi, '=')
    .replace(/\\u002f/gi, '/').replace(/\\x26/gi, '&')
    .replace(/\\\//g, '/').replace(/\\"/g, '"').replace(/\\'/g, "'");
}

function publicHttpUrl(value, base) {
  var raw = unescapePlayerText(value).trim().replace(/`/g, '');
  if (/^https?%3a/i.test(raw)) {
    try { raw = decodeURIComponent(raw); } catch (e) { return null; }
  }
  // Rechazar cualquier esquema no HTTP, incluso about:blank, en lugar de
  // interpretarlo como una ruta relativa a la página del reproductor.
  if (!raw || (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw))) return null;
  var absolute = absoluteUrl(raw, base);
  if (!absolute || !/^https?:\/\//i.test(absolute)) return null;
  try {
    // La URL de Nuvio no expone username/password: validar también la
    // autoridad sin depender de esas propiedades del navegador.
    var authority = /^https?:\/\/([^/?#]+)/i.exec(absolute);
    if (!authority || authority[1].indexOf('@') !== -1) return null;
    var parsed = new URL(absolute);
    var host = String(parsed.hostname || '').toLowerCase().replace(/\.+$/, '');
    if (parsed.username || parsed.password || !host || /(?:^|\.)(?:localhost|local|internal|localdomain)$/.test(host)) return null;
    if (host.indexOf(':') !== -1 || /^\[/.test(host) || /[%\\]/.test(host)) return null;
    // El polyfill de Nuvio usa java.net.URL, que no normaliza todas las
    // representaciones numéricas de IPv4 (127.1, octal, hexadecimal...).
    // Rechazamos cualquier literal numérico y nombres de una sola etiqueta;
    // no podemos validar la resolución DNS desde el plugin.
    if (host.indexOf('.') === -1 || /^(?:\d+|0x[0-9a-f]+)(?:\.(?:\d+|0x[0-9a-f]+))*$/i.test(host)) return null;
    return parsed.href;
  } catch (e) { return null; }
}

function directMediaUrl(value) {
  var url = publicHttpUrl(value);
  if (!url) return null;
  try {
    var parsed = new URL(url);
    return /\.(?:m3u8|mp4)$/i.test(parsed.pathname) ? url : null;
  } catch (e) { return null; }
}

function playerOrigin(url) {
  try { return new URL(url).origin; } catch (e) { return ''; }
}

function isPlayerAdvertisement(url) {
  try {
    var parsed = new URL(url);
    var host = String(parsed.hostname || '').toLowerCase();
    var path = String(parsed.pathname || '').toLowerCase();
    return /(?:^|\.)(?:ads?|adserver|adservice|advert(?:ising|isement)?|doubleclick|googlesyndication|google-analytics|youtube|youtube-nocookie|youtu)(?:[.-]|$)/.test(host) ||
      /(?:^|\/)(?:ads?|adverts?|advertising|advertisement|anuncios?|publicidad|trailers?|pre-?rolls?|banners?)(?:[\/_.-]|$)/.test(path);
  } catch (e) { return true; }
}

/* Unpack the data-only Dean Edwards P.A.C.K.E.R format without eval(). */
function unpackPlayerScript(html) {
  var source = String(html || '');
  var pattern = /\}\s*\(\s*'((?:\\.|[^'\\])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'\\])*)'\s*\.split\(\s*'\|'\s*\)/g;
  var out = [];
  var match;
  var alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  while ((match = pattern.exec(source)) && out.length < 5) {
    var radix = parseInt(match[2], 10);
    var count = parseInt(match[3], 10);
    if (radix < 2 || radix > 62 || count < 1 || count > 2000 || match[1].length > 150000) continue;
    var words = match[4].split('|');
    var body = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    body = body.replace(/\b[0-9A-Za-z]+\b/g, function (token) {
      var index = 0;
      for (var i = 0; i < token.length; i++) {
        var digit = alphabet.indexOf(token.charAt(i));
        if (digit < 0 || digit >= radix) return token;
        index = index * radix + digit;
        if (index >= count) return token;
      }
      return words[index] || token;
    });
    out.push(body);
  }
  return out.join('\n');
}

function findDirectMedia(html, base) {
  var text = unescapePlayerText(String(html || '') + '\n' + unpackPlayerScript(html));
  var out = [];
  // Quoted source/file/src values and literal URLs. The path itself, not a
  // query parameter on an embed page, must end in .m3u8 or .mp4.
  var quoted = /["']([^"'<>\s]{1,2048}\.(?:m3u8|mp4)(?:[?#][^"'<>\s]*)?)["']/gi;
  var match;
  while ((match = quoted.exec(text)) && out.length < 40) {
    if (/[|{}]/.test(match[1]) || /https?:\/\//i.test(match[1].replace(/^https?:\/\//i, ''))) continue;
    var url = directMediaUrl(publicHttpUrl(match[1], base));
    if (!url || isPlayerAdvertisement(url)) continue;
    out.push(url);
  }
  var bare = /https?:\/\/[^"'<>\s\\]{1,1800}\.(?:m3u8|mp4)(?:\?[^"'<>\s\\]*)?/gi;
  while ((match = bare.exec(text)) && out.length < 40) {
    var direct = directMediaUrl(match[0]);
    if (direct && !isPlayerAdvertisement(direct)) out.push(direct);
  }
  return uniqueBy(out, function (url) { return url; });
}

function decodeBase64Text(value) {
  var text = String(value || '').trim();
  if (!/^[A-Za-z0-9+/_=-]+$/.test(text) || text.length > 50000) return '';
  try { return bytesToText(b64ToBytes(text)).trim(); } catch (e) { return ''; }
}

function pagePlayerLinks(html, base) {
  var links = [];
  var re = /<(?:iframe|a|button|li|div)\b[^>]*>/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && links.length < 30) {
    var tag = match[0];
    var raw = attrOf(tag, 'data-player');
    if (raw && !/^(?:https?:|\/)/i.test(raw)) raw = decodeBase64Text(raw);
    var candidates = [raw];
    if (/^<iframe\b/i.test(tag)) {
      // LiteSpeed y otros cargadores dejan src=about:blank y guardan la
      // dirección efectiva en uno de estos atributos.
      candidates.push(attrOf(tag, 'data-litespeed-src'), attrOf(tag, 'data-src'), attrOf(tag, 'src'));
    }
    candidates.push(attrOf(tag, 'data-url'));
    for (var i = 0; i < candidates.length; i++) {
      var url = publicHttpUrl(candidates[i], base);
      if (!url || isPlayerAdvertisement(url) || /(?:^|\.)facebook\./i.test(new URL(url).hostname)) continue;
      links.push({ url: url, name: attrOf(tag, 'data-name') || '' });
      break;
    }
  }
  // Embed69 publica sus reproductores en onclick="go_to_playerVast('...')".
  // El nombre del servidor está en el <span> que sigue al onclick, dentro del
  // mismo <li>; se lee hacia delante y se descartan las descargas.
  var vast = /go_to_playerVast\(\s*['"]([^'"]+)['"]/gi;
  var vastMatch;
  var vastText = String(html || '');
  while ((vastMatch = vast.exec(vastText)) && links.length < 40) {
    var vastUrl = publicHttpUrl(String(vastMatch[1]).trim(), base);
    if (!vastUrl || isPlayerAdvertisement(vastUrl)) continue;
    var nearby = vastText.slice(vastMatch.index, vastMatch.index + 320);
    var labelMatch = /<span\b[^>]*>([\s\S]{1,60}?)<\/span>/i.exec(nearby);
    var label = labelMatch ? stripTags(labelMatch[1]).trim() : '';
    if (/download|1fichier/i.test(label)) continue;
    links.push({ url: vastUrl, name: label });
  }

  // A few video hosts use a simple redirect instead of an iframe.
  var redirect = /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i.exec(String(html || ''));
  if (redirect) {
    var next = publicHttpUrl(redirect[1], base);
    if (next) links.push({ url: next, name: '' });
  }
  return uniqueBy(links, function (item) { return item.url; });
}

function cryptoJsModule() {
  try {
    if (typeof CryptoJS !== 'undefined') return CryptoJS;
    if (typeof require === 'function') return require('crypto-js');
  } catch (e) { /* no se expone en todos los runtimes */ }
  return null;
}

function aesPlayerLink(encoded, keyHex) {
  var C = cryptoJsModule();
  var bytes = b64ToBytes(encoded);
  if (!C || bytes.length < 32 || (bytes.length - 16) % 16 !== 0) return '';
  try {
    var iv = C.enc.Hex.parse(bytesToHex(bytes.subarray(0, 16)));
    var ciphertext = C.enc.Hex.parse(bytesToHex(bytes.subarray(16)));
    var key = C.enc.Hex.parse(keyHex);
    return C.AES.decrypt({ ciphertext: ciphertext }, key, {
      iv: iv, mode: C.mode.CBC, padding: C.pad.Pkcs7
    }).toString(C.enc.Utf8).replace(/`/g, '').trim();
  } catch (e) { return ''; }
}

/* Bounded proof of work for player data and Anubis; never runs unbounded.
 * Anubis cuenta BITS iniciales a cero (difficulty 4 = 4 bits = primer nibble
 * hexadecimal 0), no dígitos hexadecimales. Con un nibble se exigía 4 veces
 * más trabajo y el reto se agotaba antes de resolverlo, de modo que ninguna
 * fuente de FlixLatam/CinePlus podía devolver enlaces. */
function powSatisfied(hash, bits) {
  var fullBytes = Math.floor(bits / 8);
  var restBits = bits % 8;
  for (var i = 0; i < fullBytes; i++) {
    if (parseInt(hash.substr(i * 2, 2), 16) !== 0) return false;
  }
  if (!restBits) return true;
  var nibble = parseInt(hash.charAt(fullBytes * 2), 16);
  return (nibble >> (4 - restBits)) === 0;
}

/* Embed69 valida su propio PoW contando CERO HEXADECIMALES al principio
 * (`hash.startsWith("0".repeat(difficulty))` en la referencia de FlixLatam),
 * no bits. Con el criterio de Anubis el nonce devuelto no lo acepta el sitio y
 * el dataLink nunca se descifraba: por eso FlixLatam devolvía cero enlaces. */
function solvePlayerPowHex(challenge, digits) {
  var length = parseInt(digits, 10);
  if (!challenge || String(challenge).length > 512 || !isFinite(length) || length < 0 || length > 6) return null;
  var prefix = '';
  for (var d = 0; d < length; d++) prefix += '0';
  var budget = typeof HOSTED_MAX_POW_MS === 'number' ? Math.max(250, Math.min(HOSTED_MAX_POW_MS, 6000)) : 6000;
  var started = Date.now();
  for (var n = 0; n < 20000000; n++) {
    if (n % 256 === 0 && Date.now() - started > budget) break;
    var hash = sha256Hex(challenge + n);
    if (hash.slice(0, length) === prefix) return { nonce: n, hash: hash, elapsed: Math.max(1, Date.now() - started) };
  }
  return null;
}

function solvePlayerPow(challenge, difficulty) {
  var bits = parseInt(difficulty, 10);
  if (!challenge || String(challenge).length > 512 || !isFinite(bits) || bits < 0 || bits > 24) return null;
  var budget = typeof HOSTED_MAX_POW_MS === 'number' ? Math.max(250, Math.min(HOSTED_MAX_POW_MS, 6000)) : 6000;
  var started = Date.now();
  for (var n = 0; n < 2000000; n++) {
    if (n % 256 === 0 && Date.now() - started > budget) break;
    var hash = sha256Hex(challenge + n);
    if (powSatisfied(hash, bits)) return { nonce: n, hash: hash, elapsed: Math.max(1, Date.now() - started) };
  }
  return null;
}

function embed69Links(html, base) {
  var text = String(html || '');
  var data = /\bdataLink\s*=\s*(\[[\s\S]*?\])\s*;/i.exec(text);
  if (!data) return [];
  var groups;
  try { groups = JSON.parse(data[1]); } catch (e) { return []; }
  if (!Array.isArray(groups)) return [];
  function variable(name) {
    var pattern = new RegExp('\\b' + name + '\\s*=\\s*["\\\']([^"\\\']+)["\\\']', 'i');
    var m = pattern.exec(text);
    return m ? m[1] : '';
  }
  var challenge = variable('LINK_CHALLENGE');
  var salt = variable('LINK_SALT');
  var key = challenge && salt ? sha256Hex(challenge + salt) : '';
  if (!key) {
    var powChallenge = variable('POW_CHALLENGE');
    var powSalt = variable('POW_SALT');
    var diff = /\bPOW_DIFFICULTY\s*=\s*(\d+)/i.exec(text);
    if (powChallenge && powSalt && diff) {
      var solved = solvePlayerPowHex(powChallenge, diff[1]);
      if (solved) key = sha256Hex(powChallenge + solved.nonce + powSalt);
    }
  }
  var links = [];
  for (var i = 0; i < groups.length && i < 20; i++) {
    var group = groups[i] || {};
    var servers = Array.isArray(group.sortedEmbeds) ? group.sortedEmbeds : [];
    for (var j = 0; j < servers.length && j < 20; j++) {
      var server = servers[j] || {};
      if (/download/i.test(server.servername || '')) continue;
      var raw = String(server.link || '');
      var decoded = raw;
      if (!/^https?:\/\//i.test(decoded)) {
        var parts = raw.split('.');
        if (parts.length === 3) {
          try { decoded = JSON.parse(decodeBase64Text(parts[1])).link || ''; } catch (e) { decoded = ''; }
        } else if (key) decoded = aesPlayerLink(raw, key);
        else decoded = decodeBase64Text(raw);
      }
      var url = publicHttpUrl(decoded, base);
      if (url) links.push({ url: url, name: server.servername || '', language: languageLabel(group.video_language || '') });
    }
  }
  return uniqueBy(links, function (item) { return item.url; });
}

function pageRequest(url, referer) {
  // `pageOnly: 'record'` conserva estado y cabeceras de un 403/503 sin cuerpo
  // para poder explicar el bloqueo (WAF) en vez de devolver una lista vacía.
  return request(url, {
    timeout: 6500, retries: 0, redirect: 'manual', pageOnly: 'record',
    headers: referer ? { Referer: referer } : {}
  });
}

/* Anubis puede agravar el reto (más bits) cuando la IP del servidor es
 * sospechosa. Se resuelven varios retos seguidos, con un máximo, y se
 * reutiliza la cookie de la sesión. */
function passAnubis(html, url, referer, round) {
  var m = /<script\b[^>]*\bid=["']anubis_challenge["'][^>]*>([\s\S]*?)<\/script>/i.exec(html || '');
  if (!m) return Promise.resolve(null);
  if ((round || 0) >= 3) return Promise.resolve(null);
  var data;
  try { data = JSON.parse(m[1]); } catch (e) { return Promise.resolve(null); }
  var challenge = data && data.challenge;
  if (!challenge || !challenge.id || !challenge.randomData) return Promise.resolve(null);
  var difficulty = challenge.difficulty != null ? challenge.difficulty : data.rules && data.rules.difficulty;
  var solved = solvePlayerPow(challenge.randomData, difficulty);
  if (!solved) { log('Anubis: desafío fuera del presupuesto'); return Promise.resolve(null); }
  var parsed = new URL(url);
  var redirect = parsed.pathname + parsed.search;
  var pass = parsed.origin + '/.within.website/x/cmd/anubis/api/pass-challenge' +
    '?id=' + encodeURIComponent(challenge.id) + '&response=' + solved.hash + '&nonce=' + solved.nonce +
    '&redir=' + encodeURIComponent(redirect) + '&elapsedTime=' + solved.elapsed;
  return pageRequest(pass, referer).then(function (result) {
    if (result.status < 200 || result.status >= 400) return null;
    return pageRequest(url, referer).then(function (next) {
      if (next && next.text && /anubis_challenge/i.test(next.text)) return passAnubis(next.text, url, referer, (round || 0) + 1);
      return next;
    });
  });
}

/* Vidara devuelve su HLS en una API JSON, no en el HTML del iframe. Solo
 * estos hosts y las rutas públicas /e/ y /v/ están reconocidos. El transporte
 * alojado limita el POST al endpoint y al cuerpo esperados. */
function vidaraOrigin(value) {
  try {
    var url = publicHttpUrl(value);
    if (!url) return null;
    var parsed = new URL(url);
    if (parsed.protocol !== 'https:' || (parsed.port && parsed.port !== '443') ||
        ['vidara.to', 'vidara.so', 'vidvara.fit'].indexOf(parsed.hostname.toLowerCase()) === -1 ||
        parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch (e) { return null; }
}

function vidaraPlayer(url) {
  try {
    var parsed = new URL(url);
    var origin = vidaraOrigin(parsed.origin + '/');
    var match = /^\/(?:e|v)\/([a-z0-9]{1,64})\/?$/i.exec(parsed.pathname);
    return origin && match ? { origin: origin, filecode: match[1] } : null;
  } catch (e) { return null; }
}

function vidaraSubtitles(data, origin) {
  var tracks = data && Array.isArray(data.subtitles) ? data.subtitles : [];
  var result = [];
  for (var i = 0; i < tracks.length && i < 20; i++) {
    var track = tracks[i] || {};
    if (typeof track.file_path !== 'string' || track.file_path.length > 8192) continue;
    var url = publicHttpUrl(track.file_path, origin + '/');
    if (!url || isPlayerAdvertisement(url) || !/\.(?:vtt|srt|ass|ssa)$/i.test(new URL(url).pathname)) continue;
    var label = stripTags(String(track.language || '')).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 80);
    var lower = label.toLowerCase();
    var lang = /^(?:es|es[-_][a-z]+|spa)$/.test(lower) || /espa[nñ]ol|castellano|spanish|latino/.test(lower) ? 'spa'
      : /^(?:en|en[-_][a-z]+|eng)$/.test(lower) || /english|ingl[eé]s/.test(lower) ? 'eng'
        : /^(?:ja|jpn)$/.test(lower) || /japanese|japon[eé]s/.test(lower) ? 'jpn'
          : /^(?:pt|pt[-_][a-z]+|por)$/.test(lower) || /portugu[eé]s|portuguese/.test(lower) ? 'por'
            : (/^[a-z]{2,3}$/.test(lower) ? lower : 'und');
    result.push({ id: 'vidara-' + sha256Hex(url + '\n' + lang).slice(0, 16), url: url, lang: lang, label: label || lang });
  }
  return uniqueBy(result, function (track) { return track.url + '\n' + track.lang; });
}

/** Input [{url, referer, name, language}], output [{url, headers, name, language}]. */
function resolveDirectPlayers(seeds, options) {
  var opts = options || {};
  var queue = (seeds || []).map(function (s) {
    return { url: s.url, referer: s.referer || '', name: s.name || '', language: s.language || '', depth: 0 };
  });
  var seen = {};
  var found = [];
  var blocks = [];
  var observer = typeof blockedObserver === 'function' ? blockedObserver() : null;
  var visited = 0;
  var maxPages = Math.max(1, Math.min(16, opts.maxPages || 10));
  var maxDepth = Math.max(0, Math.min(5, opts.maxDepth == null ? 3 : opts.maxDepth));
  var concurrency = Math.max(1, Math.min(6, Math.floor(Number(opts.concurrency) || 2)));
  var deadline = Date.now() + 45000;

  function addMedia(url, ref, item, subtitles) {
    var media = directMediaUrl(url);
    if (!media || isPlayerAdvertisement(media)) return;
    var result = { url: media, name: item.name, language: item.language,
      headers: { Referer: ref || item.referer, 'User-Agent': UA, Origin: playerOrigin(ref || item.referer) } };
    if (subtitles && subtitles.length) result.subtitles = subtitles;
    found.push(result);
    if (typeof opts.onMedia === 'function') {
      try { opts.onMedia(result); } catch (e) { /* un observador no interrumpe la extracción */ }
    }
  }

  function requestVidara(origin, api, url, item) {
    return postJson(origin + '/api/stream', { filecode: api.filecode, device: 'web' }, {
      origin: origin, referer: url, timeout: 6500, retries: 0, redirect: 'manual'
    }).then(function (response) {
      var data = null;
      if (response && response.ok) {
        try { data = JSON.parse(response.text); } catch (e) { /* API caída o HTML */ }
      }
      var media = data && typeof data.streaming_url === 'string' ? directMediaUrl(data.streaming_url) : null;
      if (!media || isPlayerAdvertisement(media)) return false;
      // El reproductor de Vidara pide Referer de su propia raíz para HLS.
      addMedia(media, origin + '/', item, vidaraSubtitles(data, origin));
      return true;
    });
  }

  function playerPage(item, url) {
    var api = vidaraPlayer(url);
    if (!api) return pageRequest(url, item.referer);
    return requestVidara(api.origin, api, url, item).then(function (success) {
      if (success) return null;
      // En algunas versiones la página revela otro origen de la API. Solo se
      // admite un espejo de la misma lista fija; nunca un destino arbitrario.
      return pageRequest(url, item.referer).then(function (response) {
        if (!response || !response.ok || !response.text) return response;
        var match = /\bMIRROR_ORIGIN\s*=\s*["']([^"']+)["']/i.exec(response.text);
        var mirror = match && vidaraOrigin(match[1]);
        if (!mirror || mirror === api.origin) return response;
        return requestVidara(mirror, api, url, item).then(function (mirrored) {
          return mirrored ? null : response;
        });
      });
    });
  }

  function visit(item) {
    var url = publicHttpUrl(item.url, item.referer);
    if (!url || isPlayerAdvertisement(url) || seen[url] || item.depth > maxDepth) return Promise.resolve();
    seen[url] = true;
    if (directMediaUrl(url)) { addMedia(url, item.referer, item); return Promise.resolve(); }
    if (visited >= maxPages || Date.now() >= deadline) return Promise.resolve();
    visited++;
    return playerPage(item, url).then(function (response) {
      if (!response) return null;
      if (response.status >= 300 && response.status < 400) {
        var location = response.headers && response.headers.get ? response.headers.get('location') : '';
        var target = publicHttpUrl(location, url);
        if (target) queue.push({ url: target, referer: url, name: item.name, language: item.language, depth: item.depth + 1 });
        return null;
      }
      if (/anubis_challenge/i.test(response.text)) return passAnubis(response.text, url, item.referer);
      if (!response.ok) {
        // Se deja constancia del bloqueo para que /diag y los registros digan
        // qué host rechaza la IP del servidor, en vez de un vacío silencioso.
        if (response.blocked) {
          if (blocks.length < 6) blocks.push({ url: url, status: response.status });
          if (observer) { try { observer({ url: url, status: response.status }); } catch (e) { /* observador */ } }
        }
        return null;
      }
      if (response.isMedia) { addMedia(response.url, item.referer, item); return null; }
      return response;
    }).then(function (response) {
      if (!response || !response.ok || !response.text) return;
      var actualUrl = publicHttpUrl(response.url, url) || url;
      var media = findDirectMedia(response.text, actualUrl);
      for (var i = 0; i < media.length; i++) addMedia(media[i], actualUrl, item);
      if (item.depth >= maxDepth) return;
      var links = pagePlayerLinks(response.text, actualUrl).concat(embed69Links(response.text, actualUrl));
      for (var j = 0; j < links.length; j++) {
        queue.push({ url: links[j].url, referer: actualUrl, name: links[j].name || item.name,
          language: links[j].language || item.language, depth: item.depth + 1 });
      }
    }).catch(function () { /* un host caído no cancela los demás */ });
  }
  function nextBatch() {
    if (!queue.length || Date.now() >= deadline || found.length >= 20) {
      var result = uniqueBy(found, function (item) { return item.url; });
      // Los bloqueos del WAF se adjuntan al resultado para poder explicarlos.
      try {
        result.blocked = blocks;
        Object.defineProperty(result, 'blocked', { enumerable: false });
      } catch (e) { /* arreglos congelados */ }
      return Promise.resolve(result);
    }
    var batch = queue.splice(0, concurrency);
    return Promise.all(batch.map(visit)).then(nextBatch);
  }
  return nextBatch();
}


/* frameXTV / VidSync: /api/core/streams?type=<tv|movie>&id=<tmdb>[&season=&episode=]
 *
 * Es el mismo motor que publica framextv.cc y el servidor "frameXTV" que
 * ofrece k-drama.in. Lo reconocido con tools/probe-sites.js (2026-11):
 *  - El sitio es una SPA: /api y /embed devuelven el HTML del shell, sin datos.
 *  - La API real vive en "shards" fijos: vidsync-shard.vs-deals<N>.workers.dev.
 *    El bundle los elige con un hash del id (FNV-1a) o desde localStorage; no
 *    hay endpoint público que los liste, así que se prueban en orden hasta que
 *    uno responda con `sources`.
 *  - La respuesta trae `sources[]` con `url` (m3u8/mp4), `quality` o
 *    `availableQualities`, `streamHeaders`, `audioLanguage`/`audioLabel` y
 *    `subtitles[]` con `url` (VTT). Solo se entregan URLs http(s) de esos
 *    campos: nunca se construye un enlace.
 *
 * Los ids son de TMDB, que es exactamente lo que ya resuelve el addon. */

var VID_BASE = 'https://vidsync.pro';
var VID_SHARDS = [
  'https://vidsync-shard.vs-deals79.workers.dev',
  'https://vidsync-shard.vs-deals41.workers.dev',
  'https://vidsync-shard.vs-deals38.workers.dev',
  'https://vidsync-shard.vs-deals54.workers.dev',
  'https://vidsync-shard.vs-deals13.workers.dev',
  'https://vidsync-shard.vs-deals7.workers.dev'
];

/** Consulta la API en un shard y devuelve la lista de fuentes o null. */
function vidShardStreams(base, params, attempt) {
  var query = 'type=' + encodeURIComponent(params.type) +
    '&id=' + encodeURIComponent(params.id) +
    '&season=' + encodeURIComponent(params.season || 1) +
    '&episode=' + encodeURIComponent(params.episode || 1);
  return getJson(base + '/api/core/streams?' + query, {
    timeout: 12000, retries: 0, headers: { Accept: 'application/json' }
  }).then(function (data) {
    if (!data || !Array.isArray(data.sources) || !data.sources.length) return null;
    return data;
  }, function () { return null; });
}

/** Prueba los shards en orden hasta obtener fuentes. */
function vidFindStreams(params) {
  var index = 0;
  function next() {
    if (index >= VID_SHARDS.length) return Promise.resolve(null);
    var base = VID_SHARDS[index++];
    return vidShardStreams(base, params).then(function (data) {
      return data || next();
    });
  }
  return next();
}

/** Cabeceras de la fuente: `streamHeaders` o `headers` del propio objeto. */
function vidHeaders(source, base) {
  var raw = source.streamHeaders || source.headers || null;
  var out = {};
  if (raw && typeof raw === 'object') {
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      if (/^(?:user-agent|referer|origin|cookie)$/i.test(keys[i]) && typeof raw[keys[i]] === 'string') {
        out[keys[i]] = raw[keys[i]];
      }
    }
  }
  if (!out.Referer && !out.referer) out.Referer = base ? base + '/' : VID_BASE + '/';
  return out;
}

/** Un VTT de subtítulos solo si es http(s) público; nunca se descarga. */
function vidSubtitles(data) {
  var out = [];
  var list = (data && data.subtitles) || [];
  for (var i = 0; i < list.length && out.length < 6; i++) {
    var url = publicHttpUrl(list[i] && list[i].url);
    if (!url) continue;
    out.push({ url: url, lang: list[i].language || list[i].label || 'und' });
  }
  return out;
}

function vidQuality(source) {
  var quality = String(source.quality || '');
  if (quality && !/^auto$/i.test(quality)) return parseQuality(quality);
  var list = Array.isArray(source.availableQualities) ? source.availableQualities : [];
  var best = 0;
  for (var i = 0; i < list.length; i++) best = Math.max(best, qualityRank(parseQuality(list[i])));
  return best > 0 ? parseQuality(list.join(' ')) : 'SD';
}

function vidLanguage(source) {
  var label = source.audioLabel || source.audioLanguage || source.audio || '';
  return languageLabel(String(label)) || languageLabel(String(source.server || '')) || '';
}

function vidGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '10' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info || !info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];
    if (!info.tmdbId) return [];
    var params = { type: info.isTv ? 'tv' : 'movie', id: info.tmdbId,
      season: info.season, episode: info.episode };
    return vidFindStreams(params).then(function (data) {
      if (!data) return [];
      var subtitles = vidSubtitles(data);
      var streams = [];
      for (var i = 0; i < data.sources.length && streams.length < 24; i++) {
        var source = data.sources[i] || {};
        var url = directMediaUrl(source.url);
        if (!url) continue;
        var server = (source.provider && source.provider.name) || source.server || 'VidSync';
        var title = info.title + (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
          ' · ' + server;
        streams.push(makeStream({ name: 'frameXTV', title: title, provider: 'framextv', url: url,
          quality: vidQuality(source), language: vidLanguage(source),
          headers: vidHeaders(source), subtitles: subtitles }));
      }
      return finalizeStreams('frameXTV', streams, { max: conf.maxResults });
    });
  }).catch(function (error) { log('framextv', error && error.message || error); return []; });
}

/* Mismo contrato que el resto de providers del addon. */
function requestMedia(rawId, mediaType, season, episode) {
  var parsed = normalizeContentId(mediaType, rawId);
  if (!parsed) return Promise.resolve(null);
  var effective = parsed;
  if (season != null || episode != null) {
    effective = {};
    for (var key in parsed) effective[key] = parsed[key];
    effective.season = season == null ? parsed.season : parseInt(season, 10);
    effective.episode = episode == null ? parsed.episode : parseInt(episode, 10);
    if (effective.type !== 'movie' && (!Number.isInteger(effective.season) || !Number.isInteger(effective.episode))) {
      return Promise.resolve(null);
    }
  }
  return resolveRequestMedia(effective).catch(function () { return null; });
}

function vidResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function vidSettingsPanel() {
  return Promise.resolve([
    { type: 'header', label: 'frameXTV (VidSync)' },
    { type: 'info', label: 'Necesita el id de TMDB del título (el addon lo resuelve). Devuelve los HLS/MP4 y los subtítulos VTT que publique su API.' }
  ]);
}

module.exports = {
  getStreams: vidGetStreams,
  resolveMeta: vidResolveMeta,
  onSettings: vidSettingsPanel
};

})();
