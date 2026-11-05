/*__CORE__*/

/* ------------------------------------------------------------------
 * DivxTotal · divxtotal.foo  (WordPress)
 *   búsqueda  GET /?s=<término>          (tabla "Nombre | Categoría | Fecha | Tamaño")
 *   ficha     /peliculas/<slug>/  ·  /peliculas-hd/  ·  /peliculas-4k/  ·  /series/<slug>/
 *   descarga  /download_tt.php?u=<base64(URL .torrent)>
 *             y variante ofuscada short-info.link/s.php?i=<base64 ×N + ROT13>
 * ------------------------------------------------------------------ */

var DIVX_HOSTS = [
  'https://divxtotal.foo',
  'https://www.divxtotal.ms',
  'https://www.divxtotal.fi',
  'https://divxtotal.io'
];

var DIVX_CATEGORIES = ['peliculas', 'peliculas-hd', 'peliculas-3-d', 'peliculas-dvdr', 'peliculas-4k', 'series'];

function divxQualityFromUrl(url, extra) {
  var path = String(url).toLowerCase();
  if (/peliculas-4k|4k/.test(path) || /4k|2160/i.test(extra || '')) return '2160p';
  if (/peliculas-hd|1080|bluray|brrip|hdrip|microhd/.test(path) || /1080|bluray|brrip|hdrip|microhd/i.test(extra || '')) return '1080p';
  if (/720/.test(path) || /720/i.test(extra || '')) return '720p';
  return parseQuality(extra || path);
}

function divxParseListing(html, host) {
  var items = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/(?:peliculas|peliculas-hd|peliculas-3-d|peliculas-dvdr|peliculas-4k|series)\/[^"']+)["'][^>]*>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(match[1], host);
    if (!url || seen[url]) continue;
    var windowHtml = html.slice(match.index, match.index + 700);
    var title = attrOf(match[0], 'title');
    if (!title) {
      var inner = /<a[^>]*>([\s\S]{1,140}?)<\/a>/i.exec(windowHtml);
      title = inner ? stripTags(inner[1]) : null;
    }
    title = title ? stripTags(title).trim() : null;
    if (!title || title.length < 2 || /^(ver|descargar|inicio)$/i.test(title)) continue;
    seen[url] = true;
    var sizeMatch = /(\d+(?:[.,]\d+)?\s*(?:GB|MB))s?/i.exec(windowHtml);
    items.push({
      url: url,
      title: title,
      quality: divxQualityFromUrl(url, windowHtml),
      size: sizeMatch ? parseSize(sizeMatch[0]) : null,
      isSeries: /\/series\//i.test(url)
    });
  }
  return items;
}

function divxSearch(host, term) {
  return getText(host + '/?s=' + encodeURIComponent(term), { timeout: 14000 })
    .then(function (html) { return html ? divxParseListing(html, host) : []; });
}

/** `/download_tt.php?u=…` → URL real del .torrent */
function divxDirectLink(url) {
  var m = /download_tt\.php\?u=([A-Za-z0-9+/=%]+)/i.exec(url);
  if (m) {
    var raw = m[1];
    try { raw = decodeURIComponent(raw); } catch (e) { /* deja el valor */ }
    var decoded = bytesToText(b64ToBytes(raw));
    if (/^https?:\/\//i.test(decoded)) return decoded;
  }
  return null;
}

function divxCollectLinks(html) {
  var links = [];
  var re = /<a\b[^>]*(?:href|data-href)=["']([^"']+)["'][^>]*>/gi;
  var match;
  while ((match = re.exec(html))) {
    var href = decodeEntities(match[1]);
    if (/download_tt\.php\?u=/i.test(href)) {
      var real = divxDirectLink(href);
      if (real) links.push(real);
    } else if (/short-info\.link\/s\.php\?i=/i.test(href)) {
      var short = /i=([A-Za-z0-9+/=%]+)/i.exec(href);
      var decodedShort = short ? decodeShortLink(short[1]) : null;
      if (decodedShort) links.push(decodedShort);
    } else if (/\.torrent(\?|$)/i.test(href) || /^magnet:/i.test(href)) {
      links.push(href);
    }
  }
  return uniqueBy(links, function (value) { return value; });
}

function divxEpisodeRows(html) {
  var rows = [];
  var chunks = String(html).split(/<tr\b/i);
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var text = stripTags(chunk).slice(0, 200);
    var label = /(\d{1,2}x\d{1,3})/.exec(text);
    if (!label) continue;
    var links = divxCollectLinks(chunk);
    if (!links.length) continue;
    rows.push({
      label: label[1],
      text: text,
      links: links,
      size: parseSize(text)
    });
  }
  return rows;
}

