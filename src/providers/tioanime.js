/*__CORE__*/

/* TioAnime: /directorio?q= → /anime/<slug> → var episodes → /ver/<slug>-<n>
 * → var videos → reproductores (Voe, YourUpload) → HLS/MP4 directo.
 *
 * Es un port de TioAnimeProvider (StreamflixReborn). Dos detalles que no son
 * obvios y que se mantienen tal cual:
 *  - `var episodes` es una lista de NÚMEROS (no de objetos); cada número es la
 *    URL /ver/<slug>-<n>.
 *  - `var videos` es una lista de pares [nombre, url]; solo se aceptan los
 *    servidores de la lista blanca.
 * El sitio bloquea IPs de datacenter como los demás; el bloqueo se registra. */
var TIO_BASE = 'https://tioanime.com';

function tioAbsolute(value) {
  var raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return publicHttpUrl(raw);
  return publicHttpUrl(TIO_BASE + '/' + raw.replace(/^\/+/, ''));
}

/** Slug de /anime/<slug>, /ver/<slug>-<n> o de una URL absoluta. */
function tioSlug(value) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  raw = raw.replace(/^https?:\/\/(?:www\.)?tioanime\.com/i, '').split(/[?#]/)[0];
  raw = raw.replace(/^\/+|\/+$/g, '');
  raw = raw.replace(/^(?:anime|ver)\//i, '');
  return raw;
}

/** Extrae un array literal `var episodes = [1,2,3]` respetando cadenas y
 * anidamiento, igual que extractArray de la referencia. */
function tioArrayLiteral(source, marker) {
  var text = String(source || '');
  var at = text.indexOf(marker);
  if (at < 0) return null;
  var start = text.indexOf('[', at);
  if (start < 0) return null;
  var depth = 0;
  var quoted = false;
  var escaped = false;
  for (var i = start; i < text.length && i < start + 200000; i++) {
    var c = text.charAt(i);
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Contenido de los <script> del documento, sin depender de un DOM. */
function tioScripts(html) {
  var out = [];
  var re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && out.length < 60) out.push(match[1]);
  return out;
}

function tioEpisodeNumbers(html) {
  var scripts = tioScripts(html);
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].indexOf('var episodes') === -1) continue;
    var literal = tioArrayLiteral(scripts[i], 'var episodes');
    if (!literal) continue;
    var numbers = [];
    var re = /\d{1,4}/g;
    var match;
    while ((match = re.exec(literal))) {
      var number = parseInt(match[0], 10);
      if (number > 0) numbers.push(number);
    }
    return uniqueBy(numbers, function (value) { return value; }).sort(function (a, b) { return a - b; });
  }
  return [];
}

/** Solo los servidores que la referencia considera reproducibles. */
var TIO_SERVERS = ['voe', 'yourupload'];

function tioVideoLinks(html) {
  var scripts = tioScripts(html);
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].indexOf('var videos') === -1) continue;
    var literal = tioArrayLiteral(scripts[i], 'var videos');
    if (!literal) continue;
    var data = null;
    try { data = JSON.parse(literal); } catch (e) { return []; }
    if (!Array.isArray(data)) return [];
    var links = [];
    for (var j = 0; j < data.length && j < 20; j++) {
      var pair = data[j];
      if (!Array.isArray(pair) || pair.length < 2) continue;
      var name = String(pair[0] || '').trim();
      var url = tioAbsolute(pair[1]);
      if (!url) continue;
      if (TIO_SERVERS.indexOf(name.toLowerCase()) === -1) continue;
      links.push({ url: url, name: name, referer: TIO_BASE + '/' });
    }
    return uniqueBy(links, function (item) { return item.url; });
  }
  return [];
}

/** Fichas del directorio: <article class="anime"><a href="/anime/slug">. */
function tioCards(html) {
  var out = [];
  var re = /<article\b[^>]*>([\s\S]{0,4000}?)<\/article>/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && out.length < 120) {
    var link = /<a\b[^>]*href=["']([^"']*\/anime\/[^"']+)["']/i.exec(match[1]);
    if (!link) continue;
    var slug = tioSlug(link[1]);
    if (!slug || !/^[a-z0-9-]{1,120}$/i.test(slug)) continue;
    var heading = /<h3\b[^>]*>([\s\S]{1,200}?)<\/h3>/i.exec(match[1]);
    var image = /<img\b[^>]*>/i.exec(match[1]);
    var title = stripTags(heading ? heading[1] : '') || (image && attrOf(image[0], 'alt')) || '';
    title = String(title).trim();
    if (!title || title.length > 200) continue;
    var text = stripTags(match[1]);
    out.push({
      slug: slug,
      url: TIO_BASE + '/anime/' + slug,
      title: title,
      isMovie: /pel[ií]cula/i.test(text) || /-(?:movie|pelicula)-/i.test(slug),
      fromSlug: titleFromSlug(slug)
    });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

/** «shingeki-no-kyojin-season-2» → «Shingeki No Kyojin Season 2». */
function titleFromSlug(slug) {
  return String(slug || '').split('-').map(function (part) {
    return /^\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1);
  }).join(' ').trim();
}

