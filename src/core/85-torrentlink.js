/* ------------------------------------------------------------------
 * Nébula Scrapers · core/torrentlink
 * Puente entre un enlace de descarga y un magnet reproducible.
 *
 * Los tres sitios nuevos (TorrentGalaxy, GranTorrent y Cinecalidad)
 * entregan la fuente de tres formas distintas:
 *
 *   1. magnet ya montado            (Cinecalidad, series)
 *   2. .torrent directo             (wp-content, files host)
 *   3. página intermedia con botón  (files host, acortadores)
 *
 * `resolveTorrentOrMagnet()` acepta las tres, sigue como mucho dos
 * saltos y siempre devuelve un objeto o null. Nunca lanza.
 * ------------------------------------------------------------------ */

/** ¿Los bytes son un .torrent? Un bencode válido empieza por "d8:" y suele traer "announce". */
function looksLikeTorrentBytes(bytes) {
  if (!bytes || bytes.length < 40) return false;
  if (bytes[0] !== 0x64 || bytes[1] !== 0x38) return false; // 'd' '8'
  var sample = bytesToText(bytes.subarray(0, Math.min(bytes.length, 512)));
  return sample.indexOf('announce') !== -1 || sample.indexOf('info') !== -1;
}

/**
 * Enlaces candidatos a descargar un .torrent dentro de un HTML.
 * Cubre href/magnet, atributos data-*, formularios de descarga y
 * redirecciones JS del tipo `location.href = "…"`.
 */
function findDownloadLinks(html, baseUrl) {
  var text = String(html == null ? '' : html);
  var out = [];
  var seen = {};

  function push(value) {
    if (!value) return;
    var href = decodeEntities(String(value).replace(/\\\//g, '/')).trim();
    if (!href || seen[href]) return;
    if (/^(javascript:|#|mailto:)/i.test(href)) return;
    seen[href] = true;
    out.push(href);
  }

  var anchor = /<a\b[^>]*>/gi;
  var match;
  while ((match = anchor.exec(text))) {
    var tag = match[0];
    var href = attrOf(tag, 'href');
    if (!href) continue;
    if (/^magnet:/i.test(href)) push(href);
    else if (/\.torrent(\?|$)/i.test(href)) push(absoluteUrl(href, baseUrl));
    else if (/(?:^|\/)(?:download|descargar|bajar|enlaces?)(?:[/?]|$)/i.test(href)) push(absoluteUrl(href, baseUrl));
    else if (/[?&](?:download|dl)=/i.test(href)) push(absoluteUrl(href, baseUrl));
  }

  var attribute = /<[a-z][^>]*\bdata-(?:magnet|torrent|href|url)=["']([^"']+)["'][^>]*>/gi;
  while ((match = attribute.exec(text))) {
    var value = decodeEntities(match[1]);
    if (/^magnet:/i.test(value) || /\.torrent(\?|$)/i.test(value)) push(absoluteUrl(value, baseUrl));
  }

  var form = /<form\b[^>]*action=["']([^"']+)["'][^>]*>/gi;
  while ((match = form.exec(text))) {
    var action = absoluteUrl(decodeEntities(match[1]), baseUrl);
    if (action && /(?:download|descargar|bajar|get)/i.test(action)) push(action);
  }

  var script = /(?:location(?:\.href)?\s*=|window\.open\()\s*["']([^"']+)["']/gi;
  while ((match = script.exec(text))) {
    var target = decodeEntities(match[1]);
    if (/^https?:\/\//i.test(target) && /(?:download|descargar|\.torrent)/i.test(target)) push(target);
  }

  return out;
}

/** Infohashes sueltos en un HTML/JSON (`infoHash`, `data-hash`, `infohash=…`). */
function findInfoHashes(text) {
  var haystack = String(text == null ? '' : text);
  var out = [];
  var seen = {};
  var re = /(?:info[_-]?hash|btih)["'\s:=]{1,6}([a-f0-9]{40}|[a-z2-7]{32})/gi;
  var match;
  while ((match = re.exec(haystack))) {
    var hash = String(match[1]).toLowerCase();
    if (seen[hash]) continue;
    seen[hash] = true;
    out.push(hash.length === 32 ? infoHashFromMagnet('magnet:?xt=urn:btih:' + hash) : hash);
  }
  return out;
}

function mimeLooksTorrent(response) {
  if (!response || !response.headers || !response.headers.get) return false;
  var type = String(response.headers.get('content-type') || '').toLowerCase();
  return type.indexOf('bittorrent') !== -1 || type.indexOf('x-torrent') !== -1;
}

/**
 * Convierte un enlace de descarga en magnet.
 * @param {string} url  magnet, .torrent o página intermedia
 * @param {object} options { headers, timeout, depth, maxDepth }
 * @returns {Promise<{magnet:string, infoHash:string, name:string, size:number|null}|null>}
 */
function resolveTorrentOrMagnet(url, options) {
  var opts = options || {};
  var depth = opts.depth || 0;
  var maxDepth = opts.maxDepth == null ? 2 : opts.maxDepth;
  var target = String(url == null ? '' : url).trim();
  if (!target) return Promise.resolve(null);

  if (/^magnet:/i.test(target)) {
    var hash = infoHashFromMagnet(target);
    if (!hash) return Promise.resolve(null);
    return Promise.resolve({
      magnet: target,
      infoHash: hash,
      name: magnetName(target),
      size: null
    });
  }

  return getBytes(target, { timeout: opts.timeout || 15000, headers: opts.headers })
    .then(function (bytes) {
      if (!bytes || !looksLikeTorrentBytes(bytes)) return null;
      var torrent = parseTorrent(bytes);
      if (!torrent || !torrent.infoHash) return null;
      return {
        magnet: buildMagnet(torrent.infoHash, torrent.name, torrent.size),
        infoHash: torrent.infoHash,
        name: torrent.name,
        size: torrent.size
      };
    })
    .then(function (found) {
      if (found) return found;
      if (depth >= maxDepth) return null;

      return getText(target, { timeout: opts.timeout || 15000, headers: opts.headers })
        .then(function (html) {
          if (!html) return null;
          var links = findDownloadLinks(html, target).filter(function (link) {
            return link !== target;
          });
          if (!links.length) return null;

          var index = 0;
          function next() {
            if (index >= links.length || index >= 4) return Promise.resolve(null);
            var link = links[index++];
            return resolveTorrentOrMagnet(link, {
              headers: opts.headers,
              timeout: opts.timeout,
              depth: depth + 1,
              maxDepth: maxDepth
            }).then(function (result) {
              return result || next();
            });
          }
          return next();
        });
    })
    .catch(function () { return null; });
}

/** Solo la parte de host (`https://x.y`) de una URL. */
function originOf(url) {
  var match = /^(https?:\/\/[^/?#]+)/i.exec(String(url == null ? '' : url));
  return match ? match[1] : null;
}
