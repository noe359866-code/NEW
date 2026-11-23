/*__CORE__*/

/* FrikiSeries (www.frikiserie.com): Angular 18 con generación estática.
 *
 * Lo reconocido con tools/probe-sites.js (2026-11):
 *  - El sitio no tiene HTML de fichas: el catálogo y los datos del título viven
 *    en <script id="ng-state" type="application/json">, con campos
 *    { titulo, slug, totalCapitulos, fecha, imagen, descripcion, video, tipo,
 *      irAListaVideo }.
 *  - Las fichas son /ver-serie/<slug> (series) y /ver-pelicula/<slug>
 *    (películas). El campo `video` es un embed de OK.ru
 *    (https://ok.ru/videoembed/<id>); cuando vale "xxxx" el enlace real no está
 *    en el estado y no hay nada que entregar para ese título.
 *  - Un mismo enlace de OK.ru puede cubrir todos los capítulos publicados de la
 *    serie: en ese caso se entrega así y se advierte en el título. Cuando la
 *    ficha trae varios enlaces, se elige el que corresponde al capítulo pedido.
 *  - OK.ru publica los MP4 y el manifiesto HLS dentro de su propio reproductor
 *    (data-options → flashvars.metadata → videos/hlsManifestUrl); se extraen sin
 *    ejecutar JavaScript. Si el vídeo es privado o no tiene enlace directo, el
 *    título se queda sin resultados en lugar de entregar el iframe.
 *  - El doblaje del catálogo es latino, así que los resultados se etiquetan como
 *    «Latino» salvo que el propio título declare otro idioma. */

var FRIKISERIE_BASE = 'https://www.frikiserie.com';

function frikiserieSiteUrl(value, base) {
  var url = publicHttpUrl(value, base || FRIKISERIE_BASE + '/');
  if (!url) return null;
  try {
    var parsed = new URL(url);
    var host = String(parsed.hostname || '').toLowerCase();
    if (parsed.protocol !== 'https:' || (host !== 'frikiserie.com' && host !== 'www.frikiserie.com')) return null;
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  } catch (e) { return null; }
}

/** El estado de Angular: un JSON grande con todo lo que la vista necesita. */
function frikiState(html) {
  var text = String(html || '');
  var match = /<script\b[^>]*id=["']ng-state["'][^>]*>([\s\S]*?)<\/script>/i.exec(text);
  if (!match) return null;
  var raw = match[1].trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/** Recorre el estado y devuelve los objetos con forma de ficha de catálogo. */
function frikiEntries(state) {
  var out = [];
  var seen = {};
  var queue = [state];
  var visited = 0;
  while (queue.length && visited < 60000 && out.length < 4000) {
    var node = queue.shift();
    visited++;
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) queue.push(node[i]);
      continue;
    }
    if (typeof node.titulo === 'string' && typeof node.slug === 'string') {
      var key = node.slug + '|' + node.titulo;
      if (!seen[key]) {
        seen[key] = true;
        out.push({
          titulo: node.titulo,
          slug: node.slug,
          totalCapitulos: parseInt(node.totalCapitulos, 10) || 0,
          fecha: String(node.fecha == null ? '' : node.fecha),
          video: typeof node.video === 'string' ? node.video : '',
          tipo: String(node.tipo || ''),
          lista: node.irAListaVideo === true
        });
      }
    }
    for (var prop in node) {
      if (!Object.prototype.hasOwnProperty.call(node, prop)) continue;
      var value = node[prop];
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return out;
}

function frikiYear(value) {
  var match = /(19|20)\d{2}/.exec(String(value || ''));
  return match ? parseInt(match[0], 10) : null;
}

function frikiScore(entry, info) {
  var titles = info.titles && info.titles.length ? info.titles : [info.title, info.originalTitle];
  var score = 0;
  for (var i = 0; i < titles.length; i++) {
    if (!titles[i]) continue;
    score = Math.max(score, titleScore(entry.titulo, titles[i]));
  }
  // El catálogo añade sufijos («- Temporada 1, 2 y 3», año): no penalizan.
  if (score < 0.9 && info.title && new RegExp('^' + String(info.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(entry.titulo)) {
    score = Math.max(score, 0.92);
  }
  var year = frikiYear(entry.fecha);
  if (info.year && year && Math.abs(info.year - year) === 0) score += 0.05;
  if (info.isTv && /pel[ií]cula/i.test(entry.tipo)) score -= 0.4;
  return score;
}

/** Ficha del catálogo cuyo slug corresponde al título pedido. */
function frikiPick(entries, info) {
  var best = null;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.video || entry.video === 'xxxx') continue;
    if (!/ok\.ru\/videoembed\/[0-9]+/i.test(entry.video) && !/^https?:\/\//.test(entry.video)) continue;
    var score = frikiScore(entry, info);
    if (score < 0.72) continue;
    if (!best || score > best.score) {
      best = { entry: entry, score: score };
      best.entry.score = score;
    }
  }
  return best ? best.entry : null;
}

function frikiserieReadPage(url) {
  return request(url, { timeout: 10000, retries: 0, pageOnly: true,
    headers: { Referer: FRIKISERIE_BASE + '/' } }).then(function (res) {
    if (!res.ok || !res.text) return null;
    return { url: res.url || url, html: res.text };
  }, function () { return null; });
}

function frikiserieGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '6' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info || !info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];

    // El catálogo completo está en el estado de la portada; así se obtiene el
    // slug sin depender de un buscador que el sitio no expone.
    return frikiserieReadPage(FRIKISERIE_BASE + '/').then(function (home) {
      if (!home) return [];
      var entries = frikiEntries(frikiState(home.html));
      if (!entries.length) return [];
      var picked = frikiPick(entries, info);
      if (!picked) return [];
      var slug = picked.slug;
      var path = picked.tipo === 'pelicula' || picked.tipo === 'película'
        ? '/ver-pelicula/' + slug : '/ver-serie/' + slug;
      return frikiserieReadPage(FRIKISERIE_BASE + path).then(function (page) {
        // La ficha puede traer enlaces más concretos que la portada.
        var pageState = page ? frikiState(page.html) : null;
        var pageEntries = pageState ? frikiEntries(pageState) : [];
        var detail = null;
        for (var i = 0; i < pageEntries.length; i++) {
          if (pageEntries[i].slug === slug) { detail = pageEntries[i]; break; }
        }
        var source = (detail && detail.video && detail.video !== 'xxxx') ? detail : picked;
        var ids = frikiOkruIds(source.video, page ? page.html : '');
        if (!ids.length) return [];
        var chosen = ids.length > 1 && info.isTv
          ? ids[Math.min(ids.length - 1, info.episode - 1)] : ids[0];
        var sharesPlaylist = info.isTv && ids.length === 1;
        return frikiserieOkru(ids.length > 1 ? chosen : ids[0]).then(function (media) {
          if (!media) return [];
          var title = (info.title || 'TMDB ' + (info.tmdbId || '')) +
            (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
            (sharesPlaylist ? ' · lista completa del título' : '');
          var stream = makeStream({
            name: 'FrikiSeries', title: title, provider: 'frikiserie',
            url: media.url, quality: parseQuality(media.quality + ' ' + title + ' ' + media.url),
            language: languageLabel(media.language) || 'Latino',
            headers: media.headers || { Referer: 'https://ok.ru/', 'User-Agent': UA, Origin: 'https://ok.ru' }
          });
          return finalizeStreams('FrikiSeries', [stream], { max: conf.maxResults });
        });
      });
    });
  }).catch(function (error) { log('frikiserie', error && error.message || error); return []; });
}

