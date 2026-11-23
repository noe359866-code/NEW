/*__CORE__*/

/* DoramasLatinox (doramaslatinox.com): WordPress con el tema DooPlay.
 *
 * Lo reconocido con tools/probe-sites.js (2026-11):
 *  - Buscador estándar de WordPress: /?s=<texto>, con tarjetas .result-item.
 *  - Fichas: /series/<slug>/ y /peliculas/<slug>/. La ficha declara el audio
 *    («Audio: Latino») y la calidad en el bloque de detalles.
 *  - Los episodios viven en /episodio/<slug>-<t>-<e>-episodio-<e>/ y se listan
 *    en la ficha dentro de `#seasons .se-a ul.episodios`.
 *  - Los reproductores son botones DooPlay:
 *      <li class='dooplay_player_option' data-type='tv' data-post='43619' data-nume='1'>
 *    con el nombre del servidor en `span.title` (DOO, FAST…) y la bandera de
 *    idioma en `span.flag`.
 *  - El sitio resuelve el enlace con su API v2
 *      /wp-json/dooplayer/v2/<post>/<type>/<nume>
 *    (el `player_api` que anuncia su propio `dtAjax`), no con el
 *    `admin-ajax.php?action=doo_player_ajax` clásico, que responde vacío.
 *  - Reproductores que usa: playmogo.com (cerrado tras Cloudflare) y
 *    player.abyssplayer.com (Abyss), que sí se puede resolver.
 *  - Todo el catálogo está en español latino; la calidad viene de la ficha.
 *
 * Abyss (player.abyssplayer.com/<slug>):
 *  - La página trae `const datas = "<base64>"`; al decodificarlo es un JSON
 *    con slug, md5_id, user_id y `media` (texto cifrado con AES-CTR).
 *  - La clave es el MD5 en hexadecimal de "<user_id>:<slug>:<md5_id>"; el
 *    contador es la primera mitad de esa misma clave y el bloque es de 128
 *    bits. Importante: los bytes del campo `media` llegan escapados como
 *    \uXXXX dentro del JSON, hay que desescaparlos antes de descifrar.
 *  - El JSON descifrado trae `sources` con label, size, res_id, sub y url.
 *  - La URL final es <url>/sora/<size>/<token>, donde el token es otro
 *    AES-CTR (misma clave y contador) de
 *    "/<tipo>/<md5_id>/<res_id>/<size>?v=<slug>" codificado dos veces en
 *    Base64 sin relleno. Se comprobó descifrando la carga real del sitio. */

var DLX_BASE = 'https://doramaslatinox.com';

