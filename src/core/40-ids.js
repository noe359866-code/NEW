/* ------------------------------------------------------------------
 * Nébula Scrapers · core/ids
 * Formas de ID que envían los clientes (Stremio, Nuvio) → metadatos.
 *
 * Nuvio nombra los mismos títulos de varias formas:
 *   tt0944947:1:2      IMDb con temporada y episodio
 *   tmdb:1399:1:2      TMDB con temporada y episodio (y tmdb-1399, tmdb_1399, 1399)
 *   tvdb:121361:1:2    TheTVDB (no es consultable aquí: se convierte con Wikidata)
 *   kitsu:7442:1       anime (Kitsu)
 *   mal:21:1           anime (MyAnimeList)
 *   anilist:16498:1    anime (AniList)
 *   anidb:1:1          anime (AniDB)
 * Un ID con URL, esquema o demasiados segmentos no es un identificador de
 * catálogo y se rechaza antes de consultar ninguna fuente.
 * ------------------------------------------------------------------ */

var ID_KINDS = ['imdb', 'tmdb', 'tvdb', 'kitsu', 'mal', 'anilist', 'anidb'];
var ANIME_KINDS = ['kitsu', 'mal', 'anilist', 'anidb'];

/**
 * @returns {{type:'movie'|'series', season:number|null, episode:number|null,
 *            imdbId:string|null, tmdbId:string|null, tvdbId:string|null,
 *            anime:{site:string,id:string}|null}|null}
 */