/** Ids de OK.ru declarados por el estado o presentes en la página. */
function frikiOkruIds(video, html) {
  var out = [];
  function add(candidate) {
    if (!candidate) return;
    var match = /ok\.ru\/(?:videoembed|video)\/([0-9]{5,24})/i.exec(String(candidate));
    if (!match) return;
    if (out.indexOf(match[1]) === -1) out.push(match[1]);
  }
  add(video);
  var text = String(html || '');
  var re = /ok\.ru\/(?:videoembed|video)\/([0-9]{5,24})/gi;
  var match;
  while ((match = re.exec(text)) && out.length < 60) {
    if (out.indexOf(match[1]) === -1) out.push(match[1]);
  }
  return out;
}

/** Enlaces directos publicados por el reproductor de OK.ru. */
function frikiserieOkru(videoId) {
  if (!videoId) return Promise.resolve(null);
  var embed = 'https://ok.ru/videoembed/' + videoId;
  function parse(payload, base) {
    var medias = findDirectMedia(payload, base || 'https://ok.ru/');
    if (!medias.length) return null;
    // HLS primero: es el que mejor se adapta al ancho de banda.
    medias.sort(function (a, b) {
      var ah = /\.m3u8/i.test(a) ? 1 : 0;
      var bh = /\.m3u8/i.test(b) ? 1 : 0;
      if (ah !== bh) return bh - ah;
      return qualityRank(parseQuality(b)) - qualityRank(parseQuality(a));
    });
    return { url: medias[0], quality: parseQuality(medias[0]), language: 'Latino',
      headers: { Referer: embed, 'User-Agent': UA, Origin: 'https://ok.ru' } };
  }
  return request(embed, { timeout: 9000, retries: 0, pageOnly: true }).then(function (res) {
    var direct = res.ok && res.text ? parse(res.text, embed) : null;
    if (direct) return direct;
    // La API interna del reproductor devuelve el mismo JSON, ya sin HTML.
    return request('https://ok.ru/dk?cmd=videoPlayerMetadata&mid=' + videoId,
      { timeout: 8000, retries: 0, pageOnly: true,
        headers: { Referer: embed, 'User-Agent': UA } }).then(function (api) {
      return api.ok && api.text ? parse(api.text, embed) : null;
    }, function () { return null; });
  }, function () { return null; });
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

function frikiserieResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function frikiserieSettingsPanel() {
  return Promise.resolve([
    { type: 'header', label: 'FrikiSeries (frikiserie.com)' },
    { type: 'info', label: 'Series y películas clásicas dobladas al latino. Sus reproductores son de OK.ru: se entrega el MP4/HLS del vídeo cuando es público. Un enlace puede cubrir toda la serie; en ese caso se indica en el resultado.' }
  ]);
}

module.exports = {
  getStreams: frikiserieGetStreams,
  resolveMeta: frikiserieResolveMeta,
  onSettings: frikiserieSettingsPanel
};
