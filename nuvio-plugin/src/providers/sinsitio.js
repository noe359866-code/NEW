/*__CORE__*/

/* ------------------------------------------------------------------
 * SinSitio · sinsitio.site  (DataLife Engine)
 *   búsqueda  GET /index.php?do=search&subaction=search&story=<término>
 *   ficha     /<categoría>/<id>-<slug>.html
 *   descarga  /ddlUrl.php?url=<base64(/index.php?do=download&id=NNNN)>
 *             → .torrent → infohash → magnet
 * ------------------------------------------------------------------ */

var SINSITIO_HOSTS = [
  'https://www.sinsitio.site',
  'https://sinsitio.site'
];

function sinsitioParseListing(html, host) {
  var items = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']((?:https?:\/\/[^"']*sinsitio\.[a-z]+)?\/[a-z0-9_-]+\/(\d+)-[^"']+\.html)["'][^>]*>([\s\S]{0,220}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(match[1], host);
    var inner = stripTags(match[3]);
    if (!url || seen[url]) continue;
    if (!inner || inner.length < 3) continue;
    if (/^(leer m[áa]s|comentarios|ver m[áa]s|\+\d+)$/i.test(inner)) continue;
    seen[url] = true;
    var windowHtml = html.slice(match.index, match.index + 800);
    items.push({
      url: url,
      title: inner,
      quality: parseQuality(inner + ' ' + windowHtml.slice(0, 300)),
      size: parseSize(inner),
      isSeries: /\/series?(-|\/)|temporada|\bT\d{1,2}\b|cap[íi]tulo/i.test(url + ' ' + inner)
    });
  }
  return items;
}

function sinsitioSearch(host, term) {
  var url = host + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(term);
  return getText(url, { timeout: 14000 }).then(function (html) {
    return html ? sinsitioParseListing(html, host) : [];
  });
}

function sinsitioDecodeDdl(href) {
  var m = /ddlUrl\.php\?url=([A-Za-z0-9+/=%]+)/i.exec(href);
  if (!m) return null;
  var raw = m[1];
  try { raw = decodeURIComponent(raw); } catch (e) { /* valor tal cual */ }
  var decoded = bytesToText(b64ToBytes(raw));
  if (/^https?:\/\//i.test(decoded)) return decoded;
  // doble codificación vista en fichas antiguas
  var second = bytesToText(b64ToBytes(decoded));
  return /^https?:\/\//i.test(second) ? second : null;
}

function sinsitioCollectLinks(html) {
  var links = [];
  var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var href = decodeEntities(match[1]);
    var text = stripTags(match[2]);
    var real = null;
    if (/ddlUrl\.php\?url=/i.test(href)) {
      real = sinsitioDecodeDdl(href);
    } else if (/\.torrent(\?|$)/i.test(href)) {
      real = absoluteUrl(href, 'https://www.sinsitio.site');
    } else if (/^magnet:/i.test(href)) {
      real = href;
    }
    if (real) links.push({ link: real, label: text });
  }
  return links;
}

function sinsitioDetailStreams(candidate, info) {
  return getText(candidate.url, { timeout: 14000 }).then(function (html) {
    if (!html) return [];
    var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = h1 ? stripTags(h1[1]).replace(/^Descargar\s+/i, '') : candidate.title;
    var links = sinsitioCollectLinks(html);
    if (!links.length) return [];

    var filtered = links;
    if (info.isTv && info.season != null) {
      var matching = links.filter(function (entry) {
        return matchesEpisode(entry.label + ' ' + pageTitle, info.season, info.episode);
      });
      if (matching.length) filtered = matching;
    }

    return mapLimit(filtered.slice(0, 6), 3, function (entry) {
      var quality = parseQuality(entry.label + ' ' + candidate.title);
      var size = parseSize(entry.label) || candidate.size;
      var language = languageLabel(entry.label) || (/(castellano|espa)/i.test(pageTitle) ? 'Castellano' : languageLabel(pageTitle));
      var label = String(entry.label).replace(/\s+/g, ' ').replace(/\d+(?:[.,]\d+)?\s*(?:GB|MB)s?$/i, '').trim();
      var title = (label || pageTitle) + ' · ' + quality;

      if (/^magnet:/i.test(entry.link)) {
        return Promise.resolve(makeStream({
          name: 'SinSitio',
          title: title,
          url: entry.link,
          infoHash: infoHashFromMagnet(entry.link),
          quality: quality,
          size: size,
          language: language,
          provider: 'sinsitio',
          type: 'torrent',
          headers: { Referer: candidate.url }
        }));
      }

      return torrentToMagnet(entry.link, { headers: { Referer: candidate.url, 'User-Agent': UA } })
        .then(function (torrent) {
          if (!torrent) return null;
          return makeStream({
            name: 'SinSitio',
            title: title,
            url: torrent.magnet,
            infoHash: torrent.infoHash,
            quality: quality,
            size: torrent.size || size,
            language: language,
            provider: 'sinsitio',
            type: 'torrent',
            headers: { Referer: candidate.url }
          });
        });
    }).then(function (streams) { return streams.filter(Boolean); });
  });
}

function sinsitioGetStreams(tmdbId, mediaType, season, episode) {
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
        if (hostIndex >= SINSITIO_HOSTS.length) return nextQuery();
        var host = SINSITIO_HOSTS[hostIndex++].replace(/\/$/, '');
        return sinsitioSearch(host, term).then(function (items) {
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
        var score = Math.max(titleScore(candidate.title, info.title), titleScore(candidate.title, info.originalTitle));
        if (score < 0.5) return false;
        if (info.isTv) {
          if (!candidate.isSeries && !matchesEpisode(candidate.title, info.season, info.episode)) return false;
          if (!matchesEpisode(candidate.title, info.season, info.episode)) {
            // puede ser un pack o una ficha de serie sin episodio en el título
            return candidate.isSeries || /temporada|\bT\d\b/i.test(candidate.title);
          }
        }
        return true;
      });

      var limit = parseInt(conf.maxResults, 10) || 8;
      filtered = uniqueBy(filtered, function (item) { return item.url; }).slice(0, Math.min(limit, 8));

      return mapLimit(filtered, 3, function (candidate) {
        return sinsitioDetailStreams(candidate, info).catch(function () { return []; });
      }).then(function (groups) {
        var all = [];
        for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
        return finalizeStreams('SinSitio', all, { max: limit });
      });
    });
  }).catch(function (error) {
    log('sinsitio', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'SinSitio' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] }
  ]);
}

module.exports = { getStreams: sinsitioGetStreams, onSettings: onSettings };
