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

function resolveImdb(id) {
  var isTv = false;
  return request('https://v3-cinemeta.strem.io/meta/movie/' + encodeURIComponent(id) + '.json', { timeout: 9000 })
    .then(function (movieRes) {
      if (movieRes.ok && movieRes.text && movieRes.text.indexOf('"meta"') !== -1) return movieRes;
      isTv = true;
      return request('https://v3-cinemeta.strem.io/meta/series/' + encodeURIComponent(id) + '.json', { timeout: 9000 });
    })
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
      })
    };
  });
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
    titles: []
  };

  var resolver;
  if (info.imdbId) {
    resolver = resolveImdb(info.imdbId);
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
  if (year && info.title) list.push(info.title + ' ' + year);
  if (info.title) {
    // el título sin artículos suele ayudar en buscadores simples
    list.push(info.title.replace(/^(el|la|los|las|the)\s+/i, ''));
  }
  return list.filter(function (value, index, arr) {
    return value && value.length > 1 && arr.indexOf(value) === index;
  });
}
