/* Direct streams only. Nuvio fetches the media itself; no video is relayed. */
function makeStream(data) {
  var stream = {
    name: data.name || 'Nébula',
    title: data.title || data.name || 'Sin título',
    url: data.url,
    quality: data.quality || 'SD',
    provider: data.provider || PLUGIN_TAG,
    type: 'direct'
  };
  if (data.language) stream.language = data.language;
  if (data.headers) stream.headers = data.headers;
  if (data.subtitles && data.subtitles.length) stream.subtitles = data.subtitles;
  return stream;
}

function finalizeStreams(label, streams, options) {
  var limit = Math.max(1, Math.min(20, parseInt((options || {}).max, 10) || 8));
  var playable = (streams || []).filter(function (stream) {
    return stream && directMediaUrl(stream.url);
  });
  playable = uniqueBy(playable, function (stream) { return stream.url; });
  return sortByQuality(playable).slice(0, limit);
}

function mapLimit(items, limit, iterator) {
  var results = new Array(items.length);
  var index = 0;
  function worker() {
    if (index >= items.length) return Promise.resolve();
    var current = index++;
    return Promise.resolve().then(function () { return iterator(items[current], current); })
      .then(function (value) { results[current] = value; }, function () { results[current] = null; })
      .then(worker);
  }
  var workers = [];
  for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  return Promise.all(workers).then(function () { return results; });
}

function languageLabel(text) {
  var s = String(text == null ? '' : text);
  if (/\b(?:latino|lat)\b/i.test(s)) return 'Latino';
  if (/castellano|espa(ñ|n)ol|\besp\b/i.test(s)) return 'Castellano';
  if (/vose|subtitulado|\bsub\b/i.test(s)) return 'Subtitulado';
  if (/\bjap\b/i.test(s)) return 'Japonés';
  return null;
}
