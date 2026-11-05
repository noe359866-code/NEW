/* ------------------------------------------------------------------
 * Nébula Scrapers · core/donengine
 * Motor compartido por DonTorrent y MejorTorrent (mismo software).
 *
 * Flujo verificado contra los sitios (noviembre 2026):
 *   búsqueda   POST /buscar   valor=<término>&Buscar=Buscar&p=1
 *   ficha      /pelicula/<id>/<slug>  ·  /serie/<id>/<id>/<slug>
 *   descarga   <a class="protected-download" data-content-id data-tabla>
 *              → POST /api_validate_pow.php (generate) → PoW SHA-256 (3 ceros)
 *              → POST /api_validate_pow.php (validate) → download_url (.torrent)
 *              → infohash BTIH → magnet
 * ------------------------------------------------------------------ */

var POW_MAX_ATTEMPTS = 4000000;

function solveProofOfWork(challenge, difficulty) {
  var zeros = new Array((difficulty || 3) + 1).join('0');
  for (var nonce = 0; nonce < POW_MAX_ATTEMPTS; nonce++) {
    if (sha256Hex(String(challenge) + nonce).slice(0, zeros.length) === zeros) return nonce;
  }
  return null;
}

function collectProtectedAnchors(html) {
  var anchors = [];
  var re = /<a\b[^>]*>/gi;
  var match;
  while ((match = re.exec(html))) {
    var tag = match[0];
    var classes = attrOf(tag, 'class') || '';
    var contentId = attrOf(tag, 'data-content-id');
    var tabla = attrOf(tag, 'data-tabla');
    var href = attrOf(tag, 'href');
    if (contentId && tabla) {
      anchors.push({ kind: 'pow', contentId: contentId, tabla: tabla });
    } else if (/protected-download/.test(classes) && contentId && tabla) {
      anchors.push({ kind: 'pow', contentId: contentId, tabla: tabla });
    } else if (href && /\.torrent(\?|$)/i.test(href)) {
      anchors.push({ kind: 'direct', href: href });
    } else if (href && /\bdownload\b/i.test(tag) && /torrent|descarg/i.test(tag)) {
      anchors.push({ kind: 'direct', href: href });
    }
  }
  return anchors;
}

function parseDonSearch(html, host) {
  var results = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/(?:pelicula|serie|documental)\/[^"']+)["'][^>]*>([\s\S]{0,220}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(match[1], host);
    var title = stripTags(match[2]).replace(/^Descargar\s+/i, '').trim();
    if (!url || !title || title.length < 2 || seen[url]) continue;
    if (/^(ver|descargar|inicio|siguenos|contacto)$/i.test(title)) continue;
    seen[url] = true;
    var tail = html.slice(match.index, match.index + 900);
    var qualityMatch = /\(([A-Za-z0-9][^)]{1,24})\)/.exec(tail);
    results.push({
      url: url,
      title: title,
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : parseQuality(title + ' ' + url),
      isSeries: /\/serie\//i.test(url)
    });
  }
  return results;
}

function donResolveProtected(host, contentId, tabla, referer) {
  var apiUrl = host + '/api_validate_pow.php';
  var headers = { Referer: referer, Origin: host };

  return postJson(apiUrl, { action: 'generate', content_id: parseInt(contentId, 10), tabla: tabla }, { headers: headers })
    .then(function (res) {
      if (!res.ok || !res.text) return null;
      var parsed = null;
      try { parsed = JSON.parse(res.text); } catch (e) { return null; }
      if (!parsed || !parsed.success || !parsed.challenge) return null;
      var difficulty = parseInt(parsed.difficulty, 10);
      var nonce = solveProofOfWork(parsed.challenge, isFinite(difficulty) ? difficulty : 3);
      if (nonce == null) return null;
      return postJson(apiUrl, { action: 'validate', challenge: parsed.challenge, nonce: nonce }, { headers: headers });
    })
    .then(function (res) {
      if (!res || !res.ok || !res.text) return null;
      var parsed = null;
      try { parsed = JSON.parse(res.text); } catch (e) { return null; }
      if (!parsed || !parsed.success || !parsed.download_url) return null;
      var url = String(parsed.download_url).replace(/\\\//g, '/');
      return absoluteUrl(url, host);
    });
}

function donParseDetail(html, host) {
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  var title = h1 ? stripTags(h1[1]) : null;
  var yearMatch = /(?:A[ñn]o|Año)\s*:?\s*<?[^>]*>?\s*((?:19|20)\d{2})/i.exec(html);
  var formatMatch = /Formato\s*:?\s*(?:<\/?[^>]+>\s*)*([A-Za-z0-9 .\-]{2,30})/i.exec(html);
  return {
    title: title,
    year: yearMatch ? parseInt(yearMatch[1], 10) : null,
    quality: formatMatch ? parseQuality(formatMatch[1]) : parseQuality(html.slice(0, 4000))
  };
}

/** Filas de episodios: texto con 1x01 / Cap. 1-2 junto a su ancla protegida. */
function donParseEpisodeRows(html, host, pageUrl) {
  var rows = [];
  var chunks = html.split(/<tr\b/i);
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var label = stripTags(chunk).slice(0, 160);
    var anchors = collectProtectedAnchors(chunk);
    if (!anchors.length) continue;
    for (var j = 0; j < anchors.length; j++) {
      rows.push({
        label: label,
        anchor: anchors[j],
        pageUrl: pageUrl,
        quality: parseQuality(chunk),
        size: parseSize(label)
      });
    }
  }
  return rows;
}