function divxDetailStreams(candidate, info) {
  return getText(candidate.url, { timeout: 14000 }).then(function (html) {
    if (!html) return [];
    var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = h1 ? stripTags(h1[1]) : candidate.title;
    var qualityField = /Calidad\s*:?\s*(?:<\/?[^>]+>\s*)*([A-Za-z0-9 .\-]{2,24})/i.exec(html);
    var quality = qualityField ? parseQuality(qualityField[1]) : candidate.quality;
    var language = languageLabel((/Idioma\s*:?\s*(?:<\/?[^>]+>\s*)*([A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,24})/i.exec(html) || [])[1] || '') || 'Castellano';

    var targets = [];
    if (info.isTv && info.season != null) {
      var rows = divxEpisodeRows(html);
      for (var i = 0; i < rows.length; i++) {
        var parsed = parseSeasonEpisode(rows[i].label);
        var sameEpisode = parsed.season === info.season && (
          parsed.episode === info.episode ||
          (parsed.episodeEnd != null && info.episode >= parsed.episode && info.episode <= parsed.episodeEnd)
        );
        if (sameEpisode) {
          for (var j = 0; j < rows[i].links.length; j++) {
            targets.push({ link: rows[i].links[j], label: rows[i].label, size: rows[i].size, quality: quality });
          }
        }
      }
    }

    if (!targets.length) {
      var links = divxCollectLinks(html);
      for (var k = 0; k < links.length && k < 4; k++) {
        targets.push({ link: links[k], label: null, size: candidate.size || parseSize(html.slice(0, 8000)), quality: quality });
      }
    }

    return mapLimit(targets, 3, function (target) {
      if (/^magnet:/i.test(target.link)) {
        return Promise.resolve(makeStream({
          name: 'DivxTotal',
          title: pageTitle + (target.label ? ' · ' + target.label : '') + ' · ' + quality,
          url: target.link,
          infoHash: infoHashFromMagnet(target.link),
          quality: quality,
          size: target.size,
          language: language,
          provider: 'divxtotal',
          type: 'torrent',
          headers: { Referer: candidate.url }
        }));
      }
      return torrentToMagnet(target.link, { headers: { Referer: candidate.url, 'User-Agent': UA } })
        .then(function (torrent) {
          if (!torrent) return null;
          return makeStream({
            name: 'DivxTotal',
            title: pageTitle + (target.label ? ' · ' + target.label : '') + ' · ' + quality,
            url: torrent.magnet,
            infoHash: torrent.infoHash,
            quality: quality,
            size: torrent.size || target.size,
            language: language,
            provider: 'divxtotal',
            type: 'torrent',
            headers: { Referer: candidate.url }
          });
        });
    }).then(function (streams) { return streams.filter(Boolean); });
  });
}

function divxGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });

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
        if (hostIndex >= DIVX_HOSTS.length) return nextQuery();
        var host = DIVX_HOSTS[hostIndex++].replace(/\/$/, '');
        return divxSearch(host, term).then(function (items) {
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
        if (info.isTv && !matchesEpisode(candidate.title, info.season, info.episode)) {
          // la ficha de serie no suele llevar SxxEyy: se deja pasar y se filtra dentro
          if (!/\/series\//i.test(candidate.url)) return false;
        }
        return true;
      });

      var limit = parseInt(conf.maxResults, 10) || 8;
      filtered = uniqueBy(filtered, function (item) { return item.url; })
        .sort(function (a, b) { return qualityRank(a.quality) - qualityRank(b.quality); })
        .slice(0, Math.min(limit, 8));

      return mapLimit(filtered, 3, function (candidate) {
        return divxDetailStreams(candidate, info).catch(function () { return []; });
      }).then(function (groups) {
        var all = [];
        for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
        return finalizeStreams('DivxTotal', all, { max: limit });
      });
    });
  }).catch(function (error) {
    log('divxtotal', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'DivxTotal' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] }
  ]);
}

module.exports = { getStreams: divxGetStreams, onSettings: onSettings };
