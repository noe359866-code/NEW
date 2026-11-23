/*__CORE__*/

/* FuegoCine: /search?s= → ficha → (temporada → episodio) → watch → iframe
 * (Unlimplay / Abyssplayer / Videro) → HLS directo.
 *
 * Estructura reconocida el 2026-11 con la sonda tools/probe-sites.js:
 *   /movies/details/<slug>/<id>          ficha de película
 *   /movies/watch/<slug>/<id>            reproductores de la película
 *   /shows/details/<slug>/<id>           ficha de serie (enlaces de temporada)
 *   /shows/<slug>/seasons/temporada-1/55 temporada con sus episodios
 *   /shows/<slug>/01x02-slug/50          episodio
 *   /shows/watch/<slug>/<id>?…           reproductores del episodio (ver nota)
 *
 * Unlimplay es el único reproductor con un endpoint JSON estable:
 *   https://vimeos.unlimplay.com/?id=<tmdb>  →  embeds.<idioma>.direct (m3u8)
 * Los iframes de Abyssplayer y Videro se recorren con resolveDirectPlayers.
 *
 * Búsqueda: /search?s= responde 500 en el servidor del sitio (error de su
 * controlador), así que además se recorre el catálogo paginado y se puntúa
 * contra el título. Es una lista corta y se corta en cuanto hay coincidencia. */
var FUEGO_BASE = 'https://fuegocine.com';

function fuegoCards(html) {
  var out = [];
  var re = /<a\b[^>]*href=["'](?:https?:\/\/fuegocine\.com)?\/(movies|shows)\/details\/([^"'#?]+)\/(\d{1,9})["'][^>]*>/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && out.length < 120) {
    var title = attrOf(match[0], 'title');
    if (!title) {
      // El título puede estar en el <h3> o en el texto del propio enlace.
      var tail = String(html || '').slice(match.index, match.index + 600);
      var heading = /<(?:h[1-4]|h5)\b[^>]*>([\s\S]{1,160}?)<\/(?:h[1-4]|h5)>/i.exec(tail);
      title = heading ? stripTags(heading[1]) : '';
      if (!title) {
        // /search_elastic solo publica <img alt="Título"> dentro del enlace.
        var image = /<img\b[^>]*>/i.exec(tail);
        title = image ? (attrOf(image[0], 'alt') || attrOf(image[0], 'title')) : '';
      }
    }
    title = String(title || '').trim();
    if (!title || title.length > 200) continue;
    // El año, cuando la tarjeta lo muestra, va en el texto del propio enlace.
    var inner = String(html || '').slice(match.index, match.index + 900);
    inner = inner.slice(0, inner.indexOf('</a>') > 0 ? inner.indexOf('</a>') : 200);
    var yearMatch = /\b(19\d{2}|20\d{2})\b/.exec(stripTags(inner));
    out.push({
      kind: match[1].toLowerCase(),
      year: yearMatch ? parseInt(yearMatch[1], 10) : null,
      slug: match[2],
      id: match[3],
      title: title,
      url: FUEGO_BASE + '/' + match[1].toLowerCase() + '/details/' + match[2] + '/' + match[3]
    });
  }
  return uniqueBy(out, function (item) { return item.kind + ':' + item.id; });
}

/** El catálogo está en español y los metadatos sin clave de TMDB llegan en
 * inglés («Avatar: The Last Airbender» vs «Avatar: La Leyenda de Aang»). El
 * primer bloque del título coincide y el año confirma que es la misma ficha;
 * solo se acepta con esa doble condición y se marca el resultado como
 * aproximado. */
function fuegoTranslatedMatch(card, info) {
  if (!info.year || card.year !== info.year) return false;
  var wanted = significantTokens(info.title || '');
  var candidate = significantTokens(card.title || '');
  if (!wanted.length || !candidate.length) return false;
  if (wanted[0] !== candidate[0]) return false;
  // El título del sitio debe tener al menos dos palabras propias: con una
  // sola («Avatar») coincidiría con cualquier secuela del mismo año.
  return candidate.length >= 2;
}

