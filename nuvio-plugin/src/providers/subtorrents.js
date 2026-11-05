/*__CORE__*/

/* ------------------------------------------------------------------
 * SubTorrents · www1.subtorrents.zip  (WordPress, cine subtitulado)
 *   búsqueda  GET /peliculas-subtituladas/?s=<término>   (tabla)
 *             GET /series-2/?s=<término>                (tabla)
 *   ficha     /peliculas/<slug>/   ·  /series/<slug>/
 *   descarga  opción 2: .torrent directo en /wp-content/uploads/…
 *             opción 1: enlace-protegido.com/s.php?i=<base64 ×N + ROT13>
 *   series    tabla por temporada con "Título 4x1" → mismo acortador
 *
 * Verificado en vivo el 5 de noviembre de 2026 con "Toy Story 5"
 * (ficha y .torrent directo) y "Reacher" (temporada 4, episodios 4x1…).
 * ------------------------------------------------------------------ */

var SUB_HOSTS = [
  'https://www1.subtorrents.zip',
  'https://subtorrents.zip',
  'https://www.subtorrents.zip',
  'https://www2.subtorrents.zip'
];

var SUB_MOVIE_PATH = '/peliculas-subtituladas/';
var SUB_SERIES_PATH = '/series-2/';

var SUB_LANG = {
  '1': 'Latino',
  '2': 'VOSE',
  '512': 'Subtitulado'
};

function subLanguage(windowHtml, fallback) {
  var flag = /idioma\/(\d{1,3})\.png/i.exec(windowHtml || '');
  if (flag && SUB_LANG[flag[1]]) return SUB_LANG[flag[1]];
  if (/espa[ñn]ol\s+latino/i.test(windowHtml || '')) return 'Latino';
  if (/castellano|espa[ñn]ol/i.test(windowHtml || '')) return 'Castellano';
  if (/ingl[eé]s|subt[ií]tul/i.test(windowHtml || '')) return 'VOSE';
  return fallback || 'Subtitulado';
}

function subRowWindow(html, index) {
  var start = html.lastIndexOf('<tr', index);
  var end = html.indexOf('</tr>', index);
  if (start === -1 || end === -1) return html.slice(Math.max(index - 400, 0), index + 900);
  return html.slice(start, end + 5);
}

function subParseRows(html, host, wantSeries) {
  var items = [];
  var seen = {};
  var section = wantSeries ? 'series' : 'peliculas';
  var re = new RegExp('<a\\b[^>]*href=["\']([^"\']*\\/' + section + '\\/[^"\']+)["\'][^>]*>([\\s\\S]{0,160}?)<\\/a>', 'gi');
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(match[1], host);
    if (!url) continue;
    if (/\/series-2\/|\/peliculas-subtituladas\/|\/series\/page\//i.test(url)) continue;
    var key = url.replace(/\/$/, '');
    if (seen[key]) continue;

    var row = subRowWindow(html, match.index);
    var title = attrOf(match[0], 'title');
    if (!title) title = stripTags(match[2]);
    title = title ? title.replace(/\s+/g, ' ').trim() : null;
    if (!title || title.length < 2) continue;
    // enlaces de navegación (letras, filtros, migas)
    if (/^(a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|0-9)$/i.test(title)) continue;
    seen[key] = true;

    var qualityText = '';
    var cells = row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/gi) || [];
    for (var i = 0; i < cells.length; i++) {
      var cell = stripTags(cells[i]).trim();
      if (/^(4k|2160p?|1080p?|720p?|hdrip|dvdrip|dvd|bluray|bdremux|hq-?ts|ts|screener|web-?dl|microhd|hdtv|1080i|full hd)$/i.test(cell)) {
        qualityText = cell;
        break;
      }
    }
    if (!qualityText) {
      var qualityMatch = /(4K|2160p|1080p|720p|HDRip|DVDrip|BluRay|BDRemux|HQ-?TS|TS-Screener|DVDScreener|WEB-?DL|MicroHD|HDTV)/i.exec(row);
      qualityText = qualityMatch ? qualityMatch[1] : '';
    }

    var dateMatch = /(\d{2})-(\d{2})-(\d{4})/.exec(row);
    var sizeMatch = /(\d+(?:[.,]\d+)?\s*(?:GB|MB))/i.exec(row);

    items.push({
      url: url,
      title: title,
      year: dateMatch ? parseInt(dateMatch[3], 10) : null,
      date: dateMatch ? dateMatch[0] : null,
      quality: parseQuality(qualityText || row),
      size: sizeMatch ? parseSize(sizeMatch[1]) : null,
      language: subLanguage(row, 'Subtitulado'),
      isSeries: !!wantSeries
    });
  }
  return items;
}

