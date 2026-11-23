/*__CORE__*/

/* FlixLatam: /search?s= → ficha → reproductor → HLS/MP4 directo. */
var FLIX_BASE = 'https://flixlatam.com';

function flixCards(html) {
  var out = [];
  var re = /<a\b[^>]*>([\s\S]{0,2200}?)<\/a>/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && out.length < 100) {
    var open = match[0].slice(0, match[0].indexOf('>') + 1);
    var href = attrOf(open, 'href');
    var url = publicHttpUrl(href, FLIX_BASE + '/');
    if (!url) continue;
    var parsed = new URL(url);
    if (parsed.hostname !== 'flixlatam.com' && parsed.hostname !== 'www.flixlatam.com') continue;
    var pathMatch = /^\/(pelicula|serie|anime)\/([^/]+)\/?$/i.exec(parsed.pathname);
    if (!pathMatch) continue;
    var img = /<img\b[^>]*>/i.exec(match[1]);
    var titleTag = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(match[1]);
    var title = (titleTag && stripTags(titleTag[1])) || attrOf(open, 'title') ||
      (img && attrOf(img[0], 'alt')) || stripTags(match[1]);
    title = String(title || '').replace(/^ver\s+/i, '').replace(/\s+online\s*$/i, '').trim();
    if (!title || title.length > 200) continue;
    // La implementación de URL de algunos runtimes no actualiza href al
    // asignar search/hash. Construir la URL limpia sin depender de setters.
    out.push({ url: parsed.origin + parsed.pathname, title: title, isMovie: pathMatch[1].toLowerCase() === 'pelicula' });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

function flixScore(candidate, info) {
  var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
  var score = 0;
  for (var i = 0; i < titles.length; i++) score = Math.max(score, titleScore(candidate.title, titles[i]));
  return score;
}

function flixSearch(info) {
  var queries = searchQueries(info).slice(0, 3);
  var index = 0;
  var items = [];
  function next() {
    if (index >= queries.length || items.some(function (item) { return item.score >= 0.95; })) return Promise.resolve(items);
    var searchUrl = FLIX_BASE + '/search?s=' + encodeURIComponent(queries[index++]);
    return getText(searchUrl, { timeout: 7000, retries: 0 }).then(function (html) {
      var cards = flixCards(html);
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].isMovie !== !info.isTv || !sameCatalogTitle(cards[i].title, info, false)) continue;
        cards[i].score = flixScore(cards[i], info);
        items.push(cards[i]);
      }
      return next();
    });
  }
  return next().then(function () {
    return uniqueBy(items, function (item) { return item.url; }).sort(function (a, b) { return b.score - a.score; });
  });
}

function flixlatamGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 || !Number.isInteger(info.episode) || info.episode < 1)) return [];
    return flixSearch(info).then(function (candidates) {
      return mapLimit(candidates.slice(0, 2), 2, function (candidate) {
        var page = candidate.url.replace(/\/$/, '');
        if (info.isTv) page += '/temporada/' + info.season + '/capitulo/' + info.episode;
        return resolveDirectPlayers([{ url: page, referer: FLIX_BASE + '/' }], { maxDepth: 4, maxPages: 10 });
      }).then(function (groups) {
        var blocked = [];
        for (var b = 0; b < groups.length; b++) {
          if (groups[b] && groups[b].blocked && groups[b].blocked.length) blocked = blocked.concat(groups[b].blocked.slice(0, 3));
        }
        if (blocked.length) log('flixlatam: bloqueo del sitio', JSON.stringify(blocked));
        var streams = [];
        for (var i = 0; i < groups.length; i++) {
          var results = groups[i] || [];
          for (var j = 0; j < results.length; j++) {
            var item = results[j];
            var title = info.title + (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
              (item.name ? ' · ' + item.name : '');
            streams.push(makeStream({ name: 'FlixLatam', title: title, provider: 'flixlatam', url: item.url,
              quality: parseQuality(title + ' ' + item.url), language: item.language, headers: item.headers, subtitles: item.subtitles }));
          }
        }
        return finalizeStreams('FlixLatam', streams, { max: conf.maxResults });
      });
    });
  }).catch(function (error) { log('flixlatam', error && error.message || error); return []; });
}


/* El cliente puede enviar IMDb, TMDB, TVDB o un ID de anime (kitsu:, mal:,
 * anilist:, anidb:). normalizeContentId + resolveRequestMedia aceptan todas
 * esas formas; antes se descartaban y no se buscaba nada. */
function requestMedia(rawId, mediaType, season, episode) {
  var parsed = normalizeContentId(mediaType, rawId);
  if (!parsed) return Promise.resolve(null);
  // El episodio que cuenta es el del cliente, no el que se deduzca del ID.
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

/** Solo metadatos: lo usa el endpoint /meta del addon; no busca fuentes. */
function flixlatamResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'FlixLatam' },
    { type: 'info', label: 'Solo se devuelven enlaces HLS/MP4 directos. Los servidores con CAPTCHA o medios protegidos pueden no estar disponibles.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] }
  ]);
}
module.exports = { getStreams: flixlatamGetStreams, resolveMeta: flixlatamResolveMeta, onSettings: onSettings };
