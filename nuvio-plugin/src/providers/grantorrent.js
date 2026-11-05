/*__CORE__*/

/* ------------------------------------------------------------------
 * GranTorrent · grantorrent.fyi  (WordPress + tema DooPlay/PichoTorrent)
 * Cine y series en castellano, latino y VOSE.
 *
 *   búsqueda  GET /?s=<término>                (tarjetas con póster)
 *   película  /peliculas/<slug>/
 *   serie     /series/<slug>/   →   /temporada/<slug>-temporada-<n>/
 *             →   /episodios/<slug>-<n>x<m>/
 *   fuentes   tabla «Opciones | Calidad | Idioma | Tamaño | Clicks»
 *             · filas «Obtener torrent» (icono utorrent.com) → /enlaces/<code>/
 *             · filas «Descarga» (host externo) → /enlaces/<code>/ → host
 *   cadena    /enlaces/<code>/  → 302 a un host de ficheros (filess.top …)
 *             → página «Espere por favor» con el botón de descarga
 *             → .torrent → bencode → infohash → magnet
 *
 * El sitio está detrás de Cloudflare y rota de dominio con frecuencia:
 * se prueban varios hosts y, si aparece el desafío, se devuelve [].
 * ------------------------------------------------------------------ */

var GT_HOSTS = [
  'https://grantorrent.fyi',
  'https://grantorrent.zip',
  'https://grantorrent.lol',
  'https://grantorrent.wf',
  'https://grantorrent.bz',
  'https://grantorrent.si',
  'https://grantorrent.re',
  'https://grantorrent.ch'
];

/** Petición al sitio con la sesión de Cloudflare del usuario, si existe. */
function gtGet(url, extra) {
  return getText(url, { timeout: 16000, headers: browserHeaders(extra) });
}

/** Idioma de una fila de la tabla de enlaces. */
function gtLanguage(text) {
  var s = String(text == null ? '' : text);
  if (/latino/i.test(s)) return 'Latino';
  if (/castellano/i.test(s)) return 'Castellano';
  if (/vose|subtitulad|original con subt/i.test(s)) return 'VOSE';
  if (/dual/i.test(s)) return 'Dual';
  return languageLabel(s) || 'Castellano';
}

/** Tarjetas de /?s= y de los listados. */
function gtParseCards(html, baseUrl) {
  var items = [];
  var byUrl = {};
  var re = /<a\b[^>]*href=["']([^"']*\/(?:peliculas|series|temporada)\/[^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(decodeEntities(match[1]), baseUrl);
    if (!url) continue;
    var text = stripTags(match[2]).replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) continue;
    if (/^(inicio|pel[ií]culas|series|generos|géneros|contacto|telegram)$/i.test(text)) continue;

    var existing = byUrl[url];
    if (existing) {
      // el ancla del título es más larga que la del póster: se queda la mejor
      if (text.length > existing.title.length && !/^temporada\s*\d+/i.test(text)) existing.title = text;
      continue;
    }

    var windowHtml = html.slice(match.index, match.index + 1200);
    var qualityMatch = /(4k|2160p|1080p|720p|hdrip|bluray[^<]{0,8}|bdremux|microhd|dvdrip|web-?dl|webrip|hdtv|cam)/i.exec(windowHtml);
    var isSeries = /\/(?:series|temporada)\//i.test(url);
    var item = {
      url: url,
      title: text,
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : 'SD',
      size: null,
      year: parseYear(windowHtml.slice(0, 400)),
      season: null,
      isSeries: isSeries
    };
    var seasonMatch = /temporada[- ]?(\d{1,2})/i.exec(url + ' ' + text);
    if (seasonMatch) item.season = parseInt(seasonMatch[1], 10);
    byUrl[url] = item;
    items.push(item);
  }
  return items;
}

function gtSearch(host, term) {
  var url = host + '/?s=' + encodeURIComponent(String(term).replace(/\s+/g, '+'));
  return gtGet(url).then(function (html) {
    if (isChallengeHtml(html)) {
      log('grantorrent', 'desafío de Cloudflare en la búsqueda' + (hasCloudflareSession() ? ' (cookie caducada)' : ' (sin cfCookie)'));
      return [];
    }
    return gtParseCards(html, host);
  });
}

/**
 * Tabla de enlaces de una ficha.
 * Devuelve [{ href, kind:'torrent'|'host', quality, language, size, clicks }]
 */
