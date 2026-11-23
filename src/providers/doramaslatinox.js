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
 *  - Todo el catálogo está en español latino; la calidad viene de la ficha. */

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
    out.push({ url: url, title: title, isMovie: /\/peliculas\//i.test(url), year: parseYear(block) });
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
function dlxResolve(page, info) {
  var options = dlxOptions(page.html);
  if (!options.length) return [];
  return mapLimit(options, 4, function (option) {
    return dlxPlayer(option, page.url).then(function (entry) {
      if (!entry) return [];
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
