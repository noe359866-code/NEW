/*__CORE__*/

/* HomeCine (www3.homecine.to): WordPress con DooPlay.
 *
 * Lo reconocido con tools/probe-sites.js (2026-11):
 *  - Búsqueda: /?s=<texto> (input name="s"). Las fichas son /<slug> para las
 *    películas y /series/<slug> para las series.
 *  - Película: la ficha trae varias pestañas (una por servidor e idioma):
 *      <strong>Server Cload</strong> ... <a href="#tab1">480p - Latino</a>
 *      <a href="#tab2">HD 1080p - Castellano</a> <a href="#tab3">480p - Subtitulado</a>
 *    y en el cuerpo de cada pestaña un <IFRAME SRC="https://fastream.to/embed-xxx.html">.
 *  - Serie: el episodio se publica como /episode/<slug>-temporada-N-capitulo-M y
 *    ese episodio repite el mismo esquema de pestañas.
 *  - fastream.to entrega un player empaquetado (P.A.C.K.E.R) con una URL HLS
 *    firmada; `findDirectMedia` lo descomprime sin ejecutar JavaScript.
 *  - Algunas fichas muestran «*REPRODUCTOR BLOQUEADO*» cuando el host ya no
 *    sirve: en ese caso no hay nada que entregar y se devuelve una lista vacía.
 *  - El idioma y la calidad vienen en el texto de cada pestaña, así que se
 *    etiquetan tal cual los declara el sitio. */

var HOMECINE_BASE = 'https://www3.homecine.to';

