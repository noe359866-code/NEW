/* ------------------------------------------------------------------
 * Nébula Scrapers · core/tmdb
 * De id de TMDB (lo único que entrega Nuvio) a títulos buscables.
 *
 * Orden de resolución:
 *   1. id IMDb (tt…)  -> Cinemeta
 *   2. TMDB API       -> global TMDB_API_KEY que inyecta Nuvio
 *   3. themoviedb.org -> lectura del <title>/og:title (sin clave)
 * ------------------------------------------------------------------ */

function cleanContentId(rawId) {
  var id = String(rawId == null ? '' : rawId).trim();
  if (!id) return '';
  var prefixed = /^tmdb[:_-](\d+)/i.exec(id);
  if (prefixed) return prefixed[1];
  var imdb = /(tt\d{5,})/i.exec(id);
  if (imdb) return imdb[1];
  var numeric = /(\d+)/.exec(id);
  return numeric ? numeric[1] : id.split(':')[0];
}

function tmdbApiKey() {
  var fromGlobal = typeof TMDB_API_KEY !== 'undefined' && typeof TMDB_API_KEY === 'string' ? TMDB_API_KEY.trim() : '';
  if (fromGlobal) return fromGlobal;
  var conf = settings({ tmdbKey: '' });
  return conf.tmdbKey ? String(conf.tmdbKey).trim() : '';
}

function titleFromHtml(html) {
  var raw = metaContent(html, 'og:title') || '';
  if (!raw) {
    var titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ''));
    raw = titleTag ? stripTags(titleTag[1]) : '';
  }
  if (!raw) return null;
  var clean = raw.split('—').join('|').split('|')[0].replace(/\s*\(\d{4}\)\s*$/, '').trim();
  var year = parseYear(raw);
  return clean ? { title: clean, year: year } : null;
}

/** Cinemeta: metadatos de IMDb sin clave. Una sola tentativa: si el host no
 * responde, la resolución sigue por la ficha pública de IMDb. */
function cinemetaRequest(id, type) {
  return request('https://v3-cinemeta.strem.io/meta/' + type + '/' + encodeURIComponent(id) + '.json',
    { timeout: 7000, retries: 0 })
    .then(function (res) {
      if (!res || !res.ok) return null;
      var parsed = null;
      try { parsed = JSON.parse(res.text); } catch (e) { return null; }
      var meta = parsed && parsed.meta;
      if (!meta) return null;
      // Cinemeta publica el id de TMDB: sirve para no depender de la página
      // pública (que responde 403 al servidor) al resolver un título.
      var tmdbId = /^\d{1,9}$/.test(String(meta.moviedb_id || meta.themoviedb_id || ''))
        ? String(meta.moviedb_id || meta.themoviedb_id) : null;
      return {
        tmdbId: tmdbId,
        imdbId: id,
        isTv: meta.type === 'series',
        title: meta.name || meta.original_name || '',
        originalTitle: meta.original_name || meta.name || '',
        // Las series de Cinemeta no siempre traen `year`: el año sale de
        // `releaseInfo` («2017–2021») para las búsquedas «título año».
        year: meta.year ? parseInt(String(meta.year).slice(0, 4), 10) : parseYear(meta.releaseInfo || ''),
        titles: [meta.name, meta.original_name].filter(Boolean)
      };
    }, function () { return null; });
}

/** Título deducido del slug de IMDb: /title/tt0816692/ → /title/tt0816692/interstellar.
 * Evita quedarse sin ninguna consulta cuando Cinemeta y TMDB no responden. */
function imdbSlugTitle(id) {
  return request('https://www.imdb.com/title/' + encodeURIComponent(id) + '/',
    { timeout: 8000, retries: 0, redirect: 'manual' }).then(function (res) {
    var location = res && res.headers && res.headers.get ? res.headers.get('location') : '';
    var match = /\/title\/tt\d{5,12}\/([a-z0-9-]{2,80})\/?/i.exec(location || '');
    if (!match) return null;
    var raw = match[1];
    var state = /(\d{4})$/.exec(raw);
    var title = raw.replace(/-\d{4}$/, '').replace(/-/g, ' ').trim();
    if (!title || !/[a-z]/i.test(title)) return null;
    title = title.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return {
      tmdbId: null, imdbId: id, isTv: null,
      title: title, originalTitle: title,
      year: state ? parseInt(state[1], 10) : null,
      titles: [title]
    };
  }, function () { return null; });
}

