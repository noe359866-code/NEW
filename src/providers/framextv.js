/*__CORE__*/

/* frameXTV / VidSync: /api/core/streams?type=<tv|movie>&id=<tmdb>[&season=&episode=]
 *
 * Es el mismo motor que publica framextv.cc y el servidor "frameXTV" que
 * ofrece k-drama.in. Lo reconocido con tools/probe-sites.js (2026-11):
 *  - El sitio es una SPA: /api y /embed devuelven el HTML del shell, sin datos.
 *  - La API real vive en "shards" fijos: vidsync-shard.vs-deals<N>.workers.dev.
 *    El bundle los elige con un hash del id (FNV-1a) o desde localStorage; no
 *    hay endpoint público que los liste, así que se prueban en orden hasta que
 *    uno responda con `sources`.
 *  - La respuesta trae `sources[]` con `url` (m3u8/mp4), `quality` o
 *    `availableQualities`, `streamHeaders`, `audioLanguage`/`audioLabel` y
 *    `subtitles[]` con `url` (VTT). Solo se entregan URLs http(s) de esos
 *    campos: nunca se construye un enlace.
 *
 * Los ids son de TMDB, que es exactamente lo que ya resuelve el addon. */

var VID_BASE = 'https://vidsync.pro';
var VID_SHARDS = [
  'https://vidsync-shard.vs-deals79.workers.dev',
  'https://vidsync-shard.vs-deals41.workers.dev',
  'https://vidsync-shard.vs-deals38.workers.dev',
  'https://vidsync-shard.vs-deals54.workers.dev',
  'https://vidsync-shard.vs-deals13.workers.dev',
  'https://vidsync-shard.vs-deals7.workers.dev'
];

/** Consulta la API en un shard y devuelve la lista de fuentes o null. */
function vidShardStreams(base, params, attempt) {
  var query = 'type=' + encodeURIComponent(params.type) +
    '&id=' + encodeURIComponent(params.id) +
    '&season=' + encodeURIComponent(params.season || 1) +
    '&episode=' + encodeURIComponent(params.episode || 1);
  return getJson(base + '/api/core/streams?' + query, {
    timeout: 12000, retries: 0, headers: { Accept: 'application/json' }
  }).then(function (data) {
    if (!data || !Array.isArray(data.sources) || !data.sources.length) return null;
    return data;
  }, function () { return null; });
}

/** Prueba los shards en orden hasta obtener fuentes. */
function vidFindStreams(params) {
  var index = 0;
  function next() {
    if (index >= VID_SHARDS.length) return Promise.resolve(null);
    var base = VID_SHARDS[index++];
    return vidShardStreams(base, params).then(function (data) {
      return data || next();
    });
  }
  return next();
}

/** Cabeceras de la fuente: `streamHeaders` o `headers` del propio objeto. */
function vidHeaders(source, base) {
  var raw = source.streamHeaders || source.headers || null;
  var out = {};
  if (raw && typeof raw === 'object') {
    var keys = Object.keys(raw);
    for (var i = 0; i < keys.length; i++) {
      if (/^(?:user-agent|referer|origin|cookie)$/i.test(keys[i]) && typeof raw[keys[i]] === 'string') {
        out[keys[i]] = raw[keys[i]];
      }
    }
  }
  if (!out.Referer && !out.referer) out.Referer = base ? base + '/' : VID_BASE + '/';
  return out;
}

/** Un VTT de subtítulos solo si es http(s) público; nunca se descarga. */
function vidSubtitles(data) {
  var out = [];
  var list = (data && data.subtitles) || [];
  for (var i = 0; i < list.length && out.length < 6; i++) {
    var url = publicHttpUrl(list[i] && list[i].url);
    if (!url) continue;
    out.push({ url: url, lang: list[i].language || list[i].label || 'und' });
  }
  return out;
}

function vidQuality(source) {
  var quality = String(source.quality || '');
  if (quality && !/^auto$/i.test(quality)) return parseQuality(quality);
  var list = Array.isArray(source.availableQualities) ? source.availableQualities : [];
  var best = 0;
  for (var i = 0; i < list.length; i++) best = Math.max(best, qualityRank(parseQuality(list[i])));
  return best > 0 ? parseQuality(list.join(' ')) : 'SD';
}

function vidLanguage(source) {
  var label = source.audioLabel || source.audioLanguage || source.audio || '';
  return languageLabel(String(label)) || languageLabel(String(source.server || '')) || '';
}

function vidGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '10' });
  return requestMedia(tmdbId, mediaType, season, episode).then(function (info) {
    if (!info || !info.title) return [];
    if (info.isTv && (!Number.isInteger(info.season) || info.season < 1 ||
        !Number.isInteger(info.episode) || info.episode < 1)) return [];
    if (!info.tmdbId) return [];
    var params = { type: info.isTv ? 'tv' : 'movie', id: info.tmdbId,
      season: info.season, episode: info.episode };
    return vidFindStreams(params).then(function (data) {
      if (!data) return [];
      var subtitles = vidSubtitles(data);
      var streams = [];
      for (var i = 0; i < data.sources.length && streams.length < 24; i++) {
        var source = data.sources[i] || {};
        var url = directMediaUrl(source.url);
        if (!url) continue;
        var server = (source.provider && source.provider.name) || source.server || 'VidSync';
        var title = info.title + (info.isTv ? ' · ' + seasonEpisodeLabel(info.season, info.episode) : '') +
          ' · ' + server;
        streams.push(makeStream({ name: 'frameXTV', title: title, provider: 'framextv', url: url,
          quality: vidQuality(source), language: vidLanguage(source),
          headers: vidHeaders(source), subtitles: subtitles }));
      }
      return finalizeStreams('frameXTV', streams, { max: conf.maxResults });
    });
  }).catch(function (error) { log('framextv', error && error.message || error); return []; });
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

function vidResolveMeta(rawId, mediaType, season, episode) {
  return requestMedia(rawId, mediaType, season, episode);
}

function vidSettingsPanel() {
  return Promise.resolve([
    { type: 'header', label: 'frameXTV (VidSync)' },
    { type: 'info', label: 'Necesita el id de TMDB del título (el addon lo resuelve). Devuelve los HLS/MP4 y los subtítulos VTT que publique su API.' }
  ]);
}

module.exports = {
  getStreams: vidGetStreams,
  resolveMeta: vidResolveMeta,
  onSettings: vidSettingsPanel
};
