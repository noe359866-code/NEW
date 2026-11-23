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

/* Wikidata entrega los enlaces externos de una ficha (IMDb, TMDB, TheTVDB)
 * sin clave de API. Se usa la Action API y no el servicio SPARQL porque
 * query.wikidata.org responde 403 a las IP de los servidores (política de
 * Wikimedia), mientras que www.wikidata.org/w/api.php responde con normalidad.
 *
 * Solo se consultan propiedades externas conocidas y el valor es siempre
 * numérico, así que la URL no incorpora texto del cliente. `cache` evita
 * repetir la misma pareja en una misma solicitud del addon. */
var WIKIDATA_PROPERTIES = {
  // IMDb → TMDB (temporada/serie) y TMDB → IMDb
  P345: 'imdb', P4947: 'tmdbMovie', P4983: 'tmdbTv',
  // TheTVDB (los sitios hispanos etiquetan el tipo por su cuenta)
  P4835: 'tvdb',
  // Título original y fecha: son los títulos del buscador de cada sitio
  P1476: 'title', P577: 'date'
};

function wikidataEntitySearch(property, value) {
  // haswbstatement es una palabra clave de búsqueda de CirrusSearch: devuelve
  // la ficha que declara esa propiedad con ese valor exacto.
  var url = 'https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=' +
    encodeURIComponent('haswbstatement:' + property + '=' + value) +
    '&srlimit=1&srnamespace=0&format=json';
  return getJson(url, { timeout: 8000, retries: 0, headers: { Accept: 'application/json' } })
    .then(function (data) {
      var hits = data && data.query && Array.isArray(data.query.search) ? data.query.search : [];
      var title = hits.length && hits[0] && /^Q\d{1,9}$/.test(String(hits[0].title)) ? String(hits[0].title) : '';
      return title || null;
    }, function () { return null; });
}

function wikidataClaims(entity) {
  if (!/^Q\d{1,9}$/.test(String(entity))) return Promise.resolve(null);
  var properties = Object.keys(WIKIDATA_PROPERTIES).join('|');
  var url = 'https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=' + entity +
    '&property=' + properties + '&format=json';
  return getJson(url, { timeout: 8000, retries: 0, headers: { Accept: 'application/json' } })
    .then(function (data) {
      var claims = data && data.claims && typeof data.claims === 'object' ? data.claims : null;
      if (!claims) return null;
      var out = { imdbId: null, tmdbId: null, tvdbId: null, title: null, year: null };
      for (var property in WIKIDATA_PROPERTIES) {
        if (!Object.prototype.hasOwnProperty.call(claims, property)) continue;
        var statements = Array.isArray(claims[property]) ? claims[property] : [];
        for (var i = 0; i < statements.length; i++) {
          var snak = statements[i] && statements[i].mainsnak;
          var value = snak && snak.datavalue && snak.datavalue.value;
          var name = WIKIDATA_PROPERTIES[property];
          var raw = typeof value === 'string' ? value : '';
          if (name === 'imdb' && /^tt\d{5,12}$/i.test(raw)) out.imdbId = out.imdbId || raw.toLowerCase();
          else if (name === 'tvdb' && /^\d{1,9}$/.test(raw)) out.tvdbId = out.tvdbId || raw;
          // La misma cifra puede ser de película o de serie: se acepta como
          // id de TMDB y el llamador decide si le sirve.
          else if ((name === 'tmdbMovie' || name === 'tmdbTv') && /^\d{1,9}$/.test(raw)) out.tmdbId = out.tmdbId || raw;
          // P1476 es un monolingüe: { text, language }. Se prefiere el título
          // en español, porque es el idioma del catálogo de estos sitios.
          else if (name === 'title') {
            var text = value && typeof value.text === 'string' ? value.text.trim() : '';
            var language = value && typeof value.language === 'string' ? value.language : '';
            if (text && text.length <= 160 && !out.title) out.title = text;
            else if (text && text.length <= 160 && /^es/i.test(language) && !/^es/i.test(out.titleLang || '')) {
              out.title = text;
              out.titleLang = language;
            }
            if (/^es/i.test(language)) out.titleLang = language;
          }
          // P577 es la fecha de publicación: { time: '+2011-04-17T00:00:00Z' }.
          else if (name === 'date' && value && typeof value.time === 'string') {
            var year = parseInt(String(value.time).replace(/^[+-]/, '').slice(0, 4), 10);
            if (year > 1800 && year < 2200) out.year = out.year || year;
          }
        }
      }
      delete out.titleLang;
      return out.imdbId || out.tmdbId || out.tvdbId || out.title ? out : null;
    }, function () { return null; });
}

