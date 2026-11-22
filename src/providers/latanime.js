/*__CORE__*/

/* Latanime: /buscar?q= → ficha → episodio → data-player Base64 → HLS/MP4. */
var LAT_BASE = 'https://latanime.org';

function latSeason(text) {
  var value = String(text || '').replace(/[-_]/g, ' ');
  var match = /\b(?:temporada|season|temp|s)\s*0*(\d{1,2})\b/i.exec(value) ||
    /\b0*(\d{1,2})\s*[ªºa]?\s*(?:temporada|season)\b/i.exec(value);
  return match ? parseInt(match[1], 10) : null;
}

function latCards(html) {
  var out = [];
  var re = /<a\b[^>]*>([\s\S]{0,3000}?)<\/a>/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && out.length < 100) {
    var open = match[0].slice(0, match[0].indexOf('>') + 1);
    var url = publicHttpUrl(attrOf(open, 'href'), LAT_BASE + '/');
    if (!url) continue;
    var parsed = new URL(url);
    if (parsed.hostname !== 'latanime.org' && parsed.hostname !== 'www.latanime.org') continue;
    var path = /^\/anime\/([^/]+)\/?$/i.exec(parsed.pathname);
    if (!path) continue;
    // En resultados, el título puede estar en <strong>/<b>, seguido de
    // etiquetas de idioma, tipo y año; no comparar todo ese texto con TMDB.
    var heading = /<(?:h[1-4]|strong|b)\b[^>]*>([\s\S]*?)<\/(?:h[1-4]|strong|b)>/i.exec(match[1]);
    var image = /<img\b[^>]*>/i.exec(match[1]);
    var title = (heading && stripTags(heading[1])) || attrOf(open, 'title') ||
      (image && attrOf(image[0], 'alt')) || stripTags(match[1]);
    title = String(title || '').trim();
    if (!title || title.length > 200) continue;
    var text = stripTags(match[1]);
    out.push({ url: parsed.origin + parsed.pathname, slug: path[1], title: title,
      season: latSeason(title + ' ' + path[1]),
      isMovie: /\bpel[ií]cula\b/i.test(text), language: languageLabel(title + ' ' + text) });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

function latScore(candidate, info) {
  var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
  var score = 0;
  for (var i = 0; i < titles.length; i++) score = Math.max(score, titleScore(candidate.title, titles[i]));
  return score;
}

function latSearch(info) {
  var queries = searchQueries(info).slice(0, 3);
  var index = 0;
  var found = [];
  function next() {
    if (index >= queries.length || found.some(function (item) { return item.score >= 0.95 && (!info.isTv || info.season === 1 || item.season === info.season); })) return Promise.resolve(found);
    var url = LAT_BASE + '/buscar?q=' + encodeURIComponent(queries[index++]);
    return getText(url, { timeout: 7000, retries: 0 }).then(function (html) {
      var cards = latCards(html);
      for (var i = 0; i < cards.length; i++) {
        var item = cards[i];
        if (info.isTv && item.isMovie) continue;
        if (!info.isTv && !item.isMovie) continue;
        if (info.isTv && item.season != null && item.season !== info.season) continue;
        if (!sameCatalogTitle(item.title, info, info.isTv)) continue;
        item.score = latScore(item, info);
        if (item.score < 0.76) continue;
        if (info.isTv && item.season === info.season) item.score += 0.08;
        found.push(item);
      }
      return next();
    });
  }
  return next().then(function () {
    return uniqueBy(found, function (item) { return item.url; }).sort(function (a, b) { return b.score - a.score; });
  });
}

function latAbsoluteEpisode(info) {
  var offset = 0;
  for (var season = 1; season < info.season; season++) {
    var record = (info.seasons || []).filter(function (s) { return Number(s.season_number) === season; })[0];
    var count = record && Number(record.episode_count);
    if (!count || count < 1) return null;
    offset += count;
  }
  return offset + info.episode;
}

function latEpisodeUrl(html, candidate, info) {
  var wanted = info.isTv ? info.episode : 1;
  if (info.isTv && info.season > 1 && candidate.season == null) wanted = latAbsoluteEpisode(info);
  if (!wanted) return null;
  var re = /<a\b[^>]*>/gi;
  var match;
  while ((match = re.exec(String(html || '')))) {
    var href = publicHttpUrl(attrOf(match[0], 'href'), candidate.url);
    if (!href) continue;
    var parsed = new URL(href);
    var expected = '/ver/' + candidate.slug + '-episodio-' + wanted;
    if ((parsed.hostname === 'latanime.org' || parsed.hostname === 'www.latanime.org') &&
        parsed.pathname.replace(/\/$/, '') === expected) return href;
  }
  return null;
}

function latanimeGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });
  return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 || !Number.isInteger(info.episode) || info.episode < 1)) return [];
    return latSearch(info).then(function (candidates) {
      return mapLimit(candidates.slice(0, 4), 2, function (candidate) {
        return getText(candidate.url, { timeout: 7000, retries: 0 }).then(function (html) {
          var episodeUrl = latEpisodeUrl(html, candidate, info);
          if (!episodeUrl) return [];
          return resolveDirectPlayers([{ url: episodeUrl, referer: candidate.url, language: candidate.language }], { maxDepth: 3, maxPages: 9 });
        });
      }).then(function (groups) {
        var streams = [];
        for (var i = 0; i < groups.length; i++) {
          var results = groups[i] || [];
          for (var j = 0; j < results.length; j++) {
            var item = results[j];
            var title = info.title + (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
              (item.name ? ' · ' + item.name : '');
            streams.push(makeStream({ name: 'Latanime', title: title, provider: 'latanime', url: item.url,
              quality: parseQuality(title + ' ' + item.url), language: item.language, headers: item.headers, subtitles: item.subtitles }));
          }
        }
        return finalizeStreams('Latanime', streams, { max: conf.maxResults });
      });
    });
  }).catch(function (error) { log('latanime', error && error.message || error); return []; });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'Latanime' },
    { type: 'info', label: 'Solo HLS/MP4. Cuando el sitio numera de forma absoluta, se necesitan los recuentos de temporadas de TMDB.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] }
  ]);
}
module.exports = { getStreams: latanimeGetStreams, onSettings: onSettings };