/**
 * Cinemeta devuelve el título internacional ("Money Heist") y los sitios
 * hispanos catalogan el suyo ("La casa de papel"). Con `TMDB_API_KEY` los
 * títulos localizados salen de la API de TMDB; sin clave se piden a Wikidata,
 * que sí responde a las IP de los servidores. El título en español se coloca
 * primero: los buscadores de las fuentes prueban `title` antes que el resto
 * y es el nombre que ve el cliente en las etiquetas.
 */
function withWikidataTitles(meta, imdbId, isTv) {
  return wikidataTitlesByImdb(imdbId).then(function (found) {
    if (!found) return meta;
    if (!meta || !meta.title) {
      return {
        tmdbId: null,
        imdbId: imdbId,
        isTv: isTv,
        title: found.esTitle || found.titles[0],
        originalTitle: meta && meta.originalTitle || found.titles[found.titles.length - 1] || '',
        year: meta && meta.year || null,
        titles: found.titles,
        seasons: meta && meta.seasons || []
      };
    }
    var merged = found.titles.slice();
    var known = meta.titles && meta.titles.length ? meta.titles : [meta.title, meta.originalTitle];
    for (var i = 0; i < known.length; i++) {
      if (known[i] && merged.indexOf(known[i]) === -1) merged.push(known[i]);
    }
    meta.titles = merged;
    if (found.esTitle) meta.title = found.esTitle;
    return meta;
  }, function () { return meta; });
}

function resolveImdb(id, isTv) {
  var type = isTv ? 'series' : 'movie';
  return cinemetaRequest(id, type).then(function (meta) {
    if (meta && meta.title) return meta;
    return imdbSlugTitle(id);
  }).then(function (meta) {
    return withWikidataTitles(meta, id, isTv);
  });
}

function resolveFromApi(id, mediaType) {
  var key = tmdbApiKey();
  if (!key) return Promise.resolve(null);
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  var base = 'https://api.themoviedb.org/3/' + type + '/' + encodeURIComponent(id);
  var esUrl = base + '?api_key=' + encodeURIComponent(key) + '&language=es-ES';
  var enUrl = base + '?api_key=' + encodeURIComponent(key) + '&language=en-US';

  return Promise.all([getJson(esUrl), getJson(enUrl)]).then(function (results) {
    var es = results[0];
    var en = results[1];
    if (!es && !en) return null;
    var primary = es || en;
    var secondary = en || es;
    var title = (type === 'tv' ? primary.name : primary.title) || '';
    var original = primary.original_title || primary.original_name || '';
    var alt = (type === 'tv' ? secondary.name : secondary.title) || '';
    var date = primary.release_date || primary.first_air_date || secondary.release_date || secondary.first_air_date || '';
    return {
      tmdbId: String(id),
      imdbId: primary.imdb_id || null,
      isTv: type === 'tv',
      title: title,
      originalTitle: original || title,
      year: date ? parseInt(String(date).slice(0, 4), 10) : null,
      titles: [title, original, alt].filter(function (value, index, arr) {
        return value && arr.indexOf(value) === index;
      }),
      seasons: type === 'tv' && Array.isArray(primary.seasons) ? primary.seasons : []
    };
  });
}

/* Para IDs IMDb, TMDB añade títulos localizados y los recuentos de las
 * temporadas, necesarios para algunos animes con numeración continua. */
function resolveImdbFromApi(imdbId, isTv) {
  var key = tmdbApiKey();
  if (!key) return Promise.resolve(null);
  var url = 'https://api.themoviedb.org/3/find/' + encodeURIComponent(imdbId) +
    '?api_key=' + encodeURIComponent(key) + '&external_source=imdb_id';
  return getJson(url, { timeout: 9000, retries: 0 }).then(function (result) {
    var matches = result && result[isTv ? 'tv_results' : 'movie_results'];
    var id = Array.isArray(matches) && matches[0] && String(matches[0].id || '');
    if (!id || !/^\d+$/.test(id)) return null;
    return resolveFromApi(id, isTv ? 'tv' : 'movie');
  });
}

