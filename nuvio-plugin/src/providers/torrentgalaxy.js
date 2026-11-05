/*__CORE__*/

/* ------------------------------------------------------------------
 * TorrentGalaxy · en.torrentgalaxy-official.is
 * Catálogo en inglés con los magnets abiertos y sin cuenta.
 *
 *   búsqueda  GET /movies?keyword=<término>   ·  GET /series?keyword=<término>
 *             (el buscador del sitio también acepta ?search= y /search/?q=;
 *              el provider los usa como respaldo)
 *   ficha     /movies/<slug>-<año>            ·  /series/<slug>-<año>
 *             /movie/<tmdbId>                 ·  /tv/<tmdbId>   (atajo directo)
 *   fuentes   tabla 🧲 Torrents de la ficha: cada fila trae calidad,
 *             tamaño, seeders y un magnet (o un .torrent) por release.
 *             Además el sitio monta un reproductor VidSrc con el tmdbId.
 *
 * El sitio se sirve detrás de Cloudflare: cuando aparece el desafío se
 * detecta el HTML de "Just a moment" / "Performing security verification"
 * y se devuelve [] (nunca una excepción), igual que hace WolfMax4K con
 * Turnstile. El idioma del catálogo es inglés: las fuentes se etiquetan
 * como "Inglés".
 * ------------------------------------------------------------------ */

var TGX_HOSTS = [
  'https://en.torrentgalaxy-official.is',
  'https://torrentgalaxy-official.is'
];

var TGX_CHALLENGE = /just a moment|performing security verification|cf-chl|cdn-cgi\/challenge|attention required|enable javascript and cookies/i;
var TGX_EMPTY = /nothing found|no results|0 (?:of|torrents)|sin resultados|no torrents/i;

function tgxIsChallenge(html) {
  if (!html) return true;
  return TGX_CHALLENGE.test(String(html).slice(0, 4000));
}

function tgxLanguage(text) {
  var s = String(text == null ? '' : text);
  if (/dual[\s-]?audio|multi/i.test(s)) return 'Dual';
  if (/spanish|castellano|espa[ñn]ol/i.test(s)) return 'Castellano';
  if (/latino/i.test(s)) return 'Latino';
  if (/subbed|subtitle|vostfr|vose/i.test(s)) return 'Subtítulos';
  return 'Inglés';
}

/** Slugs que usa el sitio: "the-mongoose-2026", "reacher-2022". */
function tgxSlug(title, year) {
  var base = norm(title).replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
  if (!base) return null;
  return year ? base + '-' + year : base;
}

/** Filas de la tabla de resultados / de la ficha. */
function tgxParseRows(html, baseUrl) {
  var items = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/(?:movies|movie|series|tv)\/[^"']+)["'][^>]*>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(decodeEntities(match[1]), baseUrl);
    if (!url || seen[url]) continue;
    // la propia ficha enlaza a /movies/<slug> desde el menú: se exige slug con año o id
    if (!/\/(?:movies|series)\/[a-z0-9][a-z0-9-]*(?:-(?:19|20)\d{2})?$/i.test(url) &&
      !/\/(?:movie|tv)\/\d+$/i.test(url)) continue;
    var windowHtml = html.slice(match.index, match.index + 900);
    var title = stripTags(match[1] && /<\/a>/.test(windowHtml) ? windowHtml.split(/<\/a>/)[0] : '') || null;
    title = title ? title.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null;
    // en las tarjetas el título va fuera del ancla: se toma del bloque contiguo
    if (!title || title.length < 2) {
      var heading = /<h[1-4][^>]*>([\s\S]{1,160}?)<\/h[1-4]>/i.exec(windowHtml);
      title = heading ? stripTags(heading[1]) : attrOf(match[0], 'title');
    }
    if (!title || title.length < 2) continue;
    if (/^(browse|movies|tv shows|home|popular|top rated|genres?)$/i.test(title)) continue;
    seen[url] = true;

    var qualityMatch = /(2160p|4k|1080p|720p|480p|hdtv|web-?dl|webrip|bluray|bdrip|hdrip|dvdrip|cam|ts)/i.exec(windowHtml);
    var sizeMatch = /(\d+(?:[.,]\d+)?\s*(?:GB|MB|TB))/i.exec(windowHtml);
    var seedMatch = /(?:seeders?|seeds?|👤|⬆)\D{0,8}(\d{1,6})/i.exec(windowHtml);
    items.push({
      url: url,
      title: title,
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : parseQuality(title + ' ' + url),
      size: sizeMatch ? parseSize(sizeMatch[1]) : null,
      seeders: seedMatch ? parseInt(seedMatch[1], 10) : null,
      year: parseYear(title + ' ' + url),
      isSeries: /\/(?:series|tv)\//i.test(url)
    });
  }
  return items;
}