function subSearch(host, term, wantSeries) {
  var basePath = wantSeries ? SUB_SERIES_PATH : SUB_MOVIE_PATH;
  var url = host + basePath + '?s=' + encodeURIComponent(String(term).replace(/\s+/g, '+'));
  return getText(url, { timeout: 15000 }).then(function (html) {
    return html ? subParseRows(html, host, wantSeries) : [];
  });
}

function submQualityAndLanguage(html) {
  var quality = null;
  var label = /Calidad[\s\S]{0,120}?<\/?[a-z][^>]*>([^<]{1,40})/i.exec(html);
  if (label) quality = parseQuality(stripTags(label[1]));
  if (!quality) quality = parseQuality(html);
  return {
    quality: quality,
    language: subLanguage(html, 'Subtitulado'),
    year: parseYear(html),
    size: (function () {
      var sizeMatch = /(?:Tama[ñn]o|Peso)[\s\S]{0,80}?(\d+(?:[.,]\d+)?\s*(?:GB|MB))/i.exec(html) ||
        /(\d+(?:[.,]\d+)?\s*(?:GB|MB))/i.exec(html);
      return sizeMatch ? parseSize(sizeMatch[1]) : null;
    })()
  };
}

/** .torrent directo (opción 2) o acortador enlace-protegido.com (opción 1). */
function subDownloadTargets(html) {
  var targets = [];
  var seen = {};
  var direct = /<a\b[^>]*href=["']([^"']*\/wp-content\/uploads\/[^"']*\.torrent)["']/gi;
  var match;
  while ((match = direct.exec(html))) {
    var url = decodeEntities(match[1]);
    if (!seen[url]) {
      seen[url] = true;
      targets.push(url);
    }
  }
  var short = /<a\b[^>]*href=["']([^"']*(?:enlace-protegido|acortame-esto|short-info)\.com\/s\.php\?i=[^"']+)["']/gi;
  while ((match = short.exec(html))) {
    var href = decodeEntities(match[1]);
    if (seen[href]) continue;
    seen[href] = true;
    targets.push(href);
  }
  return targets;
}

function subResolveTorrentLink(href) {
  if (/\.torrent(\?|$)/i.test(href)) return Promise.resolve(href);
  var decoded = decodeShortLinkOrUrl(href);
  if (!decoded) return Promise.resolve(null);
  return Promise.resolve(decoded);
}

function subMovieStreams(url, info, meta) {
  return getText(url, { timeout: 15000 }).then(function (html) {
    if (!html) return [];
    var page = submQualityAndLanguage(html);
    var targets = subDownloadTargets(html);
    if (!targets.length) {
      log('subtorrents', 'sin enlaces de descarga en ' + url);
      return [];
    }
    return mapLimit(targets.slice(0, 3), 2, function (href) {
      return subResolveTorrentLink(href)
        .then(function (torrentUrl) {
          if (!torrentUrl) return null;
          return torrentToMagnet(torrentUrl, { headers: { Referer: url, 'User-Agent': UA } });
        })
        .then(function (torrent) {
          if (!torrent) return null;
          var quality = page.quality && page.quality !== 'SD' ? page.quality : meta.quality;
          return makeStream({
            name: 'SubTorrents',
            title: info.title + ' · ' + (quality || 'SD'),
            url: torrent.magnet,
            infoHash: torrent.infoHash,
            quality: quality || 'SD',
            size: torrent.size || page.size || meta.size,
            language: page.language,
            provider: 'subtorrents',
            type: 'torrent',
            headers: { Referer: url }
          });
        })
        .catch(function () { return null; });
    }).then(function (list) { return list.filter(Boolean); });
  });
}