function dlxSiteUrl(value, base) {
  var url = publicHttpUrl(value, base || DLX_BASE + '/');
  if (!url) return null;
  try {
    var parsed = new URL(url);
    var host = String(parsed.hostname || '').toLowerCase();
    if (parsed.protocol !== 'https:' || (host !== 'doramaslatinox.com' && host !== 'www.doramaslatinox.com')) return null;
    if (!/^\/(?:series|peliculas|episodio)\/[a-z0-9-]{2,200}\/?$/i.test(parsed.pathname)) return null;
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch (e) { return null; }
}

/** Tarjetas de /?s=: enlace de ficha + título visible. */
function dlxCards(html) {
  var out = [];
  var text = String(html || '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ');
  var re = /<div\b[^>]*class=["'][^"']*result-item[^"']*["'][^>]*>([\s\S]{0,2500}?)<\/article>/gi;
  var match;
  while ((match = re.exec(text)) && out.length < 60) {
    var block = match[1];
    var link = /<a\b[^>]*href=["']([^"']+)["']/i.exec(block);
    var url = link ? dlxSiteUrl(link[1], DLX_BASE + '/') : null;
    if (!url) continue;
    var heading = /<(?:h[1-4]|div)\b[^>]*class=["'][^"']*(?:title|data)[^"']*["'][^>]*>([\s\S]{0,200}?)<\/(?:h[1-4]|div)>/i.exec(block);
    var title = stripTags((heading && heading[1]) || '').replace(/\s+/g, ' ').trim();
    if (!title) {
      var anchor = /<a\b[^>]*href=["'][^"']+["'][^>]*>([^<]{2,200})<\/a>/i.exec(block);
      title = anchor ? stripTags(anchor[1]).trim() : '';
    }
    if (!title) {
      var alt = /<img\b[^>]*alt=["']([^"']{2,200})["']/i.exec(block);
      title = alt ? alt[1].trim() : '';
    }
    if (!title || title.length > 200) continue;
    var slug = /\/(?:series|peliculas)\/([a-z0-9-]{2,200})$/i.exec(url);
    out.push({ url: url, title: title, isMovie: /\/peliculas\//i.test(url), year: parseYear(block),
      slug: slug ? slug[1] : '' });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

function dlxScore(candidate, info) {
  var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
  var score = 0;
  for (var i = 0; i < titles.length; i++) {
    if (!titles[i]) continue;
    score = Math.max(score, titleScore(candidate.title, titles[i]));
  }
  return score;
}

function dlxSearch(info) {
  var queries = searchQueries(info).slice(0, 3);
  var index = 0;
  var found = [];
  function next() {
    if (index >= queries.length ||
        found.some(function (item) { return item.score >= 0.95; })) return Promise.resolve(found);
    var url = DLX_BASE + '/?s=' + encodeURIComponent(queries[index++]);
    return getText(url, { timeout: 12000, retries: 0 }).then(function (html) {
      var cards = dlxCards(html);
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (info.isTv && card.isMovie) continue;
        if (!info.isTv && !card.isMovie) continue;
        var score = dlxScore(card, info);
        if (score < 0.72) continue;
        card.score = score;
        found.push(card);
      }
      return next();
    }, function () { return next(); });
  }
  return next().then(function () {
    return uniqueBy(found, function (item) { return item.url; })
      .sort(function (a, b) { return b.score - a.score; });
  });
}

/** URL del episodio deducida del slug: /episodio/<slug>-<t>x<e>-episodio-<e>/
 * Así no hace falta abrir la ficha (que en este sitio es muy lenta). */
function dlxEpisodeGuess(candidate, info) {
  if (!candidate || !candidate.slug || !info.isTv) return null;
  var slug = candidate.slug;
  return dlxSiteUrl(DLX_BASE + '/episodio/' + slug + '-' + info.season + 'x' + info.episode +
    '-episodio-' + info.episode + '/', DLX_BASE + '/');
}

/** Enlace del episodio pedido dentro de la ficha de la serie. */
function dlxEpisodeUrl(html, info) {
  var text = String(html || '');
  var re = /href=["']([^"']*\/episodio\/[^"']+)["']/gi;
  var match;
  while ((match = re.exec(text))) {
    var url = dlxSiteUrl(match[1], DLX_BASE + '/');
    if (!url) continue;
    // El slug numera como 1x2; también se acepta temporada y episodio sueltos.
    var pair = /(\d{1,2})x(\d{1,4})(?:-|$)/i.exec(url);
    if (pair) {
      if (parseInt(pair[1], 10) === info.season && parseInt(pair[2], 10) === info.episode) return url;
      continue;
    }
    var season = new RegExp('temporada-' + info.season + '-', 'i').test(url);
    var episode = new RegExp('(?:capitulo|episodio)-' + info.episode + '(?:-|$)', 'i').test(url);
    if (season && episode) return url;
  }
  return null;
}

/** Botones DooPlay: servidor, idioma y el id con el que se pide el enlace. */
function dlxOptions(html) {
  var out = [];
  var text = String(html || '');
  var re = /<li\b[^>]*class=["'][^"']*dooplay_player_option[^"']*["'][^>]*>([\s\S]{0,600}?)<\/li>/gi;
  var match;
  while ((match = re.exec(text)) && out.length < 20) {
    var tag = /<li\b[^>]*>/i.exec(match[0]);
    var open = tag ? tag[0] : match[0];
    var post = attrOf(open, 'data-post');
    var nume = attrOf(open, 'data-nume');
    var type = attrOf(open, 'data-type');
    if (!post || !nume) continue;
    var body = match[1];
    var server = stripTags(/<span\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]{0,80}?)<\/span>/i
      .exec(body) ? /<span\b[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]{0,80}?)<\/span>/i.exec(body)[1] : '');
    server = String(server || '').replace(/\s+/g, ' ').trim();
    // La bandera (mx.png) confirma el audio latino; el nombre del servidor no lo dice.
    var flag = /<img\b[^>]*src=["'][^"']*flags\/([a-z]{2})\.png/i.exec(body) ||
      /<img\b[^>]*src=["'][^"']*\/([a-z]{2})\.png/i.exec(body);
    var country = flag ? flag[1].toLowerCase() : '';
    var language = country === 'mx' || country === 'ar' || country === 'es' ? 'Latino' : 'Latino';
    out.push({ post: String(post).slice(0, 20), nume: String(nume).slice(0, 6),
      type: String(type || '').slice(0, 10), server: server || 'DooPlay', language: language });
  }
  return uniqueBy(out, function (item) { return item.post + '/' + item.nume; });
}

/** Enlace del reproductor vía la API que anuncia el propio tema (dtAjax). */
function dlxPlayer(dlx, referer) {
  var kind = /movie/i.test(dlx.type) ? 'movie' : 'tv';
  var url = DLX_BASE + '/wp-json/dooplayer/v2/' + dlx.post + '/' + kind + '/' + dlx.nume;
  return getText(url, { timeout: 8000, retries: 0, headers: { Referer: referer || DLX_BASE + '/' } })
    .then(function (raw) {
      var data = null;
      try { data = JSON.parse(raw); } catch (e) { data = null; }
      if (!data) return null;
      var embed = publicHttpUrl(data.embed_url || data.url || data.link || '', DLX_BASE + '/');
      if (!embed || isPlayerAdvertisement(embed)) return null;
      return { url: embed, server: dlx.server, language: dlx.language };
    }, function () { return null; });
}

function dlxReadPage(url) {
  return request(url, { timeout: 12000, retries: 0, pageOnly: true,
    headers: { Referer: DLX_BASE + '/' } }).then(function (res) {
    if (!res.ok || !res.text) return null;
    return { url: res.url || url, html: res.text };
  }, function () { return null; });
}

function dlxStream(info, item) {
  var title = (info.title || ('TMDB ' + (info.tmdbId || ''))) +
    (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
    (item.name ? ' · ' + item.name : '');
  return makeStream({ name: 'DoramasLatinox', title: title, provider: 'doramaslatinox',
    url: item.url, quality: parseQuality(title + ' ' + item.url), language: 'Latino',
    headers: item.headers, subtitles: item.subtitles });
}

function doramaslatinoxGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8', quality: '' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info || !info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];
    return dlxSearch(info).then(function (candidates) {
      return mapLimit(candidates.slice(0, 2), 2, function (candidate) {
        // Serie: la URL del episodio se deduce del slug y se pide directamente.
        // La ficha solo se abre si esa URL no existe.
        var guess = dlxEpisodeGuess(candidate, info);
        if (guess) {
          return dlxReadPage(guess).then(function (directPage) {
            if (directPage && /dooplay_player_option/i.test(directPage.html)) {
              return dlxResolve(directPage, info);
            }
            return dlxReadPage(candidate.url).then(function (page) {
              if (!page) return [];
              var fromList = dlxEpisodeUrl(page.html, info);
              if (!fromList) return [];
              return dlxReadPage(fromList).then(function (episodePage) {
                return episodePage ? dlxResolve(episodePage, info) : [];
              });
            });
          });
        }
        return dlxReadPage(candidate.url).then(function (page) {
          if (!page) return [];
          if (!info.isTv) return dlxResolve(page, info);
          var episodeUrl = dlxEpisodeUrl(page.html, info);
          if (!episodeUrl) return [];
          return dlxReadPage(episodeUrl).then(function (episodePage) {
            return episodePage ? dlxResolve(episodePage, info) : [];
          });
        });
      }).then(function (groups) {
        var streams = [];
        for (var i = 0; i < groups.length; i++) {
          var results = groups[i] || [];
          for (var j = 0; j < results.length; j++) streams.push(dlxStream(info, results[j]));
        }
        return finalizeStreams('DoramasLatinox', streams, { max: conf.maxResults });
      });
    });
  }).catch(function (error) { log('doramaslatinox', error && error.message || error); return []; });
}

/** Cada botón DooPlay → API del tema → reproductor → HLS/MP4. */
/* ------------------------- Abyss (AES-CTR) ------------------------- */

/** Bytes de un literal JSON, deshaciendo los escapes \uXXXX / \xNN. */
function dlxUnescapeBytes(text) {
  var s = String(text || '');
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch !== '\\') { out.push(s.charCodeAt(i) & 0xff); continue; }
    var next = s.charAt(++i);
    if (next === 'u') { out.push(parseInt(s.substr(i + 1, 4), 16) & 0xff); i += 4; }
    else if (next === 'x') { out.push(parseInt(s.substr(i + 1, 2), 16) & 0xff); i += 2; }
    else if (next === 'n') out.push(10);
    else if (next === 'r') out.push(13);
    else if (next === 't') out.push(9);
    else if (next === 'b') out.push(8);
    else if (next === 'f') out.push(12);
    else out.push(next.charCodeAt(0) & 0xff);
  }
  return out;
}

