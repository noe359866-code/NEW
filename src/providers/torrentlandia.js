/*__CORE__*/

/* ------------------------------------------------------------------
 * TorrentLandia · torrentlandia.site  (DataLife Engine)
 *
 * Estado (05/11/2026): el dominio .site ya no resuelve y el sitio no
 * responde en ninguno de sus alias conocidos. El provider queda
 * desactivado por defecto en el manifest y acepta un dominio nuevo
 * desde sus ajustes, así vuelve a funcionar sin tocar el código.
 *
 *   búsqueda  GET /index.php?do=search&subaction=search&story=<término>
 *   ficha     /<categoría>/<id>-<slug>.html
 *   descarga  .torrent / magnet / ddlUrl.php / download.php / enlaces cortos
 * ------------------------------------------------------------------ */

var TORRENTLANDIA_DEFAULT_HOSTS = [
  'https://torrentlandia.site',
  'https://www.torrentlandia.site',
  'https://torrentlandia.com',
  'https://torrentlandia.net'
];

function torrentlandiaHosts() {
  var conf = settings({ baseUrl: '' });
  var list = [];
  if (conf.baseUrl) list.push(String(conf.baseUrl).trim());
  return list.concat(TORRENTLANDIA_DEFAULT_HOSTS).filter(function (value, index, arr) {
    return value && arr.indexOf(value) === index;
  });
}

function torrentlandiaParseListing(html, host) {
  var items = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']((?:https?:\/\/[^"']+)?\/[a-z0-9_-]+\/\d+-[^"']+\.html)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(match[1], host);
    var title = stripTags(match[2]);
    if (!url || !title || title.length < 3 || seen[url]) continue;
    if (/^(leer m[áa]s|comentarios|ver m[áa]s)$/i.test(title)) continue;
    seen[url] = true;
    var windowHtml = html.slice(match.index, match.index + 700);
    items.push({
      url: url,
      title: title,
      quality: parseQuality(title + ' ' + windowHtml),
      size: parseSize(title) || parseSize(windowHtml),
      isSeries: /serie|temporada|\bT\d{1,2}\b/i.test(url + ' ' + title)
    });
  }
  return items;
}

function torrentlandiaFindContent(html, host) {
  var links = [];
  var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var href = decodeEntities(match[1]);
    var text = stripTags(match[2]);
    var resolved = null;
    if (/^magnet:/i.test(href)) {
      resolved = href;
    } else if (/\.torrent(\?|$)/i.test(href)) {
      resolved = absoluteUrl(href, host);
    } else if (/ddlUrl\.php\?url=([A-Za-z0-9+/=%]+)/i.test(href)) {
      var ddl = /url=([A-Za-z0-9+/=%]+)/i.exec(href);
      var decoded = ddl ? bytesToText(b64ToBytes(decodeURIComponent(ddl[1]))) : '';
      resolved = /^https?:\/\//i.test(decoded) ? decoded : null;
    } else if (/short-info\.link\/s\.php\?i=|acortame-esto\.com\/s\.php\?i=/i.test(href)) {
      var short = /i=([A-Za-z0-9+/=%]+)/i.exec(href);
      resolved = short ? decodeShortLink(short[1]) : null;
    } else if (/download\.php\?|dl\.php\?/i.test(href)) {
      resolved = absoluteUrl(href, host);
    }
    if (resolved) links.push({ link: resolved, label: text });
  }
  return uniqueBy(links, function (entry) { return entry.link; });
}

function torrentlandiaGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ baseUrl: '', maxResults: '6' });

  return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
    var queries = searchQueries(info).slice(0, 2);
    if (!queries.length) return [];

    var hosts = torrentlandiaHosts();

    function probeHost(index) {
      if (index >= hosts.length) return Promise.resolve(null);
      var host = hosts[index].replace(/\/$/, '');
      return getText(host + '/', { timeout: 9000 }).then(function (html) {
        if (html && /torrentlandia|tlandia/i.test(html)) return host;
        if (html && html.length > 500 && conf.baseUrl) return host; // host propio indicado por el usuario
        return probeHost(index + 1);
      });
    }

    return probeHost(0).then(function (host) {
      if (!host) {
        log('torrentlandia', 'sin dominio activo (el sitio no responde)');
        return [];
      }
      var searchUrl = host + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(queries[0]);
      return getText(searchUrl, { timeout: 14000 }).then(function (html) {
        if (!html) return [];
        var items = torrentlandiaParseListing(html, host);
        var filtered = uniqueBy(items, function (item) { return item.url; }).filter(function (candidate) {
          var score = Math.max(titleScore(candidate.title, info.title), titleScore(candidate.title, info.originalTitle));
          if (score < 0.5) return false;
          if (info.isTv && !candidate.isSeries) return false;
          if (!info.isTv && candidate.isSeries) return false;
          return true;
        }).slice(0, 5);

        return mapLimit(filtered, 2, function (candidate) {
          return getText(candidate.url, { timeout: 14000 }).then(function (detailHtml) {
            if (!detailHtml) return [];
            var links = torrentlandiaFindContent(detailHtml, host);
            if (info.isTv && info.season != null) {
              var matched = links.filter(function (entry) {
                return matchesEpisode(entry.label + ' ' + candidate.title, info.season, info.episode);
              });
              if (matched.length) links = matched;
            }
            return mapLimit(links.slice(0, 4), 2, function (entry) {
              var quality = parseQuality(entry.label + ' ' + candidate.title);
              if (/^magnet:/i.test(entry.link)) {
                return makeStream({
                  name: 'TorrentLandia',
                  title: (entry.label || candidate.title) + ' · ' + quality,
                  url: entry.link,
                  infoHash: infoHashFromMagnet(entry.link),
                  quality: quality,
                  size: candidate.size,
                  language: languageLabel(entry.label) || 'Castellano',
                  provider: 'torrentlandia',
                  type: 'torrent',
                  headers: { Referer: candidate.url }
                });
              }
              return torrentToMagnet(entry.link, { headers: { Referer: candidate.url, 'User-Agent': UA } })
                .then(function (torrent) {
                  if (!torrent) return null;
                  return makeStream({
                    name: 'TorrentLandia',
                    title: (entry.label || candidate.title) + ' · ' + quality,
                    url: torrent.magnet,
                    infoHash: torrent.infoHash,
                    quality: quality,
                    size: torrent.size || candidate.size,
                    language: languageLabel(entry.label) || 'Castellano',
                    provider: 'torrentlandia',
                    type: 'torrent',
                    headers: { Referer: candidate.url }
                  });
                });
            }).then(function (streams) { return streams.filter(Boolean); });
          });
        }).then(function (groups) {
          var all = [];
          for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
          return finalizeStreams('TorrentLandia', all, { max: parseInt(conf.maxResults, 10) || 6 });
        });
      });
    });
  }).catch(function (error) {
    log('torrentlandia', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'TorrentLandia' },
    { type: 'info', label: 'El dominio torrentlandia.site está caído desde 2026. Si el sitio reaparece con otro dominio, escríbelo aquí y el provider volverá a buscar sin actualizar el plugin.' },
    { type: 'text', key: 'baseUrl', label: 'Dominio actual (opcional)', placeholder: 'https://torrentlandia.site' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '6', options: [
      { value: '2', label: '2' }, { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }
    ] }
  ]);
}

module.exports = { getStreams: torrentlandiaGetStreams, onSettings: onSettings };
