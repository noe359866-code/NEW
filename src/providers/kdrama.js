/*__CORE__*/

/* k-drama.in (KatDrama): id de TMDB → /watch/{tv|movie}/n-a-<tmdb>[-episode-<n>]
 * → botones de servidor.
 *
 * Lo reconocido con tools/probe-sites.js (2026-11):
 *  - Las fichas se identifican por el id de TMDB al final del slug
 *    (`/detail/tv/vincenzo-117376`). El slug solo es decorativo: con
 *    /watch/tv/n-a-<tmdb>-episode-<n> el sitio responde 200 y redirige a la
 *    URL canónica, cuyo HTML ya trae los reproductores. Por eso no se busca
 *    por título: /search funciona solo en el navegador (JavaScript) y desde
 *    el servidor no devuelve resultados.
 *  - Cada botón de servidor publica su URL en `onclick="switchServer('id',
 *    'url', ...)"`. Unos son embeds de terceros y otros propios
 *    (/vid2.php, /mx1.php, /tubi2.php, /yoy4.php, /kk2.php).
 *  - El player propio abre a su vez un iframe. Los embeds se recorren con
 *    resolveDirectPlayers, que solo acepta documentos y enlaces HLS/MP4. */

var KD_BASE = 'https://k-drama.in';

/** URL de reproducción con slug comodín; el sitio la redirige a la canónica. */
function kdWatchUrl(tmdbId, isTv, season, episode) {
  if (isTv) {
    return KD_BASE + '/watch/tv/n-a-' + tmdbId + '-episode-' + episode;
  }
  return KD_BASE + '/watch/movie/n-a-' + tmdbId;
}

/** Servidores del botón `onclick="switchServer('id', 'url', ...)"`. */
function kdServers(html, base) {
  var out = [];
  var re = /switchServer\(\s*'([^']*)'\s*,\s*'([^']+)'/gi;
  var match;
  while ((match = re.exec(String(html || ''))) && out.length < 30) {
    var url = publicHttpUrl(match[2], base || KD_BASE + '/');
    if (!url || isPlayerAdvertisement(url)) continue;
    // El botón incluye su etiqueta visible (idioma y calidad) en el HTML;
    // `switchServer` solo trae el id, así que se busca el texto del botón.
    var label = kdButtonLabel(html, match[1]);
    out.push({ url: url, name: kdServerName(match[1]), kind: match[1],
      language: kdServerLanguage(label), label: label });
  }
  if (!out.length) {
    // Sin botones, al menos el iframe principal.
    var frame = /<iframe\b[^>]*>/i.exec(String(html || ''));
    var src = frame ? attrOf(frame[0], 'src') : '';
    var url = publicHttpUrl(src, base || KD_BASE + '/');
    if (url && !isPlayerAdvertisement(url)) out.push({ url: url, name: 'KatDrama' });
  }
  return uniqueBy(out, function (item) { return item.url; });
}

/** Texto visible del botón que lanza `switchServer('<id>', ...)`. */
function kdButtonLabel(html, id) {
  var text = String(html || '');
  var escaped = String(id || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp("<button\\b[^>]*switchServer\\(\\s*'" + escaped + "'[\\s\\S]{0,400}?</button>", 'i');
  var match = re.exec(text);
  if (match) return stripTags(match[0]).replace(/\s+/g, ' ').trim();
  return '';
}

/** Idioma del servidor: KatDrama etiqueta sus botones «Kat 1 - Hindi»,
 * «Kat 2 - English», «Kat 3 - Original», «Aurora - English subtitles». */
function kdServerLanguage(text) {
  var label = languageLabel(text);
  if (label) return label;
  // «Original» en este sitio es el audio original con subtítulos en inglés.
  if (/\boriginal\b/i.test(String(text || ''))) return 'Original Subtitulado';
  return null;
}

function kdServerName(id) {
  var text = String(id || '').toLowerCase();
  if (text.indexOf('kat') === 0) return 'KatDrama';
  if (text.indexOf('vidly') !== -1) return 'Vidly';
  if (text.indexOf('vidzee') !== -1) return 'Vidzee';
  if (text.indexOf('zxc') !== -1) return 'ZxcStream';
  if (text.indexOf('reels') !== -1) return 'Reels';
  if (text.indexOf('frame') !== -1) return 'frameXTV';
  if (text.indexOf('tubi') !== -1) return 'Tubi';
  if (text.indexOf('mx') !== -1) return 'MX Player';
  return 'KatDrama';
}

function kdGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    // Este sitio identifica cada ficha por el id de TMDB: el título solo se usa
    // para etiquetar el enlace. Sin título resuelto (TMDB bloquea al servidor y
    // Wikidata puede no tener la ficha) se sigue igualmente, porque la URL no
    // depende de él.
    if (!info) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];
    if (!info.tmdbId) return [];
    var label = info.title || ('TMDB ' + info.tmdbId);
    var watch = kdWatchUrl(info.tmdbId, info.isTv, info.season, info.episode);
    return getText(watch, { timeout: 15000, retries: 1 }).then(function (html) {
      var servers = kdServers(html, watch);
      if (!servers.length) return [];
      return resolveDirectPlayers(servers, { maxDepth: 3, maxPages: 8 });
    }).then(function (items) {
      var streams = [];
      for (var i = 0; i < (items || []).length; i++) {
        var item = items[i];
        // El botón del sitio suele resumir idioma y calidad («Kat 1 - Hindi1080p»).
        var title = label + (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
          (item.name ? ' · ' + item.name : '') +
          (item.label && item.label !== item.name ? ' · ' + item.label : '');
        streams.push(makeStream({ name: 'KatDrama', title: title, provider: 'k-drama', url: item.url,
          quality: parseQuality(title + ' ' + item.url + ' ' + (item.label || '')),
          // El idioma del botón del sitio manda; si no lo declara, se deduce del título.
          language: languageLabel(item.language) || languageLabel(item.label || '') || languageLabel(title),
          headers: item.headers, subtitles: item.subtitles }));
      }
      return finalizeStreams('KatDrama', streams, { max: conf.maxResults });
    });
  }).catch(function (error) { log('k-drama', error && error.message || error); return []; });
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

function kdResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function kdSettingsPanel() {
  return Promise.resolve([
    { type: 'header', label: 'KatDrama (k-drama.in)' },
    { type: 'info', label: 'Doramas, películas y series asiáticas. Se entregan los enlaces HLS/MP4 que expongan sus reproductores; los que dependen de JavaScript no se pueden resolver.' }
  ]);
}

module.exports = {
  getStreams: kdGetStreams,
  resolveMeta: kdResolveMeta,
  onSettings: kdSettingsPanel
};
