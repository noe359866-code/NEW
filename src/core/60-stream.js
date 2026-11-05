/* ------------------------------------------------------------------
 * Nébula Scrapers · core/stream
 * Construcción del objeto de stream que espera Nuvio:
 *   { name, title, url, quality, size, language, provider, type,
 *     infoHash, seeders, headers, subtitles }
 * ------------------------------------------------------------------ */

function makeStream(data) {
  var stream = {
    name: data.name || data.provider || 'Nébula',
    title: data.title || data.name || 'Sin título',
    url: data.url,
    quality: data.quality || 'SD',
    provider: data.provider || PLUGIN_TAG,
    type: data.type || 'torrent'
  };
  if (data.size) stream.size = typeof data.size === 'number' ? formatSize(data.size) : data.size;
  if (data.language) stream.language = data.language;
  if (data.infoHash) stream.infoHash = data.infoHash;
  if (data.seeders != null) stream.seeders = data.seeders;
  if (data.peers != null) stream.peers = data.peers;
  if (data.headers) stream.headers = data.headers;
  if (data.subtitles && data.subtitles.length) stream.subtitles = data.subtitles;
  return stream;
}

function finalizeStreams(label, streams, options) {
  var opts = options || {};
  var max = opts.max || 12;
  var playable = (streams || []).filter(function (stream) {
    return stream && typeof stream.url === 'string' && stream.url.length > 8 && !/^https?:\/\/www\./i.test(stream.url);
  });
  playable = uniqueBy(playable, function (stream) {
    return (stream.infoHash || stream.url).toLowerCase();
  });
  playable = sortByQuality(playable);
  playable = playable.slice(0, max);
  var prefix = opts.prefix || label || 'Nébula';
  for (var i = 0; i < playable.length; i++) {
    if (playable[i].name && playable[i].name.indexOf(prefix) !== 0) {
      playable[i].name = prefix + ' · ' + playable[i].name;
    } else if (!playable[i].name) {
      playable[i].name = prefix;
    }
  }
  return playable;
}

/**
 * Descarga un .torrent y devuelve su magnet + metadatos.
 * Acepta URLs que responden con el archivo o con una redirección al mismo.
 */
function torrentToMagnet(url, options) {
  var opts = options || {};
  return getBytes(url, { timeout: opts.timeout || 14000, headers: opts.headers })
    .then(function (bytes) {
      if (!bytes || bytes.length < 30) return null;
      var torrent = parseTorrent(bytes);
      if (!torrent || !torrent.infoHash) return null;
      return {
        magnet: buildMagnet(torrent.infoHash, torrent.name, torrent.size),
        infoHash: torrent.infoHash,
        name: torrent.name,
        size: torrent.size
      };
    })
    .catch(function () { return null; });
}

/** Aplica un límite de concurrencia simple a una lista de tareas. */
function mapLimit(items, limit, iterator) {
  var results = new Array(items.length);
  var index = 0;

  function worker() {
    if (index >= items.length) return Promise.resolve();
    var current = index++;
    return Promise.resolve()
      .then(function () { return iterator(items[current], current); })
      .then(function (value) { results[current] = value; }, function () { results[current] = null; })
      .then(worker);
  }

  var workers = [];
  for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  return Promise.all(workers).then(function () { return results; });
}

/** Añade un distintivo de idioma cuando el sitio lo declara. */
function languageLabel(text) {
  var s = String(text == null ? '' : text);
  if (/latino/i.test(s)) return 'Latino';
  if (/castellano|espa(ñ|n)ol/i.test(s)) return 'Castellano';
  if (/vose|subtitulad/i.test(s)) return 'VOSE';
  if (/dual/i.test(s)) return 'Dual';
  return null;
}

function onSettingsLayout(items) {
  return function () {
    return Promise.resolve(items || []);
  };
}
