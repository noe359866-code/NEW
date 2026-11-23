/*__CORE__*/

/* CinePlus123 / Pelis123: búsqueda DooPlay → ficha o episodio publicado →
 * API de opciones → reproductor → HLS/MP4. Nunca se devuelve el iframe. */
var CINE_BASE = 'https://cineplus123.org';

function cineHasClass(tag, name) {
  var classes = attrOf(tag, 'class') || '';
  return (' ' + classes.replace(/\s+/g, ' ') + ' ').toLowerCase().indexOf(' ' + name.toLowerCase() + ' ') !== -1;
}

function cineClassText(html, name) {
  var text = String(html || '');
  var lower = text.toLowerCase();
  var tags = /<(span|div|time|h[1-4])\b[^>]*>/gi;
  var match;
  while ((match = tags.exec(text))) {
    if (!cineHasClass(match[0], name)) continue;
    var end = lower.indexOf('</' + match[1].toLowerCase(), tags.lastIndex);
    if (end !== -1) return stripTags(text.slice(tags.lastIndex, end)).slice(0, 200);
  }
  return '';
}

function cineSiteUrl(value, base, kind) {
  var url = publicHttpUrl(value, base || CINE_BASE + '/');
  if (!url) return null;
  try {
    var parsed = new URL(url);
    var host = String(parsed.hostname || '').toLowerCase();
    if (parsed.protocol !== 'https:' || (parsed.port && parsed.port !== '443') ||
        (host !== 'cineplus123.org' && host !== 'www.cineplus123.org')) return null;
    var path = parsed.pathname;
    var pattern = kind === 'movie' ? /^\/peliculas\/[^/]+\/?$/i
      : kind === 'series' ? /^\/serie-de-tv\/[^/]+\/?$/i
        : kind === 'episode' ? /^\/capitulo\/[^/]+\/?$/i : null;
    if (!pattern || !pattern.test(path)) return null;
    // No conservar parámetros publicitarios ni depender de setters de URL.
    return parsed.origin + path;
  } catch (e) { return null; }
}

function cineSearchSections(html) {
  // No examinar el menú, scripts ni recomendaciones como si fueran resultados.
  var text = String(html || '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  var starts = [];
  var tags = /<(?:div|article)\b[^>]*>/gi;
  var match;
  while ((match = tags.exec(text)) && starts.length < 100) {
    if (cineHasClass(match[0], 'result-item')) starts.push(match.index);
  }
  var sections = [];
  if (starts.length) {
    for (var i = 0; i < starts.length; i++) {
      var end = i + 1 < starts.length ? starts[i + 1] : text.length;
      var section = text.slice(starts[i], Math.min(end, starts[i] + 18000));
      var articleEnd = /<\/article\s*>/i.exec(section);
      if (articleEnd) section = section.slice(0, articleEnd.index + articleEnd[0].length);
      sections.push(section);
    }
    return sections;
  }
  // Algunas variantes del tema usan directamente tarjetas article.
  var articles = /<article\b[^>]*>[\s\S]{0,18000}?<\/article\s*>/gi;
  while ((match = articles.exec(text)) && sections.length < 100) sections.push(match[0]);
  return sections;
}

function cineCards(html) {
  var sections = cineSearchSections(html);
  var out = [];
  for (var i = 0; i < sections.length; i++) {
    var section = sections[i];
    var year = parseYear(cineClassText(section, 'year'));
    if (!year) {
      // La plantilla también usa un span numérico sin clase dentro de meta.
      var yearSpan = /<span\b[^>]*>\s*((?:19|20)\d{2})\s*<\/span\s*>/i.exec(section);
      if (yearSpan) year = parseInt(yearSpan[1], 10);
    }
    var anchors = /<a\b[^>]*>([\s\S]{0,3000}?)<\/a\s*>/gi;
    var match;
    while ((match = anchors.exec(section)) && out.length < 200) {
      var open = match[0].slice(0, match[0].indexOf('>') + 1);
      var href = attrOf(open, 'href');
      var movie = cineSiteUrl(href, CINE_BASE + '/', 'movie');
      var series = movie ? null : cineSiteUrl(href, CINE_BASE + '/', 'series');
      if (!movie && !series) continue;
      var image = /<img\b[^>]*>/i.exec(match[1]);
      var heading = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]\s*>/i.exec(match[1]);
      var title = (heading && stripTags(heading[1])) || (image && attrOf(image[0], 'alt')) ||
        attrOf(open, 'title') || stripTags(match[1]);
      title = String(title || '').replace(/^ver\s+/i, '').replace(/\s+online\s*$/i, '').trim();
      var titleYear = /\s+\(((?:19|20)\d{2})\)\s*$/.exec(title);
      if (titleYear) title = title.slice(0, titleYear.index).trim();
      if (!title || title.length > 200) continue;
      out.push({ url: movie || series, title: title, isMovie: !!movie,
        year: year || (titleYear ? parseInt(titleYear[1], 10) : null) });
    }
  }
  return out;
}