function mergeImdbMetadata(imdb, tmdb, imdbId) {
  if (!tmdb) return imdb;
  var titles = (tmdb.titles || []).concat(imdb && imdb.titles || []);
  return {
    tmdbId: tmdb.tmdbId,
    imdbId: imdbId,
    isTv: tmdb.isTv,
    title: tmdb.title || imdb && imdb.title || '',
    originalTitle: tmdb.originalTitle || imdb && imdb.originalTitle || '',
    year: tmdb.year || imdb && imdb.year || null,
    titles: titles.filter(function (value, index, all) { return value && all.indexOf(value) === index; }),
    seasons: tmdb.seasons || []
  };
}

function webResult(id, type, title, year, imdbId) {
  if (!title) return null;
  return {
    tmdbId: String(id),
    imdbId: imdbId || null,
    isTv: type === 'tv',
    title: title,
    originalTitle: title,
    year: year || null,
    titles: [title],
    seasons: []
  };
}

/* Sin TMDB_API_KEY la página pública suele bloquear al servidor. Primero se
 * intenta la redirección corta, que expone el título en la URL
 * (/movie/157336-interstellar), y después Wikidata, que no pide clave. */
function slugTitle(slug) {
  // El slug de TMDB empieza por el propio ID («157336-interstellar»): se quita
  // para no buscar «157336 Interstellar».
  var text = String(slug || '').replace(/^\d+-/, '').replace(/-\d{3,}$/, '').replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); }).trim();
  return text && /[a-z]/i.test(text) && text.length <= 160 ? text : '';
}

function resolveFromWeb(id, mediaType) {
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  var found = null;

  function page() {
    return getText('https://www.themoviedb.org/' + type + '/' + encodeURIComponent(id), { timeout: 9000 })
      .then(function (html) {
        if (!html) return null;
        var info = titleFromHtml(html);
        if (!info) return null;
        var imdb = /\/(?:imdb|title)\/(tt\d{5,12})/i.exec(html);
        return webResult(id, type, info.title, info.year, imdb ? imdb[1].toLowerCase() : null);
      }, function () { return null; });
  }

  function redirectedSlug() {
    // La ficha corta redirige a /movie/157336-interstellar.
    return request('https://www.themoviedb.org/' + type + '/' + encodeURIComponent(id),
      { timeout: 9000, retries: 0, redirect: 'manual' }).then(function (res) {
      var location = res && res.headers && res.headers.get ? res.headers.get('location') : '';
      var slug = /^https?:\/\/www\.themoviedb\.org\/(?:movie|tv)\/[0-9]+-([a-z0-9-]+)\/?$/i.exec(location || '');
      var fromSlug = slug ? slugTitle(slug[1]) : '';
      return fromSlug ? webResult(id, type, fromSlug, parseYear(location), null) : null;
    }, function () { return null; });
  }

  function fromWikidata(property) {
    // Wikidata solo aporta IDs; el título sale de IMDb o de TVMaze.
    if (typeof wikidataLookup !== 'function') return Promise.resolve(null);
    return Promise.resolve(wikidataLookup(property, id)).then(function (ids) {
      if (!ids) return null;
      if (ids.imdbId) {
        return resolveImdb(ids.imdbId, type === 'tv').then(function (imdb) {
          return imdb && imdb.title ? webResult(id, type, imdb.title, imdb.year, ids.imdbId) : null;
        }, function () { return null; });
      }
      if (ids.tvdbId) {
        return getJson('https://api.tvmaze.com/lookup/shows?thetvdb=' + ids.tvdbId, { timeout: 8000, retries: 0 })
          .then(function (show) {
            if (show && show.name) return webResult(id, type, String(show.name).slice(0, 200), parseYear(show.premiered || ''), null);
            return ids.title ? webResult(id, type, String(ids.title).slice(0, 200), ids.year || null, null) : null;
          }, function () { return null; });
      }
      // Sin IMDb ni TVMaze queda el título original de la ficha, que es el
      // que usan estos sitios cuando la clave de TMDB no está configurada.
      if (ids.title) return webResult(id, type, String(ids.title).slice(0, 200), ids.year || null, null);
      return null;
    }, function () { return null; });
  }

  return page().then(function (result) {
    if (result) { found = result; return null; }
    return redirectedSlug().then(function (shortResult) {
      if (shortResult) found = shortResult;
      return null;
    });
  }).then(function () {
    if (found) return found;
    // La misma cifra puede estar declarada como película o como serie; se
    // prueban las dos propiedades porque el tipo del cliente no siempre
    // coincide con el de Wikidata (Nuvio llama «tv» a series de TMDB).
    var properties = type === 'tv' ? ['P4983', 'P4947'] : ['P4947', 'P4983'];
    return fromWikidata(properties[0]).then(function (result) {
      return result || fromWikidata(properties[1]);
    });
  });
}

