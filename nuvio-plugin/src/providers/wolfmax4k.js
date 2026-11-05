/*__CORE__*/

/* ------------------------------------------------------------------
 * WolfMax4K → WolfTorrent · wolfmax4k.com redirige a wolftorrent.com
 *   búsqueda  GET /buscar/<término>
 *   ficha     /pelicula/<code>  ·  /serie/<code>  ·  /serie/episodio/<code>
 *   descarga  /api/descargas?tabla=peliculas|series&code=<code>
 *             → enlace "Enlacito" → form linkser → var link_out (base64)
 *             → AES-256-CBC (OpenSSL, clave pública del sitio) → .torrent
 *
 * Aviso: desde octubre de 2026 el sitio intercala Cloudflare Turnstile
 * antes de Enlacito. Si aparece el captcha, el provider devuelve [].
 * ------------------------------------------------------------------ */

var WOLF_HOSTS = [
  'https://wolftorrent.com',
  'https://www.wolftorrent.com',
  'https://wolfmax4k.com'
];

var WOLF_AES_KEY = 'fee631d2cffda38a78b96ee6d2dfb43a';

function wolfParseListing(html, host) {
  var items = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/(?:pelicula|serie)\/[a-z0-9]+(?:\/episodio\/[a-z0-9]+)?)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(match[1], host);
    if (!url || seen[url]) continue;
    var windowHtml = html.slice(match.index, match.index + 700);
    var title = stripTags(match[2]).trim();
    if (!title || title.length < 2) {
      title = attrOf(match[0], 'title');
    }
    title = title ? stripTags(title).replace(/^[“"'«]|[”"'»]$/g, '').trim() : null;
    if (!title) continue;
    if (/^(ver|descargar|inicio|estrenos|pel[ií]culas|series|documentales|animaciones|telenovelas|cuenta|ayuda|contacto)$/i.test(title)) continue;
    seen[url] = true;

    var qualityMatch = /(4K|2160p|1080p|720p|HDRip|BluRay[^<]{0,8}|MicroHD|BDremux[^<]{0,8}|HDTV[^<]{0,8}|DVDRip|WEB-?DL|WEBRip)/i.exec(windowHtml);
    var sizeMatch = /(\d+(?:[.,]\d+)?\s*(?:GB|MB))/i.exec(windowHtml);
    items.push({
      url: url,
      code: (/\/(?:pelicula|episodio)\/([a-z0-9]+)/i.exec(url) || /\/serie\/([a-z0-9]+)/i.exec(url) || [])[1] || null,
      title: title,
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : parseQuality(windowHtml),
      size: sizeMatch ? parseSize(sizeMatch[1]) : null,
      isSeries: /\/serie\//i.test(url)
    });
  }
  return items;
}

function wolfSearch(host, term) {
  var url = host + '/buscar/' + encodeURIComponent(String(term).replace(/\s+/g, ' '));
  return getText(url, { timeout: 15000 }).then(function (html) {
    return html ? wolfParseListing(html, host) : [];
  });
}

/** Nuvio expone crypto-js vía require(); en Node/tests puede venir como global. */
var WOLF_CRYPTO = (function () {
  try {
    if (typeof CryptoJS !== 'undefined' && CryptoJS && CryptoJS.AES) return CryptoJS;
  } catch (e) { /* sin global */ }
  try {
    if (typeof require === 'function') {
      var mod = require('crypto-js');
      if (mod && mod.AES) return mod;
    }
  } catch (e) { /* módulo no disponible */ }
  return null;
})();

/** CryptoJS: AES OpenSSL (salt + EVP_BytesToKey MD5). */
function wolfAesDecrypt(cipherBase64) {
  var CryptoJS = WOLF_CRYPTO;
  if (!CryptoJS || !CryptoJS.AES) return null;
  try {
    var decrypted = CryptoJS.AES.decrypt(String(cipherBase64), WOLF_AES_KEY);
    var text = decrypted.toString(CryptoJS.enc.Utf8);
    return /^https?:\/\//i.test(text) ? text : null;
  } catch (e) {
    return null;
  }
}