function cineSameTitle(title, info) {
  // El sitio a veces publica «título en español / título original».
  var variants = String(title || '').split(/\s+\/\s+/);
  for (var i = 0; i < variants.length; i++) {
    if (sameCatalogTitle(variants[i], info, false)) return true;
  }
  return false;
}

function cineSearch(info) {
  var queries = searchQueries(info).slice(0, 3);
  var index = 0;
  var found = [];
  function next() {
    if (index >= queries.length || found.some(function (item) {
      return !info.year || item.year === info.year;
    })) return Promise.resolve(found);
    var url = CINE_BASE + '/?s=' + encodeURIComponent(queries[index++]);
    return getText(url, { timeout: 7000, retries: 0, headers: { Referer: CINE_BASE + '/' } }).then(function (html) {
      var cards = cineCards(html);
      for (var i = 0; i < cards.length; i++) {
        var item = cards[i];
        if (item.isMovie !== !info.isTv || !cineSameTitle(item.title, info)) continue;
        // Distinguir, por ejemplo, la serie live action de un anime homónimo.
        if (info.year && item.year && info.year !== item.year) continue;
        found.push(item);
      }
      return next();
    });
  }
  return next().then(function () {
    return uniqueBy(found, function (item) { return item.url; }).sort(function (a, b) {
      return Number(b.year === info.year && !!b.year) - Number(a.year === info.year && !!a.year);
    });
  });
}