function createDonEngine(config) {
  var label = config.label;
  var providerId = config.id;
  var hosts = config.hosts || [];
  var maxResults = config.maxResults || 8;
  var qualityPreference = config.qualityPreference || '';

  function searchHost(host, term) {
    return postForm(host + '/buscar', { valor: term, Buscar: 'Buscar', p: '1' }, {
      referer: host + '/',
      origin: host
    }).then(function (res) {
      if (!res.ok || !res.text) return { host: host, results: [] };
      return { host: host, results: parseDonSearch(res.text, host) };
    });
  }

  function searchAllHosts(term) {
    var index = 0;
    function attempt() {
      if (index >= hosts.length) return Promise.resolve([]);
      var host = hosts[index++].replace(/\/$/, '');
      return searchHost(host, term).then(function (found) {
        if (found.results.length) return found;
        return attempt();
      });
    }
    return attempt();
  }

  function streamsFromDetail(candidate, info) {
    return getText(candidate.url, { timeout: 14000 }).then(function (html) {
      if (!html) return [];
      var detail = donParseDetail(html, candidate.url);
      var quality = detail.quality || candidate.quality || 'SD';
      var host = candidate.url.replace(/^(https?:\/\/[^/]+).*$/i, '$1');

      var targets = [];
      if (info.isTv && info.season != null) {
        var rows = donParseEpisodeRows(html, host, candidate.url);
        for (var i = 0; i < rows.length; i++) {
          var rowQuality = rows[i].quality !== 'SD' ? rows[i].quality : quality;
          if (matchesEpisode(rows[i].label, info.season, info.episode)) {
            targets.push({ anchor: rows[i].anchor, label: rows[i].label, quality: rowQuality, size: rows[i].size });
          }
        }
        if (!targets.length) {
          // la ficha puede ser un pack: se ofrece con aviso de episodios
          var packAnchors = collectProtectedAnchors(html);
          for (var p = 0; p < packAnchors.length && p < 2; p++) {
            targets.push({ anchor: packAnchors[p], label: seasonEpisodeLabel(info.season, info.episode), quality: quality, size: null });
          }
        }
      } else {
        var anchors = collectProtectedAnchors(html);
        for (var a = 0; a < anchors.length && a < 4; a++) {
          targets.push({ anchor: anchors[a], label: null, quality: quality, size: parseSize(html.slice(0, 6000)) });
        }
      }

      return mapLimit(targets, 3, function (target) {
        var promise;
        if (target.anchor.kind === 'direct') {
          promise = Promise.resolve(absoluteUrl(target.anchor.href, candidate.url));
        } else {
          promise = donResolveProtected(host, target.anchor.contentId, target.anchor.tabla, candidate.url);
        }
        return promise.then(function (downloadUrl) {
          if (!downloadUrl) return null;
          return torrentToMagnet(downloadUrl, {
            headers: { Referer: candidate.url, 'User-Agent': UA }
          }).then(function (torrent) {
            if (!torrent) return null;
            var suffix = target.label ? ' · ' + String(target.label).slice(0, 60) : '';
            return makeStream({
              name: label,
              title: (detail.title || candidate.title) + suffix + ' · ' + (target.quality || quality),
              url: torrent.magnet,
              infoHash: torrent.infoHash,
              quality: target.quality || quality,
              size: target.size || torrent.size,
              provider: providerId,
              type: 'torrent',
              language: 'Castellano',
              headers: { Referer: candidate.url }
            });
          });
        }).catch(function () { return null; });
      }).then(function (streams) {
        return streams.filter(Boolean);
      });
    });
  }

  function getStreams(tmdbId, mediaType, season, episode) {
    var conf = settings({ maxResults: maxResults, qualityPreference: qualityPreference });

    return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
      var queries = searchQueries(info).slice(0, 2);
      if (!queries.length) return [];

      var collection = [];
      var cursor = 0;

      function nextQuery() {
        if (cursor >= queries.length) return Promise.resolve(collection);
        var term = queries[cursor++];
        return searchAllHosts(term).then(function (found) {
          if (found && found.results && found.results.length) {
            collection = collection.concat(found.results.map(function (item) {
              item.host = found.host;
              return item;
            }));
            if (collection.length >= 6) return collection;
          }
          return nextQuery();
        });
      }

      return nextQuery().then(function (candidates) {
        var filtered = uniqueBy(candidates, function (item) { return item.url; }).filter(function (candidate) {
          if (info.isTv && !candidate.isSeries) return false;
          if (!info.isTv && candidate.isSeries) return false;
          if (titleScore(candidate.title, info.title) < 0.5 && titleScore(candidate.title, info.originalTitle) < 0.5) return false;
          if (info.year && parseYear(candidate.title) && Math.abs(parseYear(candidate.title) - info.year) > 1) return false;
          return true;
        });

        var limit = parseInt(conf.maxResults, 10);
        if (!isFinite(limit) || limit <= 0) limit = maxResults;
        filtered = filtered.slice(0, Math.min(limit, 10));

        if (!filtered.length) return [];
        return mapLimit(filtered, 3, function (candidate) {
          return streamsFromDetail(candidate, info).catch(function () { return []; });
        }).then(function (groups) {
          var all = [];
          for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
          return finalizeStreams(label, all, { max: limit });
        });
      });
    }).catch(function (error) {
      log(providerId, 'error', error && error.message ? error.message : error);
      return [];
    });
  }

  return {
    id: providerId,
    label: label,
    getStreams: getStreams,
    // exportados para pruebas
    _internal: {
      parseDonSearch: parseDonSearch,
      collectProtectedAnchors: collectProtectedAnchors,
      solveProofOfWork: solveProofOfWork,
      parseDonEpisodeRows: donParseEpisodeRows
    }
  };
}
