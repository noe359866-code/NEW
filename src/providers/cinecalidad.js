/*__CORE__*/

/* ------------------------------------------------------------------
 * Cinecalidad · www.cinecalidad.am  (WordPress + reproductor propio)
 * Cine y series en latino (dual con audio original).
 *
 *   búsqueda  GET /?s=<término>                 (tarjetas .in_title)
 *   película  /ver-pelicula/<slug>/
 *   serie     /ver-serie/<slug>/  →  /ver-el-episodio/<slug>-<n>x<m>/
 *   fuentes   bloque DESCARGAR:
 *             · magnets directos          → se entregan tal cual
 *             · uTorrent / «Obtener torrent» → acortalink.net/s.php?i=<Base64>
 *             · Mega / Megaup / 1fichier / Mediafire → ?download=<Base64>
 *
 * El sitio es DooPlay: los reproductores online están en
 * `#playeroptionsul li[data-option]` (Vimeos, Hlswish…), pero sus
 * embeds van cifrados y con captcha, así que el provider se queda con
 * las descargas (torrent + magnet); los hosts de ficheros (Mega,
 * 1fichier) no son reproducibles desde Nuvio y se descartan.
 *
 * Aviso: el dominio cambia (cinecalidad.am → .org → …). Hay ajuste de
 * dominio y respaldo en los espejos conocidos.
 * ------------------------------------------------------------------ */

var CC_HOSTS = [
  'https://www.cinecalidad.am',
  'https://cinecalidad.am',
  'https://www.cinecalidad.org',
  'https://www.cinecalidad.ro',
  'https://www.cinecalidad.is'
];

var CC_HOST_LINKS = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:mega\.nz|megaup\.net|1fichier\.com|mediafire\.com|fireload\.com|krakenfiles\.com|ouo\.io|acortalink\.[a-z]+|acortame-esto\.com|short-info\.link)/i;

/** Charset propio del acortador del sitio: dígitos, minúsculas, mayúsculas, + y /. */
var CC_SAFE_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';

/** Base64 de verdad (descarta espacios, normaliza URL-safe y rellena). */
function ccB64Decode(raw) {
  var value = String(raw == null ? '' : raw).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!value) return null;
  value += '===='.slice(0, (4 - (value.length % 4)) % 4);
  var text = bytesToText(b64ToBytes(value));
  return text || null;
}

/**
 * `acortalink.net/s.php?i=` usa base64 con el alfabeto reordenado.
 * Se prueban las dos variantes conocidas antes de rendirse:
 *   1. Base64 estándar
 *   2. Base64 con el alfabeto propio del acortador
 */