function cineDetailYear(html) {
  // DooPlay suele mostrar el estreno en .sheader .date. Encerrar ese bloque
  // evita confundir el año de un episodio o una recomendación con el de la
  // obra cuando la tarjeta de búsqueda no publica año.
  var text = String(html || '');
  var divs = /<\/?div\b[^>]*>/gi;
  var match;
  while ((match = divs.exec(text))) {
    if (/^<\//.test(match[0]) || !cineHasClass(match[0], 'sheader')) continue;
    var start = match.index;
    var depth = 1;
    var end = Math.min(text.length, start + 50000);
    while ((match = divs.exec(text)) && match.index < end) {
      if (/^<\//.test(match[0])) depth--;
      else if (!/\/\s*>$/.test(match[0])) depth++;
      if (depth === 0) return parseYear(cineClassText(text.slice(start, divs.lastIndex), 'date'));
    }
    return null;
  }
  return null;
}

function cineImdbMatches(html, info) {
  if (!info.imdbId) return true;
  var expected = String(info.imdbId).toLowerCase();
  var seen = [];
  var tags = /<a\b[^>]*>/gi;
  var match;
  while ((match = tags.exec(String(html || '')))) {
    var href = publicHttpUrl(attrOf(match[0], 'href'), CINE_BASE + '/');
    if (!href) continue;
    try {
      var parsed = new URL(href);
      if (!/^(?:www\.)?imdb\.com$/i.test(parsed.hostname)) continue;
      var id = /^\/title\/(tt\d{5,12})(?:\/|$)/i.exec(parsed.pathname);
      if (id) seen.push(id[1].toLowerCase());
    } catch (e) { /* enlace no válido */ }
  }
  return !seen.length || seen.indexOf(expected) !== -1;
}

/* Tomar únicamente un enlace de la lista de episodios de la ficha, no
 * construir su slug a partir del de la serie: el sitio no siempre coincide. */
function cineEpisodeUrl(html, seriesUrl, season, episode) {
  var text = String(html || '');
  var lower = text.toLowerCase();
  var lists = /<ul\b[^>]*>/gi;
  var list;
  var found = [];
  while ((list = lists.exec(text))) {
    if (!cineHasClass(list[0], 'episodios')) continue;
    var end = lower.indexOf('</ul', lists.lastIndex);
    if (end < 0) continue;
    var rows = /<li\b[^>]*>([\s\S]{0,12000}?)<\/li\s*>/gi;
    var part = text.slice(lists.lastIndex, end);
    var row;
    while ((row = rows.exec(part))) {
      var label = cineClassText(row[1], 'numerando');
      var numbers = /^\s*(\d{1,4})\s*(?:-|x|×)\s*(\d{1,4})\s*$/i.exec(label) ||
        /^\s*s\s*(\d{1,4})\s*e\s*(\d{1,4})\s*$/i.exec(label);
      var anchors = /<a\b[^>]*>/gi;
      var anchor;
      while ((anchor = anchors.exec(row[1]))) {
        var url = cineSiteUrl(attrOf(anchor[0], 'href'), seriesUrl, 'episode');
        if (!url) continue;
        var path = new URL(url).pathname;
        var fromPath = /-(\d{1,4})x(\d{1,4})\/?$/i.exec(path);
        if (numbers && fromPath && (Number(numbers[1]) !== Number(fromPath[1]) || Number(numbers[2]) !== Number(fromPath[2]))) continue;
        var coords = numbers || fromPath;
        if (coords && Number(coords[1]) === season && Number(coords[2]) === episode) found.push(url);
      }
    }
    lists.lastIndex = end + 4;
  }
  found = uniqueBy(found, function (item) { return item.replace(/\/$/, ''); });
  return found.length === 1 ? found[0] : null;
}

function cineOptions(html, isTv) {
  var text = String(html || '');
  var lower = text.toLowerCase();
  var lists = /<ul\b[^>]*>/gi;
  var list;
  while ((list = lists.exec(text))) {
    if (String(attrOf(list[0], 'id') || '').toLowerCase() !== 'playeroptionsul') continue;
    var end = lower.indexOf('</ul', lists.lastIndex);
    if (end < 0) return [];
    var part = text.slice(lists.lastIndex, end);
    var options = [];
    var postId = '';
    var rows = /<li\b[^>]*>([\s\S]{0,4000}?)<\/li\s*>/gi;
    var row;
    while ((row = rows.exec(part)) && options.length < 12) {
      var open = row[0].slice(0, row[0].indexOf('>') + 1);
      if (!cineHasClass(open, 'dooplay_player_option')) continue;
      var post = String(attrOf(open, 'data-post') || '');
      var nume = String(attrOf(open, 'data-nume') || '');
      var type = String(attrOf(open, 'data-type') || '').toLowerCase();
      if (!/^[1-9]\d{0,11}$/.test(post) || !/^[1-9]\d{0,2}$/.test(nume) || type !== (isTv ? 'tv' : 'movie')) continue;
      var label = cineClassText(row[1], 'title') || stripTags(row[1]);
      if (/\b(?:tr[aá]iler|anuncio|publicidad|advertisement)\b/i.test(label)) continue;
      if (!postId) postId = post;
      if (post !== postId) continue;
      options.push({ post: post, nume: nume, type: type,
        label: String(label || 'Opción ' + nume).slice(0, 100), language: languageLabel(label) || null });
    }
    return uniqueBy(options, function (item) { return item.post + ':' + item.type + ':' + item.nume; });
  }
  return [];
}

function cineOptionLinks(option, pageUrl) {
  // La API GET está publicada por este sitio; los parámetros proceden solo
  // de los botones válidos de la ficha o del episodio seleccionado.
  var api = CINE_BASE + '/wp-json/dooplayer/v2/' + option.post + '/' + option.type + '/' + option.nume;
  return getJson(api, { timeout: 6500, retries: 0, headers: { Referer: pageUrl, Accept: 'application/json' } }).then(function (data) {
    if (!data || typeof data.embed_url !== 'string' || !data.embed_url.trim() || /^tr[aá]iler$/i.test(String(data.type || ''))) return [];
    var raw = unescapePlayerText(data.embed_url).trim();
    var urls = [];
    if (raw.indexOf('<') !== -1) {
      var links = pagePlayerLinks(raw, pageUrl);
      for (var i = 0; i < links.length; i++) urls.push(links[i].url);
      urls = urls.concat(findDirectMedia(raw, pageUrl));
    } else if (/^(?:https?:\/\/|\/\/|\/)/i.test(raw)) {
      var direct = publicHttpUrl(raw, pageUrl);
      if (direct) urls.push(direct);
    }
    var seeds = [];
    for (var j = 0; j < urls.length; j++) {
      var url = publicHttpUrl(urls[j], pageUrl);
      if (!url || isPlayerAdvertisement(url)) continue;
      // DooPlay puede envolver un MP4 nativo en su propia página JWPlayer.
      // Solo se usa el parámetro si la API declara explícitamente tipo mp4.
      var parsed = new URL(url);
      var referer = pageUrl;
      if (data.type === 'mp4' && /^(?:www\.)?cineplus123\.org$/i.test(parsed.hostname) &&
          /^\/jwplayer\/?$/i.test(parsed.pathname)) {
        var source = directMediaUrl(publicHttpUrl(parsed.searchParams.get('source'), pageUrl));
        if (source && !isPlayerAdvertisement(source)) { referer = url; url = source; }
      }
      var host = new URL(url).hostname.replace(/^www\./i, '');
      seeds.push({ url: url, referer: referer, name: option.label + ' · ' + host, language: option.language });
    }
    return uniqueBy(seeds, function (item) { return item.url; });
  });
}

function cineReadPage(url, kind, referer) {
  return request(url, { timeout: 7000, retries: 0, pageOnly: true,
    headers: { Referer: referer || CINE_BASE + '/' } }).then(function (res) {
    if (!res.ok || !res.text) return null;
    var finalUrl = cineSiteUrl(res.url, url, kind);
    if (!finalUrl || new URL(finalUrl).pathname.replace(/\/$/, '') !== new URL(url).pathname.replace(/\/$/, '')) return null;
    return { url: finalUrl, html: res.text };
  });
}

function cineResolveOptions(page, info, publish) {
  var options = cineOptions(page.html, info.isTv);
  if (!options.length) return Promise.resolve([]);
  // Resolver cada opción independientemente permite entregar un enlace que
  // ya respondió sin esperar a que terminen todos los hosts lentos.
  return mapLimit(options, 4, function (option) {
    return cineOptionLinks(option, page.url).then(function (seeds) {
      return resolveDirectPlayers(seeds, { maxDepth: 4, maxPages: 4, concurrency: 2, onMedia: publish });
    });
  }).then(function (groups) {
    var results = [];
    for (var i = 0; i < groups.length; i++) if (groups[i]) results = results.concat(groups[i]);
    return results;
  });
}

function cineStream(info, item) {
  var title = info.title + (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
    (item.name ? ' · ' + item.name : '');
  return makeStream({ name: 'CinePlus123', title: title, provider: 'cineplus123', url: item.url,
    quality: parseQuality(title + ' ' + item.url), language: item.language, headers: item.headers, subtitles: item.subtitles });
}

function cineplus123GetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 || !Number.isInteger(info.episode) || info.episode < 1)) return [];
    var published = {};
    var publishedCount = 0;
    var maxPublished = Math.max(1, Math.min(20, parseInt(conf.maxResults, 10) || 8));
    function publish(item) {
      if (typeof HOSTED_PUBLISH_STREAM !== 'function' || publishedCount >= maxPublished || published[item.url]) return;
      published[item.url] = true;
      publishedCount++;
      HOSTED_PUBLISH_STREAM(cineStream(info, item));
    }
    return cineSearch(info).then(function (candidates) {
      return mapLimit(candidates.slice(0, 2), 2, function (candidate) {
        return cineReadPage(candidate.url, info.isTv ? 'series' : 'movie').then(function (page) {
          if (!page || !cineImdbMatches(page.html, info)) return [];
          var detailYear = cineDetailYear(page.html);
          if (info.year && detailYear && info.year !== detailYear) return [];
          if (!info.isTv) return cineResolveOptions(page, info, publish);
          var episodeUrl = cineEpisodeUrl(page.html, page.url, info.season, info.episode);
          if (!episodeUrl) return [];
          return cineReadPage(episodeUrl, 'episode', page.url).then(function (episodePage) {
            return episodePage ? cineResolveOptions(episodePage, info, publish) : [];
          });
        });
      }).then(function (groups) {
        var streams = [];
        for (var i = 0; i < groups.length; i++) {
          var results = groups[i] || [];
          for (var j = 0; j < results.length; j++) {
            streams.push(cineStream(info, results[j]));
          }
        }
        return finalizeStreams('CinePlus123', streams, { max: conf.maxResults });
      });
    });
  }).catch(function (error) { log('cineplus123', error && error.message || error); return []; });
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
function cineplusResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'CinePlus123' },
    { type: 'info', label: 'Solo HLS/MP4 directos. Las opciones protegidas o incompatibles se omiten.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] }
  ]);
}
module.exports = { getStreams: cineplus123GetStreams, resolveMeta: cineplusResolveMeta, onSettings: onSettings };
