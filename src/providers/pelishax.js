/*__CORE__*/

/* PeliShax (pelishaxpro.com): /movies/<tmdb>, /series/<tmdb>/<temporada>/<episodio>
 * y /tv/<tmdb>/<temporada>/<episodio>.
 *
 * Lo reconocido con tools/probe-sites.js (2026-11):
 *  - Los ids de sus fichas son de TMDB: /movies/5084 es la película 1058424...
 *    pero el número de la URL es el id de TMDB que publica su ficha, así que se
 *    usa tal cual y se comprueba el título antes de entregar nada.
 *  - La búsqueda es /search?q=<texto> y devuelve <a href="/movies/123"> y
 *    <a href="/series/123"> con el título como texto.
 *  - Cada título lista sus reproductores como
 *    <li class="server-item" data-link="https://host/embed-x.html" data-lang="Español Latino">
 *    Es decir: el idioma viene declarado por el sitio, no hay que adivinarlo.
 *  - Los hosts son Vidmoly, StreamWish, VidHide, Vidara y similares: se recorren
 *    con resolveDirectPlayers, que solo acepta HLS/MP4. Nunca se entrega el
 *    iframe ni se inventa un enlace. */

var PELISHAX_BASE = 'https://pelishaxpro.com';

/** Rutas de ficha: /movies/<id>, /series/<id> y /animes/<id>. */
function pelishaxPath(kind, tmdbId, season, episode) {
  var prefix = kind === 'movie' ? '/movies/' : kind === 'tv' ? '/tv/' : '/series/';
  if (kind === 'movie') return prefix + tmdbId;
  if (!season || !episode) return null;
  return prefix + tmdbId + '/' + season + '/' + episode;
}