function gtParseLinkRows(html, baseUrl) {
  var rows = [];
  var chunks = String(html).split(/<tr\b/i);
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,160}?)<\/a>/i.exec(chunk);
    if (!anchor) continue;
    var href = absoluteUrl(decodeEntities(anchor[1]), baseUrl);
    if (!href) continue;
    if (!/\/enlaces\/[^/]+/i.test(href) && !/\.torrent(\?|$)/i.test(href) && !/^magnet:/i.test(href)) continue;

    var cells = chunk.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
    var texts = cells.map(function (cell) { return stripTags(cell).replace(/\s+/g, ' ').trim(); });
    var rowText = stripTags(chunk).replace(/\s+/g, ' ').trim();
    var anchorText = stripTags(anchor[2]).replace(/\s+/g, ' ').trim();

    var qualityMatch = /(4k\s*uhdrip|4k|2160p|1080p|720p|hdrip|bluray[\s-]?rip|bluray[\s-]?1080p|bluray[\s-]?720p|bdremux|microhd|dvdrip|web-?dl|webrip|hdtv|cam)/i.exec(rowText);
    var sizeMatch = /(\d+(?:[.,]\d+)?\s*(?:GB|MB|TB))/i.exec(rowText);
    var clicksMatch = /(\d{1,6})\s*$/.exec(rowText);
    var hostIcon = /favicons\?domain=([^"'&]+)/i.exec(chunk);
    var hostDomain = hostIcon ? decodeURIComponent(hostIcon[1]).toLowerCase() : '';

    var kind = 'host';
    if (/utorrent|bittorrent|\.torrent/i.test(anchorText + ' ' + hostDomain)) kind = 'torrent';
    if (/^magnet:/i.test(href) || /\.torrent(\?|$)/i.test(href)) kind = 'torrent';

    rows.push({
      href: href,
      code: (/\/enlaces\/([^/?#]+)/i.exec(href) || [])[1] || null,
      anchorText: anchorText,
      host: hostDomain,
      kind: kind,
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : parseQuality(rowText),
      language: gtLanguage(texts.slice(0, 4).join(' ') || rowText),
      size: sizeMatch ? parseSize(sizeMatch[1]) : null,
      clicks: clicksMatch ? parseInt(clicksMatch[1], 10) : null
    });
  }
  return rows;
}

/** Ficha de película / episodio. */
function gtPageInfo(html, fallbackTitle) {
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  var title = h1 ? stripTags(h1[1]) : fallbackTitle;
  var audioMatch = /Audio\s*:?\s*(?:<\/?[^>]+>\s*)*([^<|]{3,60})/i.exec(html);
  var qualityMatch = /Calidad\s*:?\s*(?:<\/?[^>]+>\s*)*([^<|]{2,40})/i.exec(html);
  return {
    title: title ? title.replace(/\s+/g, ' ').trim() : fallbackTitle,
    language: audioMatch ? gtLanguage(audioMatch[1]) : null,
    quality: qualityMatch ? parseQuality(qualityMatch[1]) : null,
    year: parseYear(html.slice(0, 4000))
  };
}

/** Enlaces de episodios de una página de temporada/serie. */
function gtEpisodeLinks(html, baseUrl, season, episode) {
  var out = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/episodios\/[^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(decodeEntities(match[1]), baseUrl);
    if (!url || seen[url]) continue;
    var slug = url.replace(/\/$/, '').split('/').pop();
    var parsed = /(\d{1,2})x(\d{1,3})/i.exec(slug) || /(\d{1,2})x(\d{1,3})/i.exec(stripTags(match[2]));
    if (!parsed) continue;
    if (parseInt(parsed[1], 10) !== season) continue;
    if (episode != null && parseInt(parsed[2], 10) !== episode) continue;
    seen[url] = true;
    out.push({ url: url, label: stripTags(match[2]).trim() || parsed[0] });
  }
  return out;
}

/** `/enlaces/<code>/` → página del host → .torrent → magnet */
function gtResolveShort(shortUrl, referer) {
  return gtGet(shortUrl, { Referer: referer }).then(function (html) {
    if (isChallengeHtml(html)) return null;
    var candidates = [];
    var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
    var match;
    while ((match = re.exec(html))) {
      var href = decodeEntities(match[1]);
      if (!/^https?:\/\//i.test(href)) continue;
      if (/grantorrent|facebook|twitter|telegram|whatsapp|t\.me|sharethis/i.test(href)) continue;
      candidates.push(href);
    }
    // el botón «Continuar / Haga clic para continuar» suele ser el primero útil
    if (!candidates.length) {
      var redirect = /(?:location(?:\.href)?\s*=|window\.open\()\s*["']([^"']+)["']/i.exec(html);
      if (redirect) candidates.push(decodeEntities(redirect[1]));
    }
    if (!candidates.length) return null;

    var index = 0;
    function next() {
      if (index >= candidates.length || index >= 4) return Promise.resolve(null);
      var url = candidates[index++];
      return resolveTorrentOrMagnet(url, {
        headers: browserHeaders({ Referer: shortUrl }),
        timeout: 18000,
        maxDepth: 2
      }).then(function (torrent) {
        return torrent || next();
      });
    }
    return next();
  }).catch(function () { return null; });
}

function gtStreamsFromPage(pageUrl, referer, info, label) {
  return gtGet(pageUrl).then(function (html) {
    if (isChallengeHtml(html)) return [];
    var page = gtPageInfo(html, label || info.title);
    var rows = gtParseLinkRows(html, pageUrl);

    // idioma preferido por el usuario
    var conf = settings({ preferredLanguage: 'any' });
    var preferred = String(conf.preferredLanguage || 'any').toLowerCase();
    if (preferred === 'castellano' || preferred === 'latino') {
      var filtered = rows.filter(function (row) { return row.language.toLowerCase() === preferred; });
      if (filtered.length) rows = filtered;
    }

    // primero las filas de tipo torrent: dan el magnet sin intermediarios
    rows.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === 'torrent' ? -1 : 1;
      return qualityRank(a.quality) - qualityRank(b.quality);
    });

    var prefix = label && label !== page.title ? label + ' · ' : '';
    return mapLimit(rows.slice(0, 6), 2, function (row) {
      return gtResolveShort(row.href, referer || pageUrl).then(function (torrent) {
        if (!torrent) return null;
        var quality = row.quality !== 'SD' ? row.quality : (page.quality || 'SD');
        return makeStream({
          name: 'GranTorrent',
          title: page.title + ' · ' + prefix + quality,
          url: torrent.magnet,
          infoHash: torrent.infoHash,
          quality: quality,
          size: torrent.size || row.size,
          language: row.language || page.language || 'Castellano',
          provider: 'grantorrent',
          type: 'torrent',
          headers: { Referer: pageUrl }
        });
      }).catch(function () { return null; });
    }).then(function (list) { return list.filter(Boolean); });
  });
}

function gtGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8', preferredLanguage: 'any', baseUrl: '' });

  return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
    var limit = parseInt(conf.maxResults, 10);
    if (!isFinite(limit) || limit <= 0) limit = 8;

    var hosts = GT_HOSTS.slice();
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
        return gtSearch(host, term).then(function (items) {
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
        if (score < 0.5) return false;
        if (info.isTv && candidate.season != null && info.season != null && candidate.season !== info.season) {
          // puede ser la ficha de la serie completa: se deja pasar solo si no lleva temporada
          return false;
        }
        if (info.year && candidate.year && Math.abs(candidate.year - info.year) > 1) return false;
        return true;
      });

      filtered = filtered
        .sort(function (a, b) { return qualityRank(a.quality) - qualityRank(b.quality); })
        .slice(0, Math.min(limit, 5));

      return mapLimit(filtered, 2, function (candidate) {
        var host = candidate.host;

        if (!info.isTv) return gtStreamsFromPage(candidate.url, host + '/', info);

        // series: primero la página del episodio exacto
        var slugMatch = /\/(?:series|temporada)\/([^/]+?)(?:-temporada-\d+)?\/?$/i.exec(candidate.url);
        var slug = slugMatch ? slugMatch[1] : null;
        if (slug && info.season != null && info.episode != null) {
          var episodeUrl = host + '/episodios/' + slug + '-' + info.season + 'x' + info.episode + '/';
          return gtStreamsFromPage(episodeUrl, candidate.url, info, seasonEpisodeLabel(info.season, info.episode))
            .then(function (streams) {
              if (streams.length) return streams;
              // si la ficha es de temporada, se buscan los enlaces de episodio dentro
              return gtGet(candidate.url).then(function (html) {
                if (isChallengeHtml(html)) return [];
                var links = gtEpisodeLinks(html, candidate.url, info.season, info.episode);
                if (!links.length) return [];
                return gtStreamsFromPage(links[0].url, candidate.url, info, links[0].label);
              });
            })
            .catch(function () { return []; });
        }

        return gtStreamsFromPage(candidate.url, host + '/', info).catch(function () { return []; });
      }).then(function (groups) {
        var all = [];
        for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
        return finalizeStreams('GranTorrent', all, { max: limit });
      });
    });
  }).catch(function (error) {
    log('grantorrent', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'GranTorrent' },
    { type: 'info', label: 'Los enlaces «Obtener torrent» pasan por /enlaces/<code>/ y un host de ficheros (files host). El provider sigue la cadena hasta el .torrent y lo convierte en magnet con su infohash real.' },
    { type: 'select', key: 'preferredLanguage', label: 'Idioma preferido', defaultValue: 'any', options: [
      { value: 'any', label: 'Cualquiera' },
      { value: 'castellano', label: 'Castellano' },
      { value: 'latino', label: 'Latino' }
    ] },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] },
    { type: 'text', key: 'baseUrl', label: 'Dominio actual (opcional)', placeholder: 'https://grantorrent.fyi' },
    { type: 'text', key: 'cfCookie', label: 'Cookie de Cloudflare (opcional)', placeholder: 'cf_clearance=…' },
    { type: 'text', key: 'userAgent', label: 'User-Agent del navegador (opcional)', placeholder: 'Mozilla/5.0 …' }
  ]);
}

module.exports = { getStreams: gtGetStreams, onSettings: onSettings };