/**
 * @param {string} rawId id de TMDB (o IMDb) que entrega Nuvio
 * @param {string} mediaType "movie" | "tv" | "series"
 * @param {number|null} season
 * @param {number|null} episode
 */
function resolveMedia(rawId, mediaType, season, episode) {
  var id = cleanContentId(rawId);
  var isTv = typeof isSeriesLikeType === 'function'
    ? isSeriesLikeType(mediaType) || season != null
    : mediaType === 'tv' || mediaType === 'series' || season != null;
  var info = {
    id: id,
    tmdbId: /^\d+$/.test(id) ? id : null,
    imdbId: /^tt\d+$/i.test(id) ? id : null,
    isTv: isTv,
    season: season == null ? null : parseInt(season, 10),
    episode: episode == null ? null : parseInt(episode, 10),
    title: '',
    originalTitle: '',
    year: null,
    titles: [],
    seasons: []
  };

  var resolver;
  if (info.imdbId) {
    resolver = Promise.all([resolveImdb(info.imdbId, info.isTv), resolveImdbFromApi(info.imdbId, info.isTv)])
      .then(function (results) { return mergeImdbMetadata(results[0], results[1], info.imdbId); });
  } else if (info.tmdbId) {
    resolver = resolveFromApi(info.tmdbId, isTv ? 'tv' : 'movie').then(function (result) {
      if (result) return result;
      return resolveFromWeb(info.tmdbId, isTv ? 'tv' : 'movie');
    });
  } else {
    resolver = Promise.resolve(null);
  }

  return resolver.then(function (meta) {
    if (!meta) return info;
    info.title = meta.title || '';
    info.originalTitle = meta.originalTitle || meta.title || '';
    info.year = meta.year || null;
    info.titles = meta.titles && meta.titles.length ? meta.titles : [info.title].filter(Boolean);
    info.seasons = Array.isArray(meta.seasons) ? meta.seasons : [];
    if (meta.imdbId) info.imdbId = meta.imdbId;
    if (meta.tmdbId) info.tmdbId = meta.tmdbId;
    if (meta.isTv != null) info.isTv = meta.isTv;
    return info;
  });
}

/** Consultas de búsqueda ordenadas por probabilidad de éxito. */
function searchQueries(info) {
  var list = [];
  if (!info) return list;
  var year = info.year ? String(info.year) : '';
  if (info.title) list.push(info.title);
  if (info.originalTitle && info.originalTitle !== info.title) list.push(info.originalTitle);
  if (Array.isArray(info.titles)) {
    for (var i = 0; i < info.titles.length; i++) if (info.titles[i]) list.push(info.titles[i]);
  }
  if (year && info.title) list.push(info.title + ' ' + year);
  if (info.title) {
    // el título sin artículos suele ayudar en buscadores simples
    list.push(info.title.replace(/^(el|la|los|las|the)\s+/i, ''));
  }
  return list.filter(function (value, index, arr) {
    return value && value.length > 1 && arr.indexOf(value) === index;
  });
}