function ccDecodeAportalink(raw) {
  var direct = decodeShortLinkOrUrl(raw);
  if (direct) return direct;

  var payload = String(raw == null ? '' : raw);
  var param = /[?&]i=([^&#]+)/i.exec(payload);
  if (param) payload = param[1];
  try { payload = decodeURIComponent(payload); } catch (e) { /* tal cual */ }
  payload = payload.replace(/\s+/g, '');
  if (!payload) return null;

  var standard = ccB64Decode(payload);
  if (standard && /^(?:https?:\/\/|magnet:\?)/i.test(standard.trim())) return standard.trim();

  // alfabeto propio: se traduce cada símbolo a su índice estándar
  var normalized = payload.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  var rebuilt = '';
  for (var i = 0; i < normalized.length; i++) {
    var index = CC_SAFE_CHARS.indexOf(normalized.charAt(i));
    if (index < 0) { rebuilt = ''; break; }
    rebuilt += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.charAt(index);
  }
  if (rebuilt) {
    var swapped = ccB64Decode(rebuilt);
    if (swapped && /^(?:https?:\/\/|magnet:\?)/i.test(swapped.trim())) return swapped.trim();
  }
  return null;
}

/** Tarjetas de /?s=<término>. */
function ccParseCards(html, baseUrl) {
  var items = [];
  var seen = {};
  var re = /<a\b[^>]*href=["']([^"']*\/(?:ver-pelicula|ver-serie|ver-el-episodio)\/[^"']+)["'][^>]*>([\s\S]{0,600}?)<\/a>/gi;
  var match;
  while ((match = re.exec(html))) {
    var url = absoluteUrl(decodeEntities(match[1]), baseUrl);
    if (!url || seen[url]) continue;
    var inner = match[2];
    var titleEl = /<[^>]+class=["'][^"']*in_title[^"']*["'][^>]*>([\s\S]{1,200}?)<\/[a-z]+>/i.exec(inner);
    var titleAlt = attrOf(/<img\b[^>]*>/i.exec(inner) ? /<img\b[^>]*>/i.exec(inner)[0] : '', 'alt');
    var title = titleEl ? stripTags(titleEl[1]) : (titleAlt || stripTags(inner));
    title = title ? title.replace(/\s+/g, ' ').trim() : null;
    if (!title || title.length < 2) continue;
    if (/^(ver|descargar|cinecalidad|inicio|pel[ií]culas|series)$/i.test(title)) continue;
    seen[url] = true;

    var windowHtml = html.slice(match.index, match.index + 900);
    var qualityMatch = /(dual\s*1080p|4k|2160p|1080p|720p|full hd|hd|bluray|dvdrip|cam)/i.exec(windowHtml);
    items.push({
      url: url,
      title: title,
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : 'SD',
      year: parseYear(windowHtml.slice(0, 500)),
      isSeries: /\/ver-(?:serie|el-episodio)\//i.test(url)
    });
  }
  return items;
}

function ccSearch(host, term) {
  var url = host + '/?s=' + encodeURIComponent(String(term).replace(/\s+/g, '+'));
  return getText(url, { timeout: 16000 }).then(function (html) {
    return html ? ccParseCards(html, host) : [];
  });
}

/** Bloque DESCARGAR: filas con su etiqueta, calidad, audio y enlace. */
function ccParseDownloads(html, baseUrl) {
  var rows = [];
  var chunks = String(html).split(/<a\b/i);
  for (var i = 1; i < chunks.length; i++) {
    var chunk = chunks[i];
    var hrefMatch = /^[^>]*href=["']([^"']+)["']/i.exec(chunk);
    if (!hrefMatch) continue;
    var href = decodeEntities(hrefMatch[1]);
    var tagEnd = chunk.indexOf('>');
    var tail = tagEnd >= 0 ? chunk.slice(tagEnd + 1, tagEnd + 400) : '';
    var label = stripTags(tail.split(/<\/a>/i)[0] || '').replace(/\s+/g, ' ').trim();
    var url = absoluteUrl(href, baseUrl);
    if (!url) continue;

    var isMagnet = /^magnet:/i.test(href);
    var isAportalink = /acortalink\.[a-z]+\/s\.php\?i=/i.test(href);
    var isInternalDownload = /[?&]download=/i.test(href) && /\/ver-(?:pelicula|el-episodio|serie)\//i.test(href);
    var isTorrentFile = /\.torrent(\?|$)/i.test(href);
    var isFileHost = CC_HOST_LINKS.test(href);

    if (!isMagnet && !isAportalink && !isInternalDownload && !isTorrentFile) continue;
    if (!isMagnet && isFileHost && !isAportalink) continue; // Mega, 1fichier…: no reproducibles

    var qualityMatch = /(dual\s*1080p|1080p|720p|4k|2160p|full hd|bluray|dvdrip|hdr|web-?dl)/i.exec(label);
    rows.push({
      url: url,
      label: label,
      payload: isAportalink ? (/[?&]i=([^&#]+)/i.exec(href) || [])[1] :
        isInternalDownload ? (/[?&]download=([^&#]+)/i.exec(href) || [])[1] : null,
      kind: isMagnet ? 'magnet' : isAportalink ? 'short' : isInternalDownload ? 'download' : 'torrent',
      quality: qualityMatch ? parseQuality(qualityMatch[1]) : 'SD'
    });
  }
  return rows;
}

/** `?download=<Base64>` → URL del host de ficheros (se intenta el .torrent). */
function ccDecodeDownloadParam(payload) {
  var decoded = ccB64Decode(payload);
  if (!decoded) return null;
  var value = decoded.trim();
  if (/^magnet:/i.test(value) || /^https?:\/\//i.test(value)) return value;
  return null;
}

function ccPageAudio(html) {
  var audio = /Audio\s*:?\s*(?:<\/?[^>]+>\s*)*([^<|]{3,60})/i.exec(html);
  return audio ? (languageLabel(audio[1]) || 'Latino') : 'Latino';
}

function ccStreamsFromPage(pageUrl, info, label) {
  return getText(pageUrl, { timeout: 16000 }).then(function (html) {
    if (!html) return [];
    var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    var pageTitle = h1 ? stripTags(h1[1]).replace(/\s+/g, ' ').trim() : (label || info.title);
    var language = ccPageAudio(html) || 'Latino';
    var qualityField = /Calidad\s*:?\s*(?:<\/?[^>]+>\s*)*([^<|]{2,40})/i.exec(html);
    var pageQuality = qualityField ? parseQuality(qualityField[1]) : 'SD';
    var rows = ccParseDownloads(html, pageUrl);

    if (!rows.length) return [];

    var suffix = label && label !== pageTitle ? ' · ' + label : '';

    return mapLimit(rows.slice(0, 6), 2, function (row) {
      var quality = row.quality !== 'SD' ? row.quality : pageQuality;

      if (row.kind === 'magnet') {
        return Promise.resolve(makeStream({
          name: 'Cinecalidad',
          title: pageTitle + suffix + ' · ' + quality,
          url: row.url,
          infoHash: infoHashFromMagnet(row.url),
          quality: quality,
          size: parseSize(row.label),
          language: language,
          provider: 'cinecalidad',
          type: 'torrent',
          headers: { Referer: pageUrl }
        }));
      }

      var target = null;
      if (row.kind === 'short') target = ccDecodeAportalink(row.payload);
      else if (row.kind === 'download') target = ccDecodeDownloadParam(row.payload);
      else target = row.url;

      if (!target) {
        log('cinecalidad', 'no se pudo decodificar ' + row.kind + ' en ' + pageUrl);
        return Promise.resolve(null);
      }

      if (/^magnet:/i.test(target)) {
        return Promise.resolve(makeStream({
          name: 'Cinecalidad',
          title: pageTitle + suffix + ' · ' + quality,
          url: target,
          infoHash: infoHashFromMagnet(target),
          quality: quality,
          size: parseSize(row.label),
          language: language,
          provider: 'cinecalidad',
          type: 'torrent',
          headers: { Referer: pageUrl }
        }));
      }

      return resolveTorrentOrMagnet(target, {
        headers: { Referer: pageUrl, 'User-Agent': UA },
        timeout: 16000,
        maxDepth: 2
      }).then(function (torrent) {
        if (!torrent) return null;
        return makeStream({
          name: 'Cinecalidad',
          title: pageTitle + suffix + ' · ' + quality,
          url: torrent.magnet,
          infoHash: torrent.infoHash,
          quality: quality,
          size: torrent.size || parseSize(row.label),
          language: language,
          provider: 'cinecalidad',
          type: 'torrent',
          headers: { Referer: pageUrl }
        });
      }).catch(function () { return null; });
    }).then(function (list) { return list.filter(Boolean); });
  });
}

function ccGetStreams(tmdbId, mediaType, season, episode) {
  var conf = settings({ maxResults: '8', baseUrl: '' });

  return resolveMedia(tmdbId, mediaType, season, episode).then(function (info) {
    var limit = parseInt(conf.maxResults, 10);
    if (!isFinite(limit) || limit <= 0) limit = 8;

    var hosts = CC_HOSTS.slice();
    if (conf.baseUrl) hosts.unshift(String(conf.baseUrl).replace(/\/$/, ''));

    var queries = searchQueries(info).slice(0, 2);
    if (!queries.length) return [];

    var cursor = 0;
    var found = [];

    function nextQuery() {
      if (cursor >= queries.length || found.length >= 8) return Promise.resolve(found);
      var term = queries[cursor++];
      var hostIndex = 0;

      function tryHost() {
        if (hostIndex >= hosts.length) return nextQuery();
        var host = hosts[hostIndex++].replace(/\/$/, '');
        return ccSearch(host, term).then(function (items) {
          if (items.length) {
            found = found.concat(items.map(function (item) { item.host = host; return item; }));
            return found;
          }
          return tryHost();
        }).catch(function () { return tryHost(); });
      }
      return tryHost();
    }

    return nextQuery().then(function (candidates) {
      var filtered = uniqueBy(candidates, function (item) { return item.url; }).filter(function (candidate) {
        if (info.isTv !== !!candidate.isSeries) return false;
        var score = Math.max(
          titleScore(candidate.title, info.title),
          titleScore(candidate.title, info.originalTitle)
        );
        return score >= 0.5;
      });

      filtered = filtered.slice(0, Math.min(limit, 5));
      if (!filtered.length) return [];

      return mapLimit(filtered, 2, function (candidate) {
        var host = candidate.host;

        if (!info.isTv) return ccStreamsFromPage(candidate.url, info);

        var slugMatch = /\/(?:ver-serie|ver-el-episodio)\/([^/]+?)(?:-\d{1,2}x\d{1,3})?\/?$/i.exec(candidate.url);
        var slug = slugMatch ? slugMatch[1] : null;
        var seasonNo = info.season == null ? 1 : info.season;
        var episodeNo = info.episode == null ? 1 : info.episode;

        if (slug && !/-\d{1,2}x\d{1,3}$/i.test(candidate.url)) {
          var episodeUrl = host + '/ver-el-episodio/' + slug + '-' + seasonNo + 'x' + episodeNo + '/';
          return ccStreamsFromPage(episodeUrl, info, seasonEpisodeLabel(seasonNo, episodeNo))
            .catch(function () { return []; });
        }

        return ccStreamsFromPage(candidate.url, info, seasonEpisodeLabel(seasonNo, episodeNo))
          .catch(function () { return []; });
      }).then(function (groups) {
        var all = [];
        for (var i = 0; i < groups.length; i++) all = all.concat(groups[i] || []);
        return finalizeStreams('Cinecalidad', all, { max: limit });
      });
    });
  }).catch(function (error) {
    log('cinecalidad', error && error.message ? error.message : error);
    return [];
  });
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'Cinecalidad' },
    { type: 'info', label: 'Las fuentes salen del bloque DESCARGAR: magnets directos y enlaces uTorrent protegidos con acortalink (Base64). Los hosts de ficheros (Mega, 1fichier) no se incluyen porque no se pueden reproducir.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] },
    { type: 'text', key: 'baseUrl', label: 'Dominio actual (opcional)', placeholder: 'https://www.cinecalidad.am' }
  ]);
}

module.exports = { getStreams: ccGetStreams, onSettings: onSettings };