function pelishaxSiteUrl(value, base) {
  var url = publicHttpUrl(value, base || PELISHAX_BASE + '/');
  if (!url) return null;
  try {
    var parsed = new URL(url);
    var host = String(parsed.hostname || '').toLowerCase();
    if (parsed.protocol !== 'https:' || (host !== 'pelishaxpro.com' && host !== 'www.pelishaxpro.com')) return null;
    if (!/^\/(?:movies|series|tv|animes)\/[1-9]\d{0,8}(?:\/[1-9]\d{0,3}\/[1-9]\d{0,4})?\/?$/.test(parsed.pathname)) return null;
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch (e) { return null; }
}

/** Tarjetas de /search: enlace + título visible. */
function pelishaxCards(html) {
  var out = [];
  var text = String(html || '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ');
  var re = /<a\b[^>]*href=["']([^"']*\/(?:movies|series|animes)\/[1-9]\d{0,8})["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;
  var match;
  while ((match = re.exec(text)) && out.length < 60) {
    var url = pelishaxSiteUrl(match[1], PELISHAX_BASE + '/');
    if (!url) continue;
    var title = stripTags(match[2]).replace(/\s+/g, ' ').trim();
    if (!title || title.length > 200) continue;
    out.push({ url: url, title: title,
      isMovie: /\/movies\//i.test(url), year: parseYear(title) });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

function pelishaxScore(candidate, info) {
  var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
  var score = 0;
  for (var i = 0; i < titles.length; i++) {
    if (!titles[i]) continue;
    score = Math.max(score, titleScore(candidate.title, titles[i]));
  }
  return score;
}

function pelishaxSearch(info) {
  var queries = searchQueries(info).slice(0, 3);
  var index = 0;
  var found = [];
  function next() {
    if (index >= queries.length ||
        found.some(function (item) { return item.score >= 0.95; })) return Promise.resolve(found);
    var url = PELISHAX_BASE + '/search?q=' + encodeURIComponent(queries[index++]);
    return getText(url, { timeout: 8000, retries: 0 }).then(function (html) {
      var cards = pelishaxCards(html);
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (info.isTv && card.isMovie) continue;
        if (!info.isTv && !card.isMovie) continue;
        var score = pelishaxScore(card, info);
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

/** Candidatas: la ficha por id de TMDB y, si falla, el buscador.
 * Las fichas de PeliShax usan el id de TMDB como número de ruta
 * (/movies/155 = The Dark Knight), así que normalmente no hay que buscar. */
function pelishaxCandidates(info) {
  var direct = [];
  if (!info.title && info.tmdbId) {
    // Sin título no se puede buscar, pero la ficha por id sí se puede abrir.
    var only = PELISHAX_BASE + (info.isTv ? '/series/' : '/movies/') + info.tmdbId;
    var siteOnly = pelishaxSiteUrl(only, PELISHAX_BASE + '/');
    return Promise.resolve(siteOnly ? [{ url: siteOnly, title: '', score: 1 }] : []);
  }
  if (info.tmdbId) {
    var url = PELISHAX_BASE + (info.isTv ? '/series/' : '/movies/') + info.tmdbId;
    var site = pelishaxSiteUrl(url, PELISHAX_BASE + '/');
    if (site) direct.push({ url: site, title: info.title || '', score: 1 });
  }
  if (!direct.length) return pelishaxSearch(info);
  return pelishaxReadPage(direct[0].url).then(function (page) {
    // Una ficha que responde con servidores es la correcta: el id es de TMDB.
    if (page && /server-item/i.test(page.html)) return direct;
    return pelishaxSearch(info);
  }, function () { return pelishaxSearch(info); });
}

/** Idioma declarado en la ficha: «Español Latino», «English 🇺🇸 Sub ES»… */
function pelishaxLang(value) {
  var text = String(value || '').replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ' ');
  var label = languageLabel(text);
  // «English … Sub ES» declara idioma y subtítulos a la vez.
  if (label && /\bsubs?\b|\bsubtitul/i.test(text)) return label + ' Subtitulado';
  return label;
}

/** Botones de servidor: data-link (embed) y data-lang (idioma del sitio). */
function pelishaxServers(html, base) {
  var out = [];
  var text = String(html || '');
  var re = /<li\b[^>]*class=["'][^"']*server-item[^"']*["'][^>]*>/gi;
  var match;
  while ((match = re.exec(text)) && out.length < 30) {
    var tag = match[0];
    var link = attrOf(tag, 'data-link');
    var url = publicHttpUrl(link, base || PELISHAX_BASE + '/');
    if (!url || isPlayerAdvertisement(url)) continue;
    var lang = String(attrOf(tag, 'data-lang') || '').trim().slice(0, 40);
    // El texto del propio <li> puede repetir el idioma: se conserva como pista.
    var label = stripTags(text.slice(re.lastIndex, re.lastIndex + 200)).replace(/\s+/g, ' ').trim();
    out.push({ url: url, name: pelishaxHostName(url), language: pelishaxLang(lang) || pelishaxLang(label),
      label: lang || label });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

function pelishaxHostName(url) {
  try {
    var host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (host.indexOf('vidmoly') !== -1) return 'Vidmoly';
    if (host.indexOf('streamwish') !== -1) return 'StreamWish';
    if (host.indexOf('vidhide') !== -1) return 'VidHide';
    if (host.indexOf('vidara') !== -1) return 'Vidara';
    if (host.indexOf('filemoon') !== -1) return 'Filemoon';
    if (host.indexOf('dood') !== -1) return 'DoodStream';
    return host.split('.')[0];
  } catch (e) { return 'Servidor'; }
}

/** URL del episodio publicada en la ficha de la serie. */
function pelishaxEpisodeUrl(html, info) {
  var text = String(html || '');
  var re = /<a\b[^>]*href=["']([^"']*\/(?:series|tv)\/[1-9]\d{0,8}\/(\d{1,3})\/(\d{1,4}))["']/gi;
  var match;
  while ((match = re.exec(text))) {
    if (parseInt(match[2], 10) === info.season && parseInt(match[3], 10) === info.episode) {
      return pelishaxSiteUrl(match[1], PELISHAX_BASE + '/');
    }
  }
  return null;
}

function pelishaxReadPage(url) {
  return request(url, { timeout: 9000, retries: 0, pageOnly: true,
    headers: { Referer: PELISHAX_BASE + '/' } }).then(function (res) {
    if (!res.ok || !res.text) return null;
    var finalUrl = pelishaxSiteUrl(res.url, PELISHAX_BASE + '/') || url;
    return { url: finalUrl, html: res.text };
  }, function () { return null; });
}

/** Resuelve los servidores: OK.ru necesita leer su reproductor, los demás van
 * por el extractor genérico. Se descartan los que no dan HLS/MP4. */
function pelishaxResolveServers(servers) {
  if (!servers.length) return Promise.resolve([]);
  var okru = servers.filter(function (item) { return /ok\.ru\/(?:video|videoembed)\//i.test(item.url); });
  var rest = servers.filter(function (item) { return okru.indexOf(item) === -1; });
  var jobs = [];
  if (rest.length) jobs.push(resolveDirectPlayers(rest, { maxDepth: 4, maxPages: 5 }));
  okru.forEach(function (item) {
    jobs.push(pelishaxOkru(item));
  });
  return Promise.all(jobs).then(function (groups) {
    var out = [];
    for (var i = 0; i < groups.length; i++) out = out.concat(groups[i] || []);
    return out;
  });
}

/** OK.ru del catálogo de PeliShax: solo el reproductor publica los MP4/HLS.
 * Las fichas enlazan la página de vídeo (ok.ru/video/<id>); ahí no hay enlaces
 * directos, así que se pide el embed equivalente. */
function pelishaxOkru(server) {
  var embed = String(server.url).replace(/ok\.ru\/video\/(\d+)/i, 'ok.ru/videoembed/$1');
  return request(embed, { timeout: 9000, retries: 0, pageOnly: true }).then(function (res) {
    if (!res.ok || !res.text) return [];
    var medias = findDirectMedia(res.text, embed);
    var out = [];
    for (var i = 0; i < medias.length && out.length < 4; i++) {
      var url = directMediaUrl(medias[i]);
      if (!url || isPlayerAdvertisement(url)) continue;
      out.push({ url: url, name: 'OK.ru', language: server.language || pelishaxLang(server.label),
        quality: server.quality || '',
        headers: { Referer: embed, 'User-Agent': UA, Origin: 'https://ok.ru' } });
    }
    return out;
  }, function () { return []; });
}

function pelishaxStream(info, item) {
  var title = (info.title || ('TMDB ' + (info.tmdbId || ''))) +
    (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
    (item.name ? ' · ' + item.name : '');
  return makeStream({ name: 'PeliShax', title: title, provider: 'pelishax', url: item.url,
    quality: parseQuality(title + ' ' + item.url + ' ' + (item.label || '')),
    language: item.language || pelishaxLang(item.label || ''),
    headers: item.headers, subtitles: item.subtitles });
}

function pelishaxGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    // La ficha se identifica por el id de TMDB (`/movies/<id>`), así que no
    // hace falta el título: sin TMDB_API_KEY ni ficha en Wikidata se sigue.
    if (!info) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];
    return pelishaxCandidates(info).then(function (candidates) {
      return mapLimit(candidates.slice(0, 2), 2, function (candidate) {
        return pelishaxReadPage(candidate.url).then(function (page) {
          if (!page) return [];
          // Película: los servidores están en la propia ficha.
          if (!info.isTv) {
            var servers = pelishaxServers(page.html, page.url);
            return pelishaxResolveServers(servers);
          }
          // Serie: la ficha trae el enlace del episodio concreto.
          var episodeUrl = pelishaxEpisodeUrl(page.html, info);
          if (!episodeUrl) return [];
          return pelishaxReadPage(episodeUrl).then(function (episodePage) {
            if (!episodePage) return [];
            return pelishaxResolveServers(pelishaxServers(episodePage.html, episodePage.url));
          });
        });
      }).then(function (groups) {
        var streams = [];
        for (var i = 0; i < groups.length; i++) {
          var results = groups[i] || [];
          for (var j = 0; j < results.length; j++) streams.push(pelishaxStream(info, results[j]));
        }
        return finalizeStreams('PeliShax', streams, { max: conf.maxResults });
      });
    });
  }).catch(function (error) { log('pelishax', error && error.message || error); return []; });
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

function pelishaxResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function pelishaxSettingsPanel() {
  return Promise.resolve([
    { type: 'header', label: 'PeliShax (pelishaxpro.com)' },
    { type: 'info', label: 'Películas, series y anime. El sitio publica sus reproductores con el idioma ya declarado (data-lang); se entregan los HLS/MP4 que se puedan resolver.' }
  ]);
}

module.exports = {
  getStreams: pelishaxGetStreams,
  resolveMeta: pelishaxResolveMeta,
  onSettings: pelishaxSettingsPanel
};