function tgxSearch(host, term, wantSeries) {
  var path = wantSeries ? '/series' : '/movies';
  var url = host + path + '?keyword=' + encodeURIComponent(term);
  return getText(url, { timeout: 15000 }).then(function (html) {
    if (tgxIsChallenge(html)) {
      log('torrentgalaxy', 'desafío de Cloudflare en ' + url);
      return [];
    }
    var items = tgxParseRows(html, host);
    if (items.length) return items;
    // respaldo: el buscador global
    return getText(host + '/search/?q=' + encodeURIComponent(term), { timeout: 15000 })
      .then(function (searchHtml) {
        if (tgxIsChallenge(searchHtml)) return [];
        return tgxParseRows(searchHtml, host);
      });
  });
}

/** Filas 🧲 de la ficha: magnet/.torrent + calidad + tamaño + seeders. */
function tgxParseTorrentRows(html, baseUrl) {
  var rows = [];
  var chunks = String(html).split(/<tr\b/i);
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var text = stripTags(chunk).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    var magnetMatch = /href=["'](magnet:\?[^"']+)["']/i.exec(chunk);
    var torrentMatch = /href=["']([^"']+\.torrent(?:\?[^"']*)?)["']/i.exec(chunk);
    var hashMatch = /(?:data-(?:hash|infohash)=["']|btih:)([a-f0-9]{40})/i.exec(chunk);
    var link = magnetMatch ? decodeEntities(magnetMatch[1])
      : torrentMatch ? absoluteUrl(decodeEntities(torrentMatch[1]), baseUrl)
        : hashMatch ? buildMagnet(hashMatch[1].toLowerCase()) : null;
    if (!link) continue;

    var qualityMatch = /(2160p|4k|1080p|720p|480p|hdtv|web-?dl|webrip|bluray|bdrip|hdrip|dvdrip|cam|ts)/i.exec(text);
    var sizeMatch = /(\d+(?:[.,]\d+)?\s*(?:GB|MB|TB))/i.exec(text);
    // seeders: último número suelto de la fila (detrás del tamaño y de los iconos 🧲)
    var withoutQuality = text
      .replace(/(\d+(?:[.,]\d+)?)\s*(?:GB|MB|TB)/gi, ' ')
      .replace(/(?:2160p|4k|1080p|720p|480p|hdtv|web-?dl|webrip|bluray|bdrip|hdrip|dvdrip|cam|ts)/gi, ' ');
    var seedMatch = /(?:^|[^\d])(\d{1,6})(?![\d])/g;
    var seeders = null;
    var seedScan;
    while ((seedScan = seedMatch.exec(withoutQuality))) {
      seeders = parseInt(seedScan[1], 10);
    }
    rows.push({
      link: link,
      label: text.slice(0, 140),
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : parseQuality(text),
      size: sizeMatch ? parseSize(sizeMatch[1]) : null,
      seeders: seeders
    });
  }
  return rows;
}

/** Reproductor VidSrc que el sitio monta con el tmdbId (fuente http de respaldo). */
function tgxVidsrcStream(tmdbId, info) {
  var id = String(tmdbId == null ? '' : tmdbId).trim();
  if (!/^\d+$/.test(id)) return null;
  if (info.isTv && info.season != null && info.episode != null) {
    return {
      url: 'https://vidsrc.to/embed/tv/' + id + '/' + info.season + '/' + info.episode,
      quality: 'SD',
      title: seasonEpisodeLabel(info.season, info.episode) + ' · VidSrc'
    };
  }
  if (info.isTv) return null;
  return {
    url: 'https://vidsrc.to/embed/movie/' + id,
    quality: 'SD',
    title: 'VidSrc'
  };
}

function tgxStreamsFromPage(candidate, info) {
  return getText(candidate.url, { timeout: 16000 }).then(function (html) {
    if (!html || tgxIsChallenge(html)) return [];

    var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = h1 ? stripTags(h1[1]) : candidate.title;
    var language = tgxLanguage(pageTitle + ' ' + html.slice(0, 3000));
    var rows = tgxParseTorrentRows(html, candidate.url);

    if (info.isTv && info.season != null && rows.length) {
      var matching = rows.filter(function (row) {
        return matchesEpisode(row.label, info.season, info.episode);
      });
      // si la ficha no etiqueta episodios, se ofrecen las filas tal cual
      if (matching.length) rows = matching;
    }

    var prefix = info.isTv && info.season != null
      ? seasonEpisodeLabel(info.season, info.episode) + ' · '
      : '';

    var streams = rows.slice(0, 8).map(function (row) {
      var quality = row.quality || candidate.quality || 'SD';
      var isMagnet = /^magnet:/i.test(row.link);
      var infoHash = isMagnet ? infoHashFromMagnet(row.link) : null;
      if (!isMagnet) return null;
      return makeStream({
        name: 'TorrentGalaxy',
        title: pageTitle + ' · ' + prefix + quality,
        url: row.link,
        infoHash: infoHash,
        quality: quality,
        size: row.size || candidate.size,
        seeders: row.seeders,
        language: language,
        provider: 'torrentgalaxy',
        type: 'torrent',
        headers: { Referer: candidate.url }
      });
    }).filter(Boolean);

    // enlaces .torrent sueltos (algunas fichas no montan el magnet)
    if (!streams.length) {
      var links = findDownloadLinks(html, candidate.url).filter(function (link) {
        return !/^https?:\/\/(?:[^/]*\.)?(?:sharethis|facebook|twitter|reddit|whatsapp|telegram)\./i.test(link);
      }).slice(0, 3);
      return mapLimit(links, 2, function (link) {
        return resolveTorrentOrMagnet(link, { headers: { Referer: candidate.url, 'User-Agent': UA } })
          .then(function (torrent) {
            if (!torrent) return null;
            return makeStream({
              name: 'TorrentGalaxy',
              title: pageTitle + ' · ' + prefix + (candidate.quality || 'SD'),
              url: torrent.magnet,
              infoHash: torrent.infoHash,
              quality: candidate.quality || 'SD',
              size: torrent.size || candidate.size,
              language: language,
              provider: 'torrentgalaxy',
              type: 'torrent',
              headers: { Referer: candidate.url }
            });
          });
      }).then(function (list) { return list.filter(Boolean); });
    }

    return streams;
  });
}

function tgxGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8', includeVidsrc: 'true' });

  return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
    var limit = parseInt(conf.maxResults, 10);
    if (!isFinite(limit) || limit <= 0) limit = 8;

    var findStreams = function () {
      var queries = searchQueries(info).slice(0, 2);
      if (!queries.length) return Promise.resolve([]);

      var cursor = 0;
      var found = [];

      function nextQuery() {
        if (cursor >= queries.length || found.length >= 8) return Promise.resolve(found);
        var term = queries[cursor++];
        var hostIndex = 0;

        function tryHost() {
          if (hostIndex >= TGX_HOSTS.length) return nextQuery();
          var host = TGX_HOSTS[hostIndex++].replace(/\/$/, '');
          return tgxSearch(host, term, info.isTv)
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
          if (info.isTv !== !!candidate.isSeries) return false;
          var score = Math.max(
            titleScore(candidate.title, info.title),
            titleScore(candidate.title, info.originalTitle)
          );
          if (score < 0.5) return false;
          if (info.year && candidate.year && Math.abs(candidate.year - info.year) > 1) return false;
          return true;
        });

        // fallback directo por id de TMDB, que el sitio entiende como /movie/<id>
        if (!filtered.length) {
          var direct = info.tmdbId
            ? [{ url: TGX_HOSTS[0] + (info.isTv ? '/tv/' : '/movie/') + info.tmdbId, title: info.title, quality: 'SD', size: null, isSeries: info.isTv }]
            : [];
          filtered = direct;
        }

        filtered = filtered.slice(0, Math.min(limit, 6));
        if (!filtered.length) return [];

        return mapLimit(filtered, 2, function (candidate) {
          return tgxStreamsFromPage(candidate, info).catch(function () { return []; });
        }).then(function (groups) {
          var all = [];
          for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
          return finalizeStreams('TorrentGalaxy', all, { max: limit });
        });
      });
    };

    return findStreams().then(function (streams) {
      if (streams.length) return streams;
      // respaldo http: el reproductor VidSrc que monta la propia ficha
      if (conf.includeVidsrc === 'false' || conf.includeVidsrc === false) return streams;
      // sin metadatos resueltos no se inventa una fuente
      if (!info.title) return streams;
      var vidsrc = tgxVidsrcStream(info.tmdbId || tmdbId, info);
      if (!vidsrc) return streams;
      return [makeStream({
        name: 'TorrentGalaxy',
        title: vidsrc.title,
        url: vidsrc.url,
        quality: vidsrc.quality,
        language: 'Inglés',
        provider: 'torrentgalaxy',
        type: 'http',
        headers: { Referer: TGX_HOSTS[0] + '/' }
      })];
    });
  }).catch(function (error) {
    log('torrentgalaxy', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'TorrentGalaxy' },
    { type: 'info', label: 'Catálogo en inglés. Los magnets de la ficha se entregan tal cual (sin descargar el .torrent). Si Cloudflare muestra el desafío, el provider devuelve una lista vacía sin fallar.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] },
    { type: 'toggle', key: 'includeVidsrc', label: 'Incluir reproductor VidSrc', defaultValue: true, description: 'Fuente HTTP de respaldo cuando el sitio no devuelve magnets utilizables.' }
  ]);
}

module.exports = { getStreams: tgxGetStreams, onSettings: onSettings };
