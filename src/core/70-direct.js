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
      var solved = solvePlayerPow(powChallenge, diff[1]);
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
