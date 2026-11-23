/*__CORE__*/

/* k-drama.in (KatDrama): /search?q= → /detail/{tv|movie}/<slug>-<tmdb>
 * → /watch/{tv|movie}/<slug>-<tmdb>[-episode-<n>] → botones de servidor.
 *
 * Lo reconocido con tools/probe-sites.js (2026-11):
 *  - Las fichas se identifican por el id de TMDB al final del slug
 *    (`/detail/tv/vincenzo-117376`). Con ese id, la URL de reproducción se
 *    arma sin adivinar: /watch/tv/<slug>-<id>-episode-<n>. Si el slug no
 *    coincide con el título, el servidor redirige a la URL canónica.
 *  - Cada botón de servidor publica su URL en `onclick="switchServer('id',
 *    'url', ...)"`. Unos son embeds de terceros y otros propios
 *    (/vid2.php, /mx1.php, /tubi2.php, /yoy4.php, /kk2.php).
 *  - El player propio abre a su vez un iframe. Los embeds se recorren con
 *    resolveDirectPlayers, que solo acepta documentos y enlaces HLS/MP4. */

var KD_BASE = 'https://k-drama.in';

/** 117376 de /detail/tv/vincenzo-117376 (el último grupo numérico del slug). */
function kdTmdbId(slug) {
  var match = /-(\d{3,9})$/.exec(String(slug || ''));
  return match ? match[1] : null;
}

function kdCards(html, kind) {
  var out = [];
  var re = new RegExp('<a\\b[^>]*href=["\']/detail/(' + kind + ')/([^"\'#?]+)["\'][^>]*>', 'gi');
  var match;
  var source = String(html || '');
  while ((match = re.exec(source)) && out.length < 80) {
    var tail = source.slice(match.index, match.index + 900);
    var title = attrOf(match[0], 'title');
    if (!title) {
      var image = /<img\b[^>]*>/i.exec(tail);
      title = image ? attrOf(image[0], 'alt') : '';
    }
    title = String(title || '').trim();
    if (!title || title === 'N/A' || title.length > 200) continue;
    var slug = match[2];
    out.push({
      kind: match[1].toLowerCase(),
      slug: slug,
      id: kdTmdbId(slug),
      title: title,
      url: KD_BASE + '/detail/' + match[1].toLowerCase() + '/' + slug
    });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

/** Busca la ficha del título pedido; con un único resultado para la consulta
 * exacta se acepta aunque el nombre del sitio esté en otro idioma. */
function kdSearch(info) {
  var kind = info.isTv ? 'tv' : 'movie';
  var queries = searchQueries(info).slice(0, 3);
  var found = [];

  function collect(html, uniqueForQuery) {
    var cards = kdCards(html, kind);
    var unambiguous = uniqueForQuery && cards.length === 1;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (!card.id) continue;
      var score = 0;
      var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
      for (var j = 0; j < titles.length; j++) {
        if (titles[j]) score = Math.max(score, titleScore(card.title, titles[j]));
      }
      if (score < 0.78 && unambiguous) score = 0.8;
      if (score < 0.78) continue;
      card.score = score;
      found.push(card);
    }
  }

  function next(index) {
    if (index >= queries.length) return Promise.resolve();
    return getText(KD_BASE + '/search?q=' + encodeURIComponent(queries[index]),
      { timeout: 8000, retries: 0 }).then(function (html) {
        collect(html, true);
        return found.length ? null : next(index + 1);
      }, function () { return next(index + 1); });
  }

  return next(0).then(function () {
    return uniqueBy(found, function (item) { return item.url; })
      .sort(function (a, b) { return b.score - a.score; });
  });
}

/** Servidores del botón `onclick="switchServer('id', 'url', ...)"`. */
function kdServers(html, base) {
  var out = [];
  var re = /switchServer\(\s*'([^']*)'\s*,\s*'([^']+)'/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && out.length < 30) {
    var url = publicHttpUrl(match[2], base || KD_BASE + '/');
    if (!url || isPlayerAdvertisement(url)) continue;
    out.push({ url: url, name: kdServerName(match[1]), kind: match[1] });
  }
  if (!out.length) {
    // Sin botones, al menos el iframe principal.
    var frame = /<iframe\b[^>]*>/i.exec(String(html || ''));
    var src = frame ? attrOf(frame[0], 'src') : '';
    var url = publicHttpUrl(src, base || KD_BASE + '/');
    if (url && !isPlayerAdvertisement(url)) out.push({ url: url, name: 'KatDrama' });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

function kdServerName(id) {
  var text = String(id || '').toLowerCase();
  if (text.indexOf('kat') === 0) return 'KatDrama';
  if (text.indexOf('vidly') !== -1) return 'Vidly';
  if (text.indexOf('vidzee') !== -1) return 'Vidzee';
  if (text.indexOf('zxc') !== -1) return 'ZxcStream';
  if (text.indexOf('reels') !== -1) return 'Reels';
  if (text.indexOf('frame') !== -1) return 'frameXTV';
  if (text.indexOf('tubi') !== -1) return 'Tubi';
  if (text.indexOf('mx') !== -1) return 'MX Player';
  return 'KatDrama';
}

function kdGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info || !info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];
    return kdSearch(info).then(function (cards) {
      return mapLimit(cards.slice(0, 2), 2, function (card) {
        // Con el id de TMDB la URL de reproducción no se adivina: la canónica
        // la decide el sitio a partir del slug + id.
        var watch = card.kind === 'movie'
          ? KD_BASE + '/watch/movie/' + card.slug
          : KD_BASE + '/watch/tv/' + card.slug + '-episode-' + info.episode;
        return getText(watch, { timeout: 9000, retries: 0 }).then(function (html) {
          var servers = kdServers(html, watch);
          if (!servers.length) return [];
          return resolveDirectPlayers(servers, { maxDepth: 3, maxPages: 8 });
        }, function () { return []; });
      });
    }).then(function (groups) {
      var streams = [];
      for (var i = 0; i < groups.length; i++) {
        for (var j = 0; j < (groups[i] || []).length; j++) {
          var item = groups[i][j];
          var title = info.title + (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
            (item.name ? ' · ' + item.name : '');
          streams.push(makeStream({ name: 'KatDrama', title: title, provider: 'k-drama', url: item.url,
            quality: parseQuality(title + ' ' + item.url), language: item.language || languageLabel(title),
            headers: item.headers, subtitles: item.subtitles }));
        }
      }
      return finalizeStreams('KatDrama', streams, { max: conf.maxResults });
    });
  }).catch(function (error) { log('k-drama', error && error.message || error); return []; });
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

function kdResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function kdSettingsPanel() {
  return Promise.resolve([
    { type: 'header', label: 'KatDrama (k-drama.in)' },
    { type: 'info', label: 'Doramas, películas y series asiáticas. Se entregan los enlaces HLS/MP4 que expongan sus reproductores; los que dependen de JavaScript no se pueden resolver.' }
  ]);
}

module.exports = {
  getStreams: kdGetStreams,
  resolveMeta: kdResolveMeta,
  onSettings: kdSettingsPanel
};
