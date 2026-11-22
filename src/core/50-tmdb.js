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

function resolveImdb(id, isTv) {
  var type = isTv ? 'series' : 'movie';
  return request('https://v3-cinemeta.strem.io/meta/' + type + '/' + encodeURIComponent(id) + '.json', { timeout: 9000 })
    .then(function (res) {
      if (!res || !res.ok) return null;
      var parsed = null;
      try { parsed = JSON.parse(res.text); } catch (e) { return null; }
      var meta = parsed && parsed.meta;
      if (!meta) return null;
      return {
        tmdbId: null,
        imdbId: id,
        isTv: isTv || meta.type === 'series',
        title: meta.name || meta.original_name || '',
        originalTitle: meta.original_name || meta.name || '',
        year: meta.year ? parseInt(String(meta.year).slice(0, 4), 10) : null,
        titles: [meta.name, meta.original_name].filter(Boolean)
      };
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

function resolveFromWeb(id, mediaType) {
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  return getText('https://www.themoviedb.org/' + type + '/' + encodeURIComponent(id), { timeout: 9000 })
    .then(function (html) {
      if (!html) return null;
      var info = titleFromHtml(html);
      if (!info) return null;
      return {
        tmdbId: String(id),
        imdbId: null,
        isTv: type === 'tv',
        title: info.title,
        originalTitle: info.title,
        year: info.year,
        titles: [info.title]
      };
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
  var isTv = mediaType === 'tv' || mediaType === 'series' || season != null;
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
