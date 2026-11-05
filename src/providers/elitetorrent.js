/*__CORE__*/

/* ------------------------------------------------------------------
 * EliteTorrent · elitetorrent.com  (WordPress)
 *   búsqueda  GET /?s=<término>
 *   ficha     /peliculas/<slug>/  ·  /series/<slug>/
 *   descarga  acortame-esto.com/s.php?i=<base64 ×N + ROT13>
 *             (una variante devuelve .torrent y otra un magnet directo)
 * ------------------------------------------------------------------ */

var ELITE_HOSTS = [
  'https://www.elitetorrent.com',
  'https://elitetorrent.com',
  'https://www.elitetorrent.biz',
  'https://www.elitetorrent.net'
];

var ELITE_LANGS = [
  { re: /images\/espanol(?:-castellano)?\.png|espa[ñn]ol castellano/i, label: 'Castellano', skip: false },
  { re: /images\/latino\.png|espa[ñn]ol latino/i, label: 'Latino', skip: false },
  { re: /images\/vose\.png|ingles subtitulado|sub[ti]?tulad/i, label: 'VOSE', skip: false },
  { re: /images\/ingles\.png|audio original ingles/i, label: 'Inglés', skip: true }
];

function eliteLanguage(windowHtml) {
  for (var i = 0; i < ELITE_LANGS.length; i++) {
    if (ELITE_LANGS[i].re.test(windowHtml)) return ELITE_LANGS[i];
  }
  return { label: null, skip: false };
}

