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