/** AES-256-CTR con la clave de Abyss. Devuelve bytes o null. */
function dlxAbyssCipher(bytes, keyHex) {
  var C = cryptoJsModule();
  if (!C || !keyHex) return null;
  try {
    // El reproductor codifica el MD5 hexadecimal como TEXTO (32 bytes → AES-256);
    // interpretarlo como Hex daría 16 bytes y descifraría basura.
    var key = C.enc.Latin1.parse(keyHex);
    var counter = C.enc.Latin1.parse(keyHex.slice(0, 16));
    var decrypted = C.AES.decrypt({ ciphertext: C.enc.Hex.parse(bytesToHex(bytes)) }, key, {
      iv: counter, mode: C.mode.CTR, padding: C.pad.NoPadding
    });
    return binaryToBytes(decrypted.toString(C.enc.Latin1));
  } catch (e) { return null; }
}

/** Token de /sora/: el mismo cifrado del camino, en Base64 doble sin relleno. */
function dlxAbyssToken(path, keyHex) {
  var C = cryptoJsModule();
  if (!C || !keyHex) return '';
  try {
    var key = C.enc.Latin1.parse(keyHex);
    var counter = C.enc.Latin1.parse(keyHex.slice(0, 16));
    var out = C.AES.encrypt(C.enc.Utf8.parse(path), key, {
      iv: counter, mode: C.mode.CTR, padding: C.pad.NoPadding
    }).ciphertext.toString(C.enc.Latin1);
    return bytesToB64(b64ToBytes(bytesToB64(binaryToBytes(out)))).replace(/=+$/, '');
  } catch (e) { return ''; }
}