function fuegoScore(card, info) {
  var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
  var score = 0;
  for (var i = 0; i < titles.length; i++) {
    if (!titles[i]) continue;
    score = Math.max(score, titleScore(card.title, titles[i]));
  }
  return score;
}

/** Busca por título en el endpoint del cuadro de búsqueda del sitio
 * (/search_elastic, el que usa showSuggestions) y, si no responde, en el
 * catálogo paginado. Las sugerencias solo traen imagen, así que el título del
 * enlace se completa con el alt de la imagen. */
function fuegoSearch(info) {
  var section = info.isTv ? 'shows' : 'movies';
  var queries = searchQueries(info).slice(0, 3);
  var found = [];

  function collect(html) {
    var cards = fuegoCards(html);
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.kind !== section) continue;
      // Nunca se acepta una ficha por venir de una sugerencia: el título tiene
      // que coincidir, o se acabaría devolviendo el medio equivocado.
      var score = fuegoScore(card, info);
      var approximate = false;
      if (score < 0.78 && fuegoTranslatedMatch(card, info)) {
        score = 0.8;
        approximate = true;
      }
      if (score < 0.78) continue;
      card.score = score;
      card.approximate = approximate;
      found.push(card);
    }
  }

  function suggest(index) {
    if (index >= queries.length) return Promise.resolve(false);
    return getText(FUEGO_BASE + '/search_elastic?s=' + encodeURIComponent(queries[index]),
      { timeout: 8000, retries: 0 }).then(function (html) {
        if (!html || !/details\//.test(html)) return suggest(index + 1);
        collect(html);
        return found.length > 0 || suggest(index + 1);
      }, function () { return suggest(index + 1); });
  }

  function pages(page, empty) {
    if (page > 4) return Promise.resolve();
    return getText(FUEGO_BASE + '/' + section + (page === 1 ? '' : '?page=' + page),
      { timeout: 8000, retries: 0 }).then(function (html) {
        var before = found.length;
        collect(html);
        // Dos páginas seguidas sin coincidencias: el título no está en el catálogo reciente.
        var blank = found.length === before ? empty + 1 : 0;
        if (blank >= 2 || found.some(function (item) { return item.score >= 0.95; })) return;
        return pages(page + 1, blank);
      }, function () { return page <= 2 ? pages(page + 1, empty) : null; });
  }

  return suggest(0).then(function () {
    // Basta con una coincidencia exacta o una aproximada confirmada por año.
    if (found.some(function (item) { return item.score >= 0.95 || item.approximate; })) return null;
    return pages(1, 0);
  }).then(function () {
    return uniqueBy(found, function (item) { return item.url; })
      .sort(function (a, b) { return b.score - a.score; });
  });
}

/** Enlaces de temporada de la ficha de una serie:
 *  /shows/<slug>/seasons/temporada-1/55 */