/** Empareja "Título 4x1" / "Título 4×1" de la tabla de capítulos. */
function subEpisodeLinks(html, host, season, episode) {
  var out = [];
  var seen = {};
  var re = /<a\b([^>]*)href=["']([^"']*(?:s\.php\?i=|\.torrent)[^"']*)["']([^>]*)>([\s\S]{0,160}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var attrs = (match[1] || '') + ' ' + (match[3] || '');
    var href = decodeEntities(match[2]);
    var label = attrOf(attrs + ' title=""', 'title') || stripTags(match[4]);
    if (!label) continue;
    var se = parseSeasonEpisode(label);
    if (se.season == null || se.episode == null) continue;
    if (season != null && se.season !== season) continue;
    if (episode != null && se.episode !== episode) continue;
    var key = href + '|' + label;
    if (seen[key]) continue;
    seen[key] = true;
    out.push({
      url: absoluteUrl(href, host),
      label: label,
      quality: parseQuality(subRowWindow(html, match.index)),
      language: subLanguage(subRowWindow(html, match.index), 'VOSE')
    });
  }
  return out;
}

function subSeriesStreams(url, info) {
  return getText(url, { timeout: 15000 }).then(function (html) {
    if (!html) return [];
    var host = url.replace(/^(https?:\/\/[^/]+).*$/i, '$1');
    var episodes = subEpisodeLinks(html, host, info.season, info.episode);
    if (!episodes.length) {
      log('subtorrents', 'episodio ' + info.season + 'x' + info.episode + ' no encontrado en ' + url);
      return [];
    }
    return mapLimit(episodes.slice(0, 3), 2, function (ep) {
      return Promise.resolve(decodeShortLinkOrUrl(ep.url))
        .then(function (torrentUrl) {
          if (!torrentUrl) return null;
          return torrentToMagnet(torrentUrl, { headers: { Referer: url, 'User-Agent': UA } });
        })
        .then(function (torrent) {
          if (!torrent) return null;
          return makeStream({
            name: 'SubTorrents',
            title: info.title + ' · ' + seasonEpisodeLabel(info.season, info.episode) + ' · ' + (ep.quality || 'SD'),
            url: torrent.magnet,
            infoHash: torrent.infoHash,
            quality: ep.quality || 'SD',
            size: torrent.size,
            language: ep.language,
            provider: 'subtorrents',
            type: 'torrent',
            headers: { Referer: url }
          });
        })
        .catch(function () { return null; });
    }).then(function (list) { return list.filter(Boolean); });
  });
}

function subtorrentsGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });

  return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
    var wantSeries = !!info.isTv;
    var queries = searchQueries(info).slice(0, 2);
    if (!queries.length) return [];

    var cursor = 0;
    var found = [];

    function nextQuery() {
      if (cursor >= queries.length || found.length >= 10) return Promise.resolve(found);
      var term = queries[cursor++];
      var hostIndex = 0;

      function tryHost() {
        if (hostIndex >= SUB_HOSTS.length) return nextQuery();
        var host = SUB_HOSTS[hostIndex++].replace(/\/$/, '');
        return subSearch(host, term, wantSeries)
          .then(function (items) {
            if (items.length) {
              found = found.concat(items.map(function (item) { item.host = host; return item; }));
              return found;
            }
            return tryHost();
          })
          .catch(function () { return tryHost(); });
      }
      return tryHost();
    }

    return nextQuery().then(function (candidates) {
      var filtered = uniqueBy(candidates, function (item) { return item.url; }).filter(function (candidate) {
        if (wantSeries !== !!candidate.isSeries) return false;
        var score = Math.max(
          titleScore(candidate.title, info.title),
          titleScore(candidate.title, info.originalTitle)
        );
        return score >= 0.5;
      });

      var limit = parseInt(conf.maxResults, 10) || 8;
      filtered = filtered
        .sort(function (a, b) { return qualityRank(b.quality) - qualityRank(a.quality); })
        .slice(0, Math.min(limit, 6));

      return mapLimit(filtered, 2, function (candidate) {
        var task = wantSeries ? subSeriesStreams(candidate.url, info) : subMovieStreams(candidate.url, info, candidate);
        return task.catch(function () { return []; });
      }).then(function (groups) {
        var all = [];
        for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
        return finalizeStreams('SubTorrents', all, { max: limit });
      });
    });
  }).catch(function (error) {
    log('subtorrents', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'SubTorrents' },
    { type: 'info', label: 'Catálogo centrado en versión original subtitulada al español. Usa el .torrent directo cuando existe y, si no, resuelve el acortador enlace-protegido.com.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] }
  ]);
}

module.exports = { getStreams: subtorrentsGetStreams, onSettings: onSettings };