function wolfResolveDownload(host, tabla, code, referer) {
  var apiUrl = host + '/api/descargas?tabla=' + encodeURIComponent(tabla) + '&code=' + encodeURIComponent(code);
  return getText(apiUrl, {
    timeout: 15000,
    headers: { Referer: referer, 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html,*/*' }
  }).then(function (html) {
    if (!html) return null;
    if (/turnstile|hcaptcha|cf-challenge|g-recaptcha/i.test(html) && !/linkser/i.test(html)) {
      log('wolfmax4k', 'captcha en la descarga; se omite');
      return null;
    }
    var shortener = /href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    var candidate = null;
    var match;
    var known = /enlacito|enla\.|acortame|short-info|linkser|shorturl/i;
    while ((match = shortener.exec(html))) {
      if (known.test(match[1])) { candidate = decodeEntities(match[1]); break; }
    }
    if (!candidate) {
      // "app-message" apunta al enlace externo aunque el dominio cambie
      var appMessage = /class=["'][^"']*app-message[^"']*["'][\s\S]{0,400}?href=["']([^"']+)["']/i.exec(html);
      if (appMessage) candidate = absoluteUrl(decodeEntities(appMessage[1]), host);
    }
    if (!candidate) return null;
    return wolfFollowShortener(candidate, referer);
  });
}

function wolfFollowShortener(url, referer) {
  return getText(url, { timeout: 15000, headers: { Referer: referer } }).then(function (html) {
    if (!html) return null;

    // Atajo: algunos enlaces ya traen "var link_out" en la propia página.
    var inline = /var\s+link_out\s*=\s*["']([^"']+)["']/i.exec(html);
    if (inline) return wolfDecodeLinkOut(inline[1]);

    var formAction = /<form[^>]*action=["']([^"']+)["']/i.exec(html);
    var linkser = /name=["']linkser["'][^>]*value=["']([^"']*)["']/i.exec(html);
    if (!formAction || !linkser) return null;

    var action = absoluteUrl(decodeEntities(formAction[1]), url);
    return postForm(action, { linkser: decodeEntities(linkser[1]) }, { referer: url }).then(function (res) {
      if (!res.ok || !res.text) return null;
      var linkOut = /var\s+link_out\s*=\s*["']([^"']+)["']/i.exec(res.text);
      if (!linkOut) {
        if (/turnstile|hcaptcha|captcha/i.test(res.text)) log('wolfmax4k', 'captcha de Enlacito');
        return null;
      }
      return wolfDecodeLinkOut(linkOut[1]);
    });
  });
}

function wolfDecodeLinkOut(value) {
  var decoded = bytesToText(b64ToBytes(value));
  if (/^https?:\/\//i.test(decoded)) return decoded;
  return wolfAesDecrypt(value);
}

/** Episodios listados dentro de /serie/<code> */
function wolfEpisodeLinks(html, host, season, episode) {
  var links = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/serie\/episodio\/[a-z0-9]+)["'][^>]*>([\s\S]{0,180}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(match[1], host);
    if (!url || seen[url]) continue;
    var text = stripTags(match[2]);
    if (!matchesEpisode(text, season, episode)) continue;
    seen[url] = true;
    links.push({ url: url, label: text });
  }
  return links;
}

function wolfStreamFromPage(pageUrl, info, label) {
  var host = pageUrl.replace(/^(https?:\/\/[^/]+).*$/i, '$1');
  var codeMatch = /([a-z0-9]{4,})$/.exec(pageUrl.replace(/\/$/, ''));
  var code = codeMatch ? codeMatch[1] : null;
  if (!code) return Promise.resolve(null);
  var tabla = /\/serie/i.test(pageUrl) ? 'series' : 'peliculas';

  return getText(pageUrl, { timeout: 15000 }).then(function (html) {
    if (!html) return null;
    var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = h1 ? stripTags(h1[1]) : label;
    var qualityMatch = /(4K|2160p|1080p|720p|HDRip|BluRay[^<]{0,8}|MicroHD|BDremux[^<]{0,8}|HDTV[^<]{0,8}|DVDRip|WEB-?DL|WEBRip)/i.exec(html);
    var quality = qualityMatch ? parseQuality(qualityMatch[1]) : 'SD';
    var sizeMatch = /(\d+(?:[.,]\d+)?\s*(?:GB|MB))/i.exec(html);
    var size = sizeMatch ? parseSize(sizeMatch[1]) : null;

    return wolfResolveDownload(host, tabla, code, pageUrl).then(function (torrentUrl) {
      if (!torrentUrl) return null;
      return torrentToMagnet(torrentUrl, { headers: { Referer: pageUrl, 'User-Agent': UA } })
        .then(function (torrent) {
          if (!torrent) return null;
          var suffix = label && label !== pageTitle ? ' · ' + label : '';
          return makeStream({
            name: 'WolfMax4K',
            title: pageTitle + suffix + ' · ' + quality,
            url: torrent.magnet,
            infoHash: torrent.infoHash,
            quality: quality,
            size: torrent.size || size,
            provider: 'wolfmax4k',
            type: 'torrent',
            language: 'Castellano',
            headers: { Referer: pageUrl }
          });
        });
    });
  });
}

function wolfGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '6' });

  return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
    var queries = searchQueries(info).slice(0, 2);
    if (!queries.length) return [];

    var cursor = 0;
    var found = [];

    function nextQuery() {
      if (cursor >= queries.length || found.length >= 8) return Promise.resolve(found);
      var term = queries[cursor++];
      var hostIndex = 0;

      function tryHost() {
        if (hostIndex >= WOLF_HOSTS.length) return nextQuery();
        var host = WOLF_HOSTS[hostIndex++].replace(/\/$/, '');
        return wolfSearch(host, term).then(function (items) {
          if (items.length) {
            found = found.concat(items.map(function (item) { item.host = host; return item; }));
            return found;
          }
          return tryHost();
        });
      }
      return tryHost();
    }

    return nextQuery().then(function (candidates) {
      var filtered = uniqueBy(candidates, function (item) { return item.url; }).filter(function (candidate) {
        if (info.isTv && !candidate.isSeries) return false;
        if (!info.isTv && candidate.isSeries) return false;
        var score = Math.max(titleScore(candidate.title, info.title), titleScore(candidate.title, info.originalTitle));
        if (score < 0.5) return false;
        return true;
      });

      var limit = parseInt(conf.maxResults, 10) || 6;
      filtered = uniqueBy(filtered, function (item) { return item.url; })
        .sort(function (a, b) { return qualityRank(a.quality) - qualityRank(b.quality); })
        .slice(0, Math.min(limit, 6));

      return mapLimit(filtered, 2, function (candidate) {
        if (info.isTv && info.season != null && !/\/episodio\//i.test(candidate.url)) {
          // ficha de temporada: localizar el episodio concreto
          return getText(candidate.url, { timeout: 15000 }).then(function (html) {
            if (!html) return [];
            var eps = wolfEpisodeLinks(html, candidate.host || candidate.url, info.season, info.episode);
            if (!eps.length) return [];
            return mapLimit(eps.slice(0, 3), 2, function (ep) {
              return wolfStreamFromPage(ep.url, info, ep.label).catch(function () { return null; });
            }).then(function (list) { return list.filter(Boolean); });
          }).catch(function () { return []; });
        }
        return wolfStreamFromPage(candidate.url, info, candidate.title)
          .then(function (stream) { return stream ? [stream] : []; })
          .catch(function () { return []; });
      }).then(function (groups) {
        var all = [];
        for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
        return finalizeStreams('WolfMax4K', all, { max: limit });
      });
    });
  }).catch(function (error) {
    log('wolfmax4k', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'WolfMax4K / WolfTorrent' },
    { type: 'info', label: 'WolfTorrent añadió Cloudflare Turnstile en octubre de 2026. Si la comprobación aparece, no se pueden resolver los .torrent y este provider no devolverá fuentes.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '6', options: [
      { value: '2', label: '2' }, { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }
    ] }
  ]);
}

module.exports = { getStreams: wolfGetStreams, onSettings: onSettings };