/** Anfitriones del reproductor Abyss. */
function isAbyssHost(url) {
  try { return /(^|\.)abyssplayer\.com$/i.test(new URL(String(url)).hostname); }
  catch (e) { return false; }
}

/** Medios directos de un reproductor Abyss. */
function dlxAbyssStreams(url, referer, language) {
  return getText(url, { timeout: 12000, retries: 0,
    headers: { Referer: referer || DLX_BASE + '/', 'Accept-Language': 'es-ES,es;q=0.9' } })
    .then(function (html) {
      var match = /datas\s*=\s*["']([A-Za-z0-9+/=]{20,})["']/.exec(String(html || ''));
      if (!match) return [];
      // Se lee byte a byte: el campo `media` son datos binarios y una
      // decodificación UTF-8 los corrompería.
      var payload = bytesToBinary(b64ToBytes(match[1]));
      var slug = /"slug"\s*:\s*"([^"]{1,40})"/.exec(payload);
      var md5Id = /"md5_id"\s*:\s*"?([0-9]{1,20})"?/.exec(payload);
      var userId = /"user_id"\s*:\s*"?([0-9]{1,20})"?/.exec(payload);
      var mediaAt = payload.indexOf('"media":"');
      if (!slug || !md5Id || !userId || mediaAt < 0) return [];
      var mediaText = payload.slice(mediaAt + 9);
      var close = mediaText.lastIndexOf('"');
      if (close > 0) mediaText = mediaText.slice(0, close);
      var C = cryptoJsModule();
      if (!C) return [];
      var keyHex = C.MD5(userId[1] + ':' + slug[1] + ':' + md5Id[1]).toString(C.enc.Hex);
      var plain = dlxAbyssCipher(dlxUnescapeBytes(mediaText), keyHex);
      if (!plain) return [];
      // Detrás del JSON quedan restos del relleno del cifrado: se recorta al
      // último cierre equilibrado. Algunas cargas traen bytes de control
      // sueltos, así que si JSON.parse falla se leen las fuentes directamente.
      var json = bytesToUtf8(plain);
      var end = json.lastIndexOf('}');
      if (end > 0) json = json.slice(0, end + 1);
      var data = null;
      try { data = JSON.parse(json); } catch (e) { data = null; }
      var kind = '';
      var sources = [];
      if (data) {
        kind = data.mp4 ? 'mp4' : (data.hls || data.m3u8 ? 'hls' : '');
        sources = (data.mp4 && data.mp4.sources) || (data.hls && data.hls.sources) ||
          (data.m3u8 && data.m3u8.sources) || [];
      } else {
        kind = /\{["'\s]*mp4["'\s]*:/i.test(json) ? 'mp4' : 'hls';
        var raw = /\{[^{}]{0,400}?"res_id"\s*:\s*(\d{1,9})[^{}]{0,400}?\}/g;
        var item;
        while ((item = raw.exec(json)) && sources.length < 12) {
          var chunk = item[0];
          var pick = function (name) {
            var found = new RegExp('"' + name + '"\\s*:\\s*"?([^",}]{1,120})"?').exec(chunk);
            return found ? found[1] : '';
          };
          sources.push({ res_id: item[1], size: pick('size'), url: pick('url'),
            label: pick('label'), status: true });
        }
      }
      if (!sources.length) return [];
      var out = [];
      for (var i = 0; i < sources.length && out.length < 12; i++) {
        var source = sources[i] || {};
        if (!source.size || !source.res_id || !source.url || source.status === false) continue;
        // Los hosts válidos son dominios ASCII limpios; un byte suelto del
        // cifrado deja el nombre inservible y se descarta esa calidad.
        if (!/^https:\/\/[a-z0-9][a-z0-9.-]{3,80}\.[a-z]{2,12}\/?$/i.test(String(source.url))) continue;
        var host = publicHttpUrl(source.url, url);
        if (!host) continue;
        var token = dlxAbyssToken('/' + kind + '/' + md5Id[1] + '/' + source.res_id + '/' + source.size +
          '?v=' + slug[1], keyHex);
        if (!token) continue;
        out.push({ url: host.replace(/\/$/, '') + '/sora/' + source.size + '/' + token,
          name: source.label || '', language: language || 'Latino', quality: source.label || '',
          referer: 'https://player.abyssplayer.com/' });
      }
      return out;
    }, function () { return []; });
}

function dlxResolve(page, info) {
  var options = dlxOptions(page.html);
  if (!options.length) return [];
  return mapLimit(options, 4, function (option) {
    return dlxPlayer(option, page.url).then(function (entry) {
      if (!entry) return [];
      if (isAbyssHost(entry.url)) return dlxAbyssStreams(entry.url, page.url, entry.language);
      return resolveDirectPlayers([{ url: entry.url, name: entry.server, language: entry.language,
        referer: page.url }], { maxDepth: 4, maxPages: 4 });
    });
  }).then(function (groups) {
    var results = [];
    for (var i = 0; i < groups.length; i++) results = results.concat(groups[i] || []);
    return results;
  });
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

function doramaslatinoxResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function doramaslatinoxSettingsPanel() {
  return Promise.resolve([
    { type: 'header', label: 'DoramasLatinox (doramaslatinox.com)' },
    { type: 'info', label: 'Doramas, series y películas asiáticas en audio español latino y subtituladas. Usa la API de reproductores de su propio tema DooPlay; se entregan los HLS/MP4 que se puedan resolver.' }
  ]);
}

module.exports = {
  getStreams: doramaslatinoxGetStreams,
  resolveMeta: doramaslatinoxResolveMeta,
  onSettings: doramaslatinoxSettingsPanel
};