function fuegoSeasons(html) {
  var out = [];
  var re = /<a\b[^>]*href=["']((?:https?:\/\/fuegocine\.com)?\/shows\/[^"'#?]+?\/seasons\/[^"'#?]+?\/\d{1,9})["'][^>]*>/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && out.length < 40) {
    var url = publicHttpUrl(FUEGO_BASE + match[1].replace(FUEGO_BASE, ''), FUEGO_BASE + '/');
    if (!url) continue;
    var text = attrOf(match[0], 'title') || '';
    var number = /temporada[-_ ]?(\d{1,3})/i.exec(match[1]) || /(\d{1,3})/.exec(text);
    out.push({ url: url, season: number ? parseInt(number[1], 10) : null });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

/** Episodios de una temporada: /shows/<slug>/01x02-slug/50 */
function fuegoEpisodes(html) {
  var out = [];
  var re = /<a\b[^>]*href=["']((?:https?:\/\/fuegocine\.com)?\/shows\/[^"'#?]+?\/(\d{1,2})x(\d{1,4})(?:-[^"'#?]*)?\/\d{1,9})["'][^>]*>/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && out.length < 300) {
    var url = publicHttpUrl(FUEGO_BASE + match[1].replace(FUEGO_BASE, ''), FUEGO_BASE + '/');
    if (!url) continue;
    out.push({ url: url, season: parseInt(match[2], 10), episode: parseInt(match[3], 10),
      name: attrOf(match[0], 'title') || '' });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

/** Reproductores de una ficha: iframes de /watch o de la propia página. */
function fuegoPlayers(html, base) {
  var links = [];
  var re = /<iframe\b[^>]*>/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && links.length < 20) {
    var src = attrOf(match[0], 'src') || attrOf(match[0], 'data-src');
    var url = publicHttpUrl(src, base || FUEGO_BASE + '/');
    if (!url || isPlayerAdvertisement(url)) continue;
    links.push({ url: url, name: playerName(url) });
  }
  return uniqueBy(links, function (item) { return item.url; });
}

/** HLS/MP4 con cadena de consulta: las URLs firmadas de Unlimplay la usan,
 * así que no sirve la comprobación estricta de directMediaUrl. */
function playerMediaUrl(value) {
  var url = publicHttpUrl(value);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    return /\.[a-z0-9]{2,5}$/i.test(new URL(url).pathname) && /\.(?:m3u8|mp4|mpd)$/i.test(new URL(url).pathname) ? url : null;
  } catch (e) { return null; }
}

function playerName(url) {
  try {
    var host = new URL(url).hostname.toLowerCase();
    if (host.indexOf('unlimplay') !== -1) return 'Unlimplay';
    if (host.indexOf('abyssplayer') !== -1) return 'Abyssplayer';
    if (host.indexOf('videro') !== -1) return 'Videro';
    return host.replace(/^www\./, '').split('.')[0];
  } catch (e) { return 'Servidor'; }
}

/** Unlimplay: su API JSON entrega HLS directo por idioma. */
/** Unlimplay: /f/embed/movie/<id> o /f/embed/tv/<id>/<temporada>/<episodio>. */
function unlimplayRef(url) {
  var text = String(url || '');
  var movie = /\/f\/embed\/movies?\/(\d{1,9})/i.exec(text);
  if (movie) return { id: movie[1], season: 0, episode: 0 };
  var show = /\/f\/embed\/(?:tv|series?|serie)\/(\d{1,9})(?:\/(\d{1,3})\/(\d{1,4}))?/i.exec(text);
  if (!show) return null;
  return { id: show[1], season: parseInt(show[2] || '0', 10), episode: parseInt(show[3] || '0', 10) };
}

function unlimplayId(url) {
  var ref = unlimplayRef(url);
  return ref ? ref.id : null;
}

function unlimplayStreams(id, referer, season, episode) {
  if (!id) return Promise.resolve([]);
  // Para series la API exige season/episode; con s/e responde 404.
  var endpoint = 'https://vimeos.unlimplay.com/?id=' + id +
    (season ? '&season=' + season + '&episode=' + episode : '');
  // Desde el servidor (IP de Render) la API tarda a veces más de 8 s y la
  // respuesta llega vacía; se reintenta una vez con más margen.
  return getJson(endpoint, {
    timeout: 15000, retries: 1, headers: { Accept: 'application/json' }
  }).then(function (data) {
    var embeds = data && data.embeds && typeof data.embeds === 'object' ? data.embeds : null;
    if (!embeds) return [];
    var out = [];
    var languages = Object.keys(embeds).slice(0, 6);
    for (var i = 0; i < languages.length; i++) {
      var language = languages[i];
      var entry = (embeds[language] && embeds[language].direct) || '';
      var media = playerMediaUrl(entry);
      if (!media) continue;
      out.push({ url: media, name: 'Unlimplay', language: languageLabel(language) || language,
        headers: { Referer: referer || 'https://unlimplay.com/', 'User-Agent': UA,
          Origin: 'https://unlimplay.com' } });
    }
    return out;
  }, function () { return []; });
}

/** Episodio: ficha → temporada → episodio → iframes. */
function fuegoEpisodePlayers(info, card) {
  return getText(card.url, { timeout: 8000, retries: 0 }).then(function (html) {
    var players = fuegoPlayers(html, card.url);
    if (players.length) return { players: players, source: card.url };
    var seasons = fuegoSeasons(html);
    var wanted = seasons.filter(function (item) { return item.season === info.season; })[0] ||
      (seasons.length === 1 && info.season === 1 ? seasons[0] : null);
    if (!wanted) return { players: [], source: card.url };
    return getText(wanted.url, { timeout: 8000, retries: 0 }).then(function (seasonHtml) {
      var episode = fuegoEpisodes(seasonHtml).filter(function (item) {
        return item.season === info.season && item.episode === info.episode;
      })[0];
      if (!episode) return { players: [], source: wanted.url };
      return getText(episode.url, { timeout: 8000, retries: 0 }).then(function (episodeHtml) {
        return { players: fuegoPlayers(episodeHtml, episode.url), source: episode.url };
      }, function () { return { players: [], source: episode.url }; });
    }, function () { return { players: [], source: wanted.url }; });
  }, function () { return { players: [], source: card.url }; });
}

function fuegoGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info || !info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];
    return fuegoSearch(info).then(function (cards) {
      return mapLimit(cards.slice(0, 2), 2, function (card) {
        // La página de reproducción de la película trae los iframes; la del
        // episodio también (se localiza a través de su temporada).
        var watchUrl = info.isTv ? null : FUEGO_BASE + '/movies/watch/' + card.slug + '/' + card.id;
        var job = info.isTv ? fuegoEpisodePlayers(info, card)
          : getText(watchUrl, { timeout: 8000, retries: 0 }).then(function (html) {
            return { players: html ? fuegoPlayers(html, watchUrl) : [], source: watchUrl };
          }, function () { return { players: [], source: watchUrl }; });
        return job.then(function (found) {
          var players = uniqueBy((found && found.players) || [], function (item) { return item.url; });
          if (!players.length) return [];
          var direct = players.filter(function (item) { return unlimplayId(item.url); });
          var rest = players.filter(function (item) { return !unlimplayId(item.url); });
          // Unlimplay: HLS directo desde su API, sin recorrer el iframe.
          var ref = unlimplayRef(direct[0] && direct[0].url);
          var target = ref && ref.season ? ref :
            (ref && info.isTv ? { id: ref.id, season: info.season, episode: info.episode } : ref);
          return unlimplayStreams(target && target.id, found.source, target && target.season,
            target && target.episode).then(function (streams) {
            var mark = function (list) {
              return list.map(function (item) {
                if (card.approximate) item.approximate = true;
                return item;
              });
            };
            if (!rest.length) return mark(streams);
            return resolveDirectPlayers(rest.slice(0, 3), { maxDepth: 3, maxPages: 8 }).then(function (deep) {
              return mark(streams.concat(deep));
            });
          });
        });
      });
    }).then(function (groups) {
      var streams = [];
      for (var i = 0; i < groups.length; i++) {
        var results = groups[i] || [];
        for (var j = 0; j < results.length; j++) {
          // `approximate` viaja con cada enlace: la ficha puede haber cambiado.
          var item = results[j];
          var title = info.title + (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
            (item.name ? ' · ' + item.name : '');
          // Aviso explícito: la ficha se emparejó por título traducido y año.
          if (item.approximate) title += ' (título traducido)';
          streams.push(makeStream({ name: 'FuegoCine', title: title, provider: 'fuegocine', url: item.url,
            quality: parseQuality(title + ' ' + item.url), language: item.language || languageLabel(title),
            headers: item.headers, subtitles: item.subtitles }));
        }
      }
      return finalizeStreams('FuegoCine', streams, { max: conf.maxResults });
    });
  }).catch(function (error) { log('fuegocine', error && error.message || error); return []; });
}

function fuegocineGetStreams(tmdbId, mediaType, season, episode) {
  return fuegoGetStreams(tmdbId, mediaType, season, episode);
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

function fuegocineResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'FuegoCine' },
    { type: 'info', label: 'Películas y series. Se devuelven enlaces HLS/MP4 directos de Unlimplay y de los reproductores que los expongan.' }
  ]);
}

module.exports = {
  getStreams: fuegocineGetStreams,
  resolveMeta: fuegocineResolveMeta,
  onSettings: onSettings
};