function tioScore(candidate, info) {
  var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
  var score = 0;
  for (var i = 0; i < titles.length; i++) {
    if (!titles[i]) continue;
    score = Math.max(score, titleScore(candidate.title, titles[i]), titleScore(candidate.fromSlug, titles[i]));
  }
  return score;
}

function tioSearch(info) {
  var queries = searchQueries(info).slice(0, 3);
  // Si no hay título (TMDB bloqueado), el slug del ID de anime es la única
  // consulta posible: «kitsu:7442» no sirve, pero su ficha ya trae el nombre.
  var index = 0;
  var found = [];
  function next() {
    if (index >= queries.length) return Promise.resolve(found);
    var url = TIO_BASE + '/directorio?q=' + encodeURIComponent(queries[index++]);
    return getText(url, { timeout: 7000, retries: 0 }).then(function (html) {
      var cards = tioCards(html);
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (info.isTv && card.isMovie) continue;
        if (!info.isTv && !card.isMovie) continue;
        var score = tioScore(card, info);
        if (score < 0.7) continue;
        card.score = score;
        found.push(card);
      }
      return next();
    }, function () { return next(); });
  }
  return next().then(function () {
    return uniqueBy(found, function (item) { return item.url; }).sort(function (a, b) { return b.score - a.score; });
  });
}

function tioAnimeUrl(slug) {
  return TIO_BASE + '/anime/' + tioSlug(slug);
}

/** URL del episodio pedido. En anime los números son absolutos, igual que
 * `Episode.number` en la referencia; no se recalcula con temporadas. */
function tioEpisodeUrl(slug, info, numbers) {
  var wanted = info.isTv ? info.episode : 1;
  if (!wanted || wanted < 1) return null;
  if (numbers.length && numbers.indexOf(wanted) === -1) return null;
  return TIO_BASE + '/ver/' + tioSlug(slug) + '-' + wanted;
}

function tioanimeGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info || !info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];
    return tioSearch(info).then(function (candidates) {
      return mapLimit(candidates.slice(0, 3), 2, function (candidate) {
        return getText(tioAnimeUrl(candidate.slug), { timeout: 7000, retries: 0 }).then(function (html) {
          var numbers = tioEpisodeNumbers(html);
          var episodeUrl = tioEpisodeUrl(candidate.slug, info, numbers);
          if (!episodeUrl) return [];
          return getText(episodeUrl, { timeout: 7000, retries: 0 }).then(function (episodeHtml) {
            var links = tioVideoLinks(episodeHtml);
            if (!links.length) return [];
            return resolveDirectPlayers(links, { maxDepth: 3, maxPages: 8 });
          });
        });
      }).then(function (groups) {
        var streams = [];
        for (var i = 0; i < groups.length; i++) {
          var results = groups[i] || [];
          for (var j = 0; j < results.length; j++) {
            var item = results[j];
            var title = info.title + (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
              (item.name ? ' · ' + item.name : '');
            streams.push(makeStream({ name: 'TioAnime', title: title, provider: 'tioanime', url: item.url,
              quality: parseQuality(title + ' ' + item.url), language: languageLabel(item.language) || 'Japonés Subtitulado',
              headers: item.headers, subtitles: item.subtitles }));
          }
        }
        return finalizeStreams('TioAnime', streams, { max: conf.maxResults });
      });
    });
  }).catch(function (error) { log('tioanime', error && error.message || error); return []; });
}

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

/** Solo metadatos: lo usa /meta y el diagnóstico; no busca fuentes. */
function tioanimeResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'TioAnime' },
    { type: 'info', label: 'Anime en japonés con subtítulos. Solo se devuelven enlaces HLS/MP4 directos de Voe y YourUpload.' }
  ]);
}

module.exports = {
  getStreams: tioanimeGetStreams,
  resolveMeta: tioanimeResolveMeta,
  onSettings: onSettings
};
