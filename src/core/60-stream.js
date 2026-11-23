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
  // El mismo reproductor sigue en el siguiente episodio y las insignias de
  // Nuvio leen `filename`; ninguno de los dos cambia el enlace entregado.
  stream.bingeGroup = data.bingeGroup || providerBingeGroup(data.provider, data.name);
  stream.filename = data.filename || syntheticFilename(stream.title, stream.quality, data.language);
  return stream;
}

/** Agrupa las opciones del mismo reproductor para seguir la serie. */
function providerBingeGroup(provider, name) {
  var base = norm(String(provider || 'nebula'));
  var extra = norm(String(name || ''));
  if (extra && extra !== base && extra.indexOf(base) === -1) base = base + ' ' + extra;
  return (base.replace(/\s+/g, '-') || 'nebula').slice(0, 60);
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