function wikidataLookup(property, value) {
  if (!Object.prototype.hasOwnProperty.call(WIKIDATA_PROPERTIES, String(property))) return Promise.resolve(null);
  if (!/^\d{1,9}$/.test(String(value))) return Promise.resolve(null);
  return wikidataEntitySearch(property, value).then(function (entity) {
    return entity ? wikidataClaims(entity) : null;
  }, function () { return null; });
}

/* Títulos localizados de una ficha IMDb (labels y aliases de Wikidata).
 * Cinemeta solo publica el título internacional ("Money Heist") y los sitios
 * hispanos catalogan el suyo ("La casa de papel"): sin la clave de TMDB esta
 * es la única fuente de títulos en español para los IDs tt… que envía
 * Stremio. Se pide es|en y el español se coloca primero porque es el idioma
 * del catálogo de estas fuentes. */
function wikidataTitlesByImdb(imdbId) {
  var id = /^tt\d{5,12}$/i.test(String(imdbId || '')) ? String(imdbId).toLowerCase() : '';
  if (!id) return Promise.resolve(null);
  return wikidataEntitySearch('P345', id).then(function (entity) {
    if (!entity) return null;
    var url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' + entity +
      '&props=labels|aliases&languages=es|en&format=json';
    return getJson(url, { timeout: 8000, retries: 0, headers: { Accept: 'application/json' } })
      .then(function (data) {
        var record = data && data.entities && data.entities[entity];
        var labels = record && record.labels;
        var aliases = record && record.aliases;
        var titles = [];
        var esTitle = '';
        function take(language, value) {
          var text = typeof value === 'string' ? value.trim() : '';
          if (!text || text.length > 160 || /[\x00-\x1f\x7f]/.test(text)) return;
          if (language === 'es' && !esTitle) esTitle = text;
          if (titles.indexOf(text) === -1 && titles.length < 8) titles.push(text);
        }
        // El label en español primero y después los alias: los buscadores
        // prueban las variantes por este orden.
        if (labels && labels.es) take('es', labels.es.value);
        if (aliases && Array.isArray(aliases.es)) {
          for (var i = 0; i < aliases.es.length; i++) take('es', aliases.es[i] && aliases.es[i].value);
        }
        if (labels && labels.en) take('en', labels.en.value);
        if (aliases && Array.isArray(aliases.en)) {
          for (var j = 0; j < aliases.en.length; j++) take('en', aliases.en[j] && aliases.en[j].value);
        }
        return titles.length ? { titles: titles, esTitle: esTitle } : null;
      }, function () { return null; });
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
/** Ficha mínima cuando Wikidata solo da el título (sin IMDb ni TMDB): esos
 * sitios buscan por nombre, así que todavía se pueden encontrar enlaces. */
function mediaFromWikidata(ids, parsed) {
  var title = ids && ids.title ? String(ids.title).slice(0, 200) : '';
  return {
    id: contentIdLabel(parsed),
    tmdbId: ids && ids.tmdbId || null,
    imdbId: ids && ids.imdbId || null,
    isTv: parsed.type === 'series',
    season: parsed.season,
    episode: parsed.episode,
    title: title,
    originalTitle: title,
    year: ids && ids.year || null,
    titles: title ? [title] : [],
    seasons: []
  };
}

function resolveRequestMedia(parsed) {
  if (!parsed) return Promise.resolve(null);
  if (parsed.anime) return resolveAnimeMedia(parsed);
  if (parsed.tvdbId) {
    return wikidataLookup('P4835', parsed.tvdbId).then(function (ids) {
      if (!ids) return null;
      var target = ids.imdbId || ids.tmdbId;
      if (!target) return mediaFromWikidata(ids, parsed);
      return resolveMedia(target, 'series', parsed.season, parsed.episode).then(function (info) {
        // El título de la ficha sirve cuando IMDb/TMDB no responden.
        if (info && !info.title && ids.title) {
          info.title = String(ids.title).slice(0, 200);
          info.titles = [info.title];
          info.year = info.year || ids.year || null;
        }
        return info;
      });
    });
  }
  return resolveMedia(contentIdLabel(parsed), parsed.type, parsed.season, parsed.episode);
}