function normalizeContentId(type, raw) {
  var kind = String(type || '').toLowerCase();
  var text = String(raw == null ? '' : raw).trim();
  if (!text || text.length > 200 || /[\/\\?#@\s]/.test(text)) return null;
  if (kind !== 'movie' && kind !== 'series' && kind !== 'tv' && kind !== 'anime') return null;
  var parts = text.split(':');
  if (parts.length > 4) return null;
  for (var i = 0; i < parts.length; i++) if (!parts[i]) return null;

  var head = parts[0].toLowerCase();
  var body = parts[1] || '';
  var tail = parts.slice(2);
  var result = {
    type: kind === 'movie' ? 'movie' : 'series',
    season: null, episode: null,
    imdbId: null, tmdbId: null, tvdbId: null, anime: null
  };

  if (/^tt\d{5,12}$/.test(head)) {
    result.imdbId = head;
  } else if (parts.length > 1 && ID_KINDS.indexOf(head) !== -1) {
    if (!/^\d{1,9}$/.test(body) || /^0+$/.test(body)) return null;
    if (head === 'imdb') return null;
    if (head === 'tmdb') result.tmdbId = body;
    else if (head === 'tvdb') result.tvdbId = body;
    else result.anime = { site: head, id: body };
  } else if (/^\d{1,9}$/.test(head) && !/^0+$/.test(head)) {
    result.tmdbId = head;
  } else {
    return null;
  }

  // Películas: sin temporada ni episodio. Series, TVDB y anime: exactamente
  // dos segmentos (o ninguno para una película de anime).
  if (result.type === 'movie') {
    if (tail.length) return null;
    return result;
  }
  // El cliente puede enviar el ID de contenido solo (la temporada y el
  // episodio llegan como argumentos aparte) o con «:temporada:episodio».
  if (!tail.length) return result;
  if (tail.length !== 2) return null;
  var season = Number(tail[0]);
  var episode = Number(tail[1]);
  if (!Number.isInteger(season) || !Number.isInteger(episode)) return null;
  if (season < 1 || season > 999 || episode < 1 || episode > 9999) return null;
  result.season = season;
  result.episode = episode;
  return result;
}

/** Edad mínima para mostrar: «tt0944947», «tmdb:1399», «kitsu:7442». */
function contentIdLabel(parsed) {
  if (!parsed) return '';
  if (parsed.imdbId) return parsed.imdbId;
  if (parsed.anime) return parsed.anime.site + ':' + parsed.anime.id;
  if (parsed.tmdbId) return 'tmdb:' + parsed.tmdbId;
  if (parsed.tvdbId) return 'tvdb:' + parsed.tvdbId;
  return '';
}

/* ------------------------- Wikidata (sin clave) ------------------------- */

/* Solo se consultan propiedades externas conocidas y el valor es siempre
 * numérico, así que la consulta no incorpora texto del cliente. */
function wikidataLookup(property, value) {
  if (!/^P\d{1,6}$/.test(String(property)) || !/^\d{1,9}$/.test(String(value))) return Promise.resolve(null);
  var query = 'SELECT ?imdb ?tmdb ?tvdb WHERE {' +
    ' ?item wdt:' + property + ' "' + value + '" .' +
    ' OPTIONAL { ?item wdt:P345 ?imdb }' +
    ' OPTIONAL { ?item wdt:P4983 ?tmdb }' +
    ' OPTIONAL { ?item wdt:P4835 ?tvdb }' +
    '} LIMIT 1';
  var url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);
  return getJson(url, { timeout: 9000, retries: 0, headers: { Accept: 'application/sparql-results+json' } })
    .then(function (data) {
      var rows = data && data.results && Array.isArray(data.results.bindings) ? data.results.bindings : [];
      if (!rows.length) return null;
      var row = rows[0];
      function text(key) { return row[key] && typeof row[key].value === 'string' ? row[key].value : ''; }
      var imdb = /^tt\d{5,12}$/i.test(text('imdb')) ? text('imdb').toLowerCase() : null;
      var tmdb = /^\d{1,9}$/.test(text('tmdb')) ? text('tmdb') : null;
      var tvdb = /^\d{1,9}$/.test(text('tvdb')) ? text('tvdb') : null;
      if (!imdb && !tmdb && !tvdb) return null;
      return { imdbId: imdb, tmdbId: tmdb, tvdbId: tvdb };
    }, function () { return null; });
}

/* -------------------------- Anime (sin clave) -------------------------- */

/* ani.zip reúne los IDs de cada anime (Kitsu, MAL, AniList, AniDB), sus
 * títulos y los episodios. La respuesta puede ser muy grande, así que se lee
 * con un límite de bytes propio; solo se usan títulos, año y si es película. */
function aniZipLookup(site, id) {
  var param = site === 'mal' ? 'mal_id' : site === 'kitsu' ? 'kitsu_id'
    : site === 'anilist' ? 'anilist_id' : site === 'anidb' ? 'anidb_id' : '';
  if (!param || !/^\d{1,9}$/.test(String(id))) return Promise.resolve(null);
  var url = 'https://api.ani.zip/mappings?' + param + '=' + id;
  return getTextLimited(url, 4000000, { timeout: 12000, retries: 0 }).then(function (text) {
    if (!text) return null;
    var data = null;
    try { data = JSON.parse(text); } catch (e) { return null; }
    if (!data || typeof data !== 'object') return null;
    var titles = data.titles && typeof data.titles === 'object' ? data.titles : {};
    var names = [];
    var order = ['es', 'es-419', 'es-CA', 'en', 'x-jat', 'ja', 'pt-BR', 'fr', 'it'];
    for (var i = 0; i < order.length; i++) {
      if (typeof titles[order[i]] === 'string' && titles[order[i]]) names.push(titles[order[i]].trim());
    }
    var episodes = data.episodes && typeof data.episodes === 'object' ? data.episodes : {};
    var first = episodes['1'] || episodes[1] || null;
    var year = null;
    if (first && typeof first.airDate === 'string') {
      var match = /^(\d{4})/.exec(first.airDate);
      if (match) year = parseInt(match[1], 10);
    }
    return {
      titles: names.filter(function (value, index, all) { return value && all.indexOf(value) === index; }),
      year: year,
      isMovie: !first || !first.seasonNumber,
      tvdbId: first && /^\d{1,9}$/.test(String(first.tvdbShowId || '')) ? String(first.tvdbShowId) : null
    };
  }, function () { return null; });
}

/**
 * Metadatos buscables para un ID de anime. `isTv` se decide por los episodios
 * publicados; el número de episodio lo aporta el cliente y estos sitios usan
 * numeración continua, así que no se recalcula.
 */
function resolveAnimeMedia(parsed) {
  if (!parsed || !parsed.anime) return Promise.resolve(null);
  return aniZipLookup(parsed.anime.site, parsed.anime.id).then(function (info) {
    if (!info || !info.titles.length) return null;
    var isTv = info.isMovie !== true;
    var pending = info.tvdbId && isTv ? wikidataLookup('P4835', info.tvdbId) : Promise.resolve(null);
    return pending.then(function (ids) {
      var extra = ids || {};
      return {
        id: contentIdLabel(parsed),
        tmdbId: extra.tmdbId || null,
        imdbId: extra.imdbId || null,
        isTv: isTv,
        season: isTv ? parsed.season : null,
        episode: isTv ? parsed.episode : null,
        title: info.titles[0],
        originalTitle: info.titles[0],
        year: info.year || null,
        titles: info.titles,
        seasons: []
      };
    });
  });
}

/**
 * Punto único que usan los providers: convierte el ID ya normalizado en los
 * metadatos que necesitan las búsquedas, sea IMDb, TMDB, TVDB o anime.
 */
function resolveRequestMedia(parsed) {
  if (!parsed) return Promise.resolve(null);
  if (parsed.anime) return resolveAnimeMedia(parsed);
  if (parsed.tvdbId) {
    return wikidataLookup('P4835', parsed.tvdbId).then(function (ids) {
      var target = ids && (ids.imdbId || ids.tmdbId);
      if (!target) return null;
      return resolveMedia(target, 'series', parsed.season, parsed.episode);
    });
  }
  return resolveMedia(contentIdLabel(parsed), parsed.type, parsed.season, parsed.episode);
}