function homecineSiteUrl(value, base) {
  var url = publicHttpUrl(value, base || HOMECINE_BASE + '/');
  if (!url) return null;
  try {
    var parsed = new URL(url);
    var host = String(parsed.hostname || '').toLowerCase();
    if (parsed.protocol !== 'https:' || (host !== 'homecine.to' && host !== 'www.homecine.to' &&
        host !== 'www3.homecine.to' && host !== 'www2.homecine.to')) return null;
    if (!/^\/(?:series|episode)\/[a-z0-9-]{2,160}\/?$/i.test(parsed.pathname) &&
        !/^\/[a-z0-9-]{2,160}\/?$/i.test(parsed.pathname)) return null;
    // Se descartan las secciones del sitio que no son fichas.
    if (/^\/(?:cartelera|genre|country|release-year|director|stars|tag|page|feed|wp-|search)\b/i.test(parsed.pathname)) return null;
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch (e) { return null; }
}

/** Tarjetas de búsqueda / listados: <a href="/ficha">…<h2>título</h2>… */
function homecineCards(html) {
  var out = [];
  var text = String(html || '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ');
  var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,600}?)<\/a>/gi;
  var match;
  while ((match = re.exec(text)) && out.length < 80) {
    var url = homecineSiteUrl(match[1], HOMECINE_BASE + '/');
    if (!url) continue;
    var inner = match[2];
    // El título está en el heading o, si no, en el alt/title de la portada.
    var heading = /<(?:h[1-4]|strong)\b[^>]*>([\s\S]*?)<\/(?:h[1-4]|strong)>/i.exec(inner);
    var image = /<img\b[^>]*>/i.exec(inner);
    var title = stripTags((heading && heading[1]) || '') ||
      attrOf(image ? image[0] : '', 'alt') || attrOf(match[0].slice(0, match[0].indexOf('>') + 1), 'title');
    title = String(title || '').replace(/\s+/g, ' ').trim();
    if (!title || title.length > 200) continue;
    if (/^(?:cartelera|inicio|pel[ií]culas|series|ver|watch|download|login|favorite)$/i.test(title)) continue;
    out.push({ url: url, title: title, isMovie: !/^\/series\//i.test(new URL(url).pathname) });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

function homecineScore(candidate, info) {
  var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
  var score = 0;
  for (var i = 0; i < titles.length; i++) {
    if (!titles[i]) continue;
    score = Math.max(score, titleScore(candidate.title, titles[i]));
  }
  return score;
}

function homecineSearch(info) {
  var queries = searchQueries(info).slice(0, 3);
  var index = 0;
  var found = [];
  function next() {
    if (index >= queries.length ||
        found.some(function (item) { return item.score >= 0.95; })) return Promise.resolve(found);
    var url = HOMECINE_BASE + '/?s=' + encodeURIComponent(queries[index++]);
    return getText(url, { timeout: 8000, retries: 0 }).then(function (html) {
      var cards = homecineCards(html);
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (info.isTv && card.isMovie) continue;
        if (!info.isTv && !card.isMovie) continue;
        var score = homecineScore(card, info);
        if (score < 0.7) continue;
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

/** Pestañas de la ficha: cada una declara idioma y calidad en su texto.
 * La estructura cambia entre fichas de película y de episodio, así que las
 * etiquetas se recogen por separado de los iframes y se emparejan por orden. */
function homecineTabs(html) {
  var tabs = [];
  var text = String(html || '');
  var re = /<a\b[^>]*href=["']#(tab\d+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  var match;
  while ((match = re.exec(text)) && tabs.length < 12) {
    var label = stripTags(match[2]).replace(/\s+/g, ' ').trim();
    if (!label) continue;
    // El servidor suele estar en el título que precede a la lista de pestañas.
    var before = text.slice(Math.max(0, match.index - 1200), match.index);
    var names = before.match(/<strong[^>]*>([\s\S]{0,80}?)<\/strong>/gi) || [];
    var server = names.length ? stripTags(names[names.length - 1]).replace(/\s+/g, ' ').trim() : 'Server';
    tabs.push({ id: match[1], server: server || 'Server', label: label, position: match.index,
      quality: parseQuality(label), language: languageLabel(label) });
  }
  return tabs;
}

/** Iframes del reproductor, en el orden en que aparecen en la ficha. */
function homecineIframes(html) {
  var out = [];
  var text = String(html || '');
  var re = /<iframe\b[^>]*>/gi;
  var match;
  while ((match = re.exec(text)) && out.length < 20) {
    var src = attrOf(match[0], 'src') || attrOf(match[0], 'data-src') || attrOf(match[0], 'data-lazy-src');
    var url = publicHttpUrl(src, HOMECINE_BASE + '/');
    if (!url || isPlayerAdvertisement(url)) continue;
    // El trailer de YouTube no es una fuente del título.
    if (/youtube\.com|youtu\.be|google\.com\/maps/i.test(url)) continue;
    out.push({ url: url, position: match.index });
  }
  return out;
}

/** Cada pestaña con su iframe: están en el mismo orden dentro del reproductor. */
function homecineTabLinks(html) {
  var tabs = homecineTabs(html);
  var frames = homecineIframes(html);
  var links = [];
  // Si hay una pestaña por reproductor, el orden es la correspondencia. Cuando
  // el sitio repite un reproductor para varios idiomas, se hereda la última
  // pestaña que aparece antes del iframe.
  var pairwise = tabs.length === frames.length;
  for (var i = 0; i < frames.length; i++) {
    var tab = pairwise ? tabs[i] : null;
    if (!tab) {
      for (var j = 0; j < tabs.length; j++) {
        if (tabs[j].position < frames[i].position) tab = tabs[j];
      }
    }
    if (!tab) tab = tabs[i] || tabs[0] || null;
    links.push({
      url: frames[i].url,
      name: tab ? tab.server : 'Server',
      language: tab ? tab.language : null,
      quality: tab ? tab.quality : null,
      label: tab ? tab.label : ''
    });
  }
  return uniqueBy(links, function (item) { return item.url; });
}

/** URL del episodio publicado en la ficha de la serie. */
function homecineEpisodeUrl(html, info) {
  var text = String(html || '');
  var re = /href=["']([^"']*\/episode\/[a-z0-9-]{2,200})["']/gi;
  var match;
  var wanted = new RegExp('temporada-' + info.season + '-capitulo-' + info.episode + '$', 'i');
  while ((match = re.exec(text))) {
    if (!wanted.test(match[1].replace(/\/$/, ''))) continue;
    var url = homecineSiteUrl(match[1], HOMECINE_BASE + '/');
    if (url) return url;
  }
  return null;
}

function homecineReadPage(url) {
  return request(url, { timeout: 9000, retries: 0, pageOnly: true,
    headers: { Referer: HOMECINE_BASE + '/' } }).then(function (res) {
    if (!res.ok || !res.text) return null;
    return { url: res.url || url, html: res.text };
  }, function () { return null; });
}

function homecineStream(info, item) {
  var title = (info.title || ('TMDB ' + (info.tmdbId || ''))) +
    (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
    (item.name ? ' · ' + item.name : '');
  return makeStream({ name: 'HomeCine', title: title, provider: 'homecine', url: item.url,
    quality: item.quality && item.quality !== 'SD'
      ? item.quality : parseQuality(title + ' ' + item.url + ' ' + (item.label || '')),
    language: languageLabel(item.language) || languageLabel(item.label || ''),
    headers: item.headers, subtitles: item.subtitles });
}

function homecineGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info || !info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];
    return homecineSearch(info).then(function (candidates) {
      return mapLimit(candidates.slice(0, 2), 2, function (candidate) {
        return homecineReadPage(candidate.url).then(function (page) {
          if (!page) return [];
          if (!info.isTv) {
            var links = homecineTabLinks(page.html);
            return links.length ? resolveDirectPlayers(links, { maxDepth: 4, maxPages: 6 }) : [];
          }
          var episodeUrl = homecineEpisodeUrl(page.html, info);
          if (!episodeUrl) return [];
          return homecineReadPage(episodeUrl).then(function (episodePage) {
            if (!episodePage) return [];
            var links = homecineTabLinks(episodePage.html);
            return links.length ? resolveDirectPlayers(links, { maxDepth: 4, maxPages: 6 }) : [];
          });
        });
      }).then(function (groups) {
        var streams = [];
        for (var i = 0; i < groups.length; i++) {
          var results = groups[i] || [];
          for (var j = 0; j < results.length; j++) streams.push(homecineStream(info, results[j]));
        }
        return finalizeStreams('HomeCine', streams, { max: conf.maxResults });
      });
    });
  }).catch(function (error) { log('homecine', error && error.message || error); return []; });
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

function homecineResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function homecineSettingsPanel() {
  return Promise.resolve([
    { type: 'header', label: 'HomeCine (homecine.to)' },
    { type: 'info', label: 'Catálogo en español con pestañas por servidor e idioma (Latino, Castellano, Subtitulado). Se entregan los HLS/MP4 del reproductor fastream cuando el sitio no lo marca como bloqueado.' }
  ]);
}

module.exports = {
  getStreams: homecineGetStreams,
  resolveMeta: homecineResolveMeta,
  onSettings: homecineSettingsPanel
};