function eliteParseListing(html, host) {
  var items = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/(?:peliculas|series)\/[^"']+)["'][^>]*>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(match[1], host);
    if (!url || seen[url]) continue;
    var windowHtml = html.slice(Math.max(match.index - 420, 0), match.index + 900);

    var title = attrOf(match[0], 'title');
    title = title ? stripTags(title).replace(/^[“"'«]|[”"'»]$/g, '').trim() : null;
    if (!title || title.length < 2) {
      title = decodeURIComponent(url.replace(/\/$/, '').split('/').pop() || '')
        .replace(/-/g, ' ').replace(/\b\d{1,3}$/, '').trim();
    }
    if (!title || /^(inicio|peliculas|series|contacto|dmca)$/i.test(title)) continue;
    seen[url] = true;

    var language = eliteLanguage(windowHtml);
    var sizeMatch = /(\d+(?:[.,]\d+)?)\s*(GBs?|MBs?)/i.exec(windowHtml);
    items.push({
      url: url,
      title: title,
      quality: parseQuality(windowHtml),
      size: sizeMatch ? parseSize(sizeMatch[0]) : null,
      language: language.label,
      skip: language.skip,
      isSeries: /\/series\//i.test(url)
    });
  }
  return items;
}

function eliteSearch(host, term) {
  return getText(host + '/?s=' + encodeURIComponent(term), { timeout: 14000 })
    .then(function (html) {
      return html ? eliteParseListing(html, host) : [];
    });
}

function eliteDetailStreams(candidate, info) {
  return getText(candidate.url, { timeout: 14000 }).then(function (html) {
    if (!html) return [];

    var titleMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = titleMatch ? stripTags(titleMatch[1]).replace(/^Descargar\s+/i, '').replace(/\s+por torrent$/i, '').trim() : candidate.title;
    var declared = /Idioma\s*:?\s*(?:<\/?[^>]+>\s*)*([A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,30})/i.exec(html);
    var language = declared ? languageLabel(declared[1]) || candidate.language : candidate.language;
    var quality = candidate.quality || parseQuality(html.slice(0, 8000));
    var size = candidate.size || parseSize(html.slice(0, 8000));

    var encoded = [];
    var re = /(?:acortame-esto\.com|short-info\.link|enlacito\.[a-z]+)\/s\.php\?i=([A-Za-z0-9+/=]+)/gi;
    var match;
    while ((match = re.exec(html))) encoded.push(match[1]);
    // también puede venir el magnet o el .torrent en claro
    var direct = [];
    var directRe = /href=["'](magnet:\?[^"']+|https?:\/\/[^"']+\.torrent)["']/gi;
    while ((match = directRe.exec(html))) direct.push(decodeEntities(match[1]));

    var links = [];
    for (var i = 0; i < direct.length; i++) links.push(direct[i]);
    for (var j = 0; j < encoded.length; j++) {
      var decoded = decodeShortLink(encoded[j]);
      if (decoded) links.push(decoded);
    }
    links = uniqueBy(links, function (value) { return value; });

    return mapLimit(links, 3, function (link) {
      if (/^magnet:/i.test(link)) {
        return Promise.resolve(makeStream({
          name: 'EliteTorrent',
          title: pageTitle + ' · ' + quality,
          url: link,
          infoHash: infoHashFromMagnet(link),
          quality: quality,
          size: size,
          language: language,
          provider: 'elitetorrent',
          type: 'torrent',
          headers: { Referer: candidate.url }
        }));
      }
      return torrentToMagnet(link, { headers: { Referer: candidate.url, 'User-Agent': UA } })
        .then(function (torrent) {
          if (!torrent) return null;
          return makeStream({
            name: 'EliteTorrent',
            title: pageTitle + ' · ' + quality,
            url: torrent.magnet,
            infoHash: torrent.infoHash,
            quality: quality,
            size: torrent.size || size,
            language: language,
            provider: 'elitetorrent',
            type: 'torrent',
            headers: { Referer: candidate.url }
          });
        });
    }).then(function (streams) {
      return streams.filter(Boolean);
    });
  });
}

function eliteGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ includeVose: true, maxResults: '8' });

  return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
    var queries = searchQueries(info).slice(0, 2);
    if (!queries.length) return [];

    var cursor = 0;
    var found = [];

    function nextQuery() {
      if (cursor >= queries.length || found.length >= 8) {
        return Promise.resolve(found);
      }
      var term = queries[cursor++];
      var hostIndex = 0;

      function tryHost() {
        if (hostIndex >= ELITE_HOSTS.length) return nextQuery();
        var host = ELITE_HOSTS[hostIndex++].replace(/\/$/, '');
        return eliteSearch(host, term).then(function (items) {
          if (items.length) {
            found = found.concat(items.map(function (item) {
              item.host = host;
              return item;
            }));
            return found;
          }
          return tryHost();
        });
      }

      return tryHost();
    }

    return nextQuery().then(function (candidates) {
      var filtered = candidates.filter(function (candidate) {
        if (candidate.skip) return false;
        if (!conf.includeVose && candidate.language === 'VOSE') return false;
        if (info.isTv && !candidate.isSeries) return false;
        if (!info.isTv && candidate.isSeries) return false;
        var score = Math.max(titleScore(candidate.title, info.title), titleScore(candidate.title, info.originalTitle));
        if (score < 0.5) return false;
        if (info.isTv && !matchesEpisode(candidate.title, info.season, info.episode)) return false;
        return true;
      });

      filtered = uniqueBy(filtered, function (item) { return item.url; })
        .sort(function (a, b) { return qualityRank(a.quality) - qualityRank(b.quality); })
        .slice(0, 6);

      return mapLimit(filtered, 3, function (candidate) {
        return eliteDetailStreams(candidate, info).catch(function () { return []; });
      }).then(function (groups) {
        var all = [];
        for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
        return finalizeStreams('EliteTorrent', all, { max: parseInt(conf.maxResults, 10) || 8 });
      });
    });
  }).catch(function (error) {
    log('elitetorrent', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'EliteTorrent' },
    { type: 'toggle', key: 'includeVose', label: 'Incluir VOSE (inglés subtitulado)', defaultValue: true, description: 'Desactívalo si solo quieres castellano y latino.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] }
  ]);
}

module.exports = { getStreams: eliteGetStreams, onSettings: onSettings };
