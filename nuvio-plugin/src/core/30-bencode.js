/* ------------------------------------------------------------------
 * Nébula Scrapers · core/bencode
 * Lector mínimo de .torrent para obtener nombre, tamaño e infohash.
 * El infohash BTIH es SHA-1 de los bytes exactos del diccionario "info".
 * ------------------------------------------------------------------ */

function bdecodeStringAt(bytes, index) {
  var i = index;
  var length = 0;
  var digits = 0;
  while (i < bytes.length && bytes[i] >= 48 && bytes[i] <= 57) {
    length = length * 10 + (bytes[i] - 48);
    i++;
    digits++;
  }
  if (!digits || bytes[i] !== 58) return null;
  i++;
  var end = i + length;
  if (end > bytes.length) return null;
  return { value: bytesToText(bytes.subarray(i, end)), start: i, end: end, next: end };
}

function bdecodeIntAt(bytes, index) {
  var i = index;
  if (bytes[i] !== 105) return null;
  i++;
  var sign = 1;
  if (bytes[i] === 45) { sign = -1; i++; }
  var value = 0;
  var digits = 0;
  while (i < bytes.length && bytes[i] >= 48 && bytes[i] <= 57) {
    value = value * 10 + (bytes[i] - 48);
    i++;
    digits++;
  }
  if (!digits || bytes[i] !== 101) return null;
  return { value: sign * value, next: i + 1 };
}

/** Devuelve el índice inmediatamente posterior al valor que empieza en `index`. */
function bdecodeSkip(bytes, index) {
  if (index >= bytes.length) return -1;
  var code = bytes[index];
  if (code === 105) { // i
    var parsedInt = bdecodeIntAt(bytes, index);
    return parsedInt ? parsedInt.next : -1;
  }
  if (code === 108) { // l
    var i = index + 1;
    while (i < bytes.length && bytes[i] !== 101) {
      i = bdecodeSkip(bytes, i);
      if (i < 0) return -1;
    }
    return i + 1;
  }
  if (code === 100) { // d
    var j = index + 1;
    while (j < bytes.length && bytes[j] !== 101) {
      var key = bdecodeStringAt(bytes, j);
      if (!key) return -1;
      j = bdecodeSkip(bytes, key.next);
      if (j < 0) return -1;
    }
    return j + 1;
  }
  var str = bdecodeStringAt(bytes, index);
  return str ? str.next : -1;
}

/** Lista de pares clave → rango de bytes de una cadena o diccionario. */
function bdecodeDictEntries(bytes, index) {
  if (bytes[index] !== 100) return [];
  var entries = [];
  var i = index + 1;
  while (i < bytes.length && bytes[i] !== 101) {
    var key = bdecodeStringAt(bytes, i);
    if (!key) break;
    var valueStart = key.next;
    var valueEnd = bdecodeSkip(bytes, valueStart);
    if (valueEnd < 0) break;
    entries.push({ key: key.value, start: valueStart, end: valueEnd });
    i = valueEnd;
  }
  return entries;
}

function bdecodeInfoSize(bytes, infoStart, infoEnd) {
  var entries = bdecodeDictEntries(bytes, infoStart);
  var total = 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (entry.key === 'length') {
      var lengthInt = bdecodeIntAt(bytes, entry.start);
      if (lengthInt) total += lengthInt.value;
    } else if (entry.key === 'files' && bytes[entry.start] === 108) {
      var cursor = entry.start + 1;
      while (cursor < entry.end - 1 && bytes[cursor] !== 101) {
        var fileEntries = bdecodeDictEntries(bytes, cursor);
        for (var f = 0; f < fileEntries.length; f++) {
          if (fileEntries[f].key === 'length') {
            var fileInt = bdecodeIntAt(bytes, fileEntries[f].start);
            if (fileInt) total += fileInt.value;
          }
        }
        var nextCursor = bdecodeSkip(bytes, cursor);
        if (nextCursor <= cursor) break;
        cursor = nextCursor;
      }
    }
  }
  return total || null;
}

/**
 * @param {Uint8Array} bytes contenido de un .torrent
 * @returns {{name:string, infoHash:string, size:number|null}|null}
 */
function parseTorrent(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes[0] !== 100) return null;
  var root = bdecodeDictEntries(bytes, 0);
  var info = null;
  var name = null;
  for (var i = 0; i < root.length; i++) {
    if (root[i].key === 'info') info = root[i];
  }
  if (!info) return null;

  var infoEntries = bdecodeDictEntries(bytes, info.start);
  for (var j = 0; j < infoEntries.length; j++) {
    if (infoEntries[j].key === 'name') {
      var nameStr = bdecodeStringAt(bytes, infoEntries[j].start);
      if (nameStr) name = nameStr.value;
    } else if (infoEntries[j].key === 'name.utf-8' && !name) {
      var utfName = bdecodeStringAt(bytes, infoEntries[j].start);
      if (utfName) name = utfName.value;
    }
  }

  return {
    name: name,
    infoHash: sha1Bytes(bytes.subarray(info.start, info.end)),
    size: bdecodeInfoSize(bytes, info.start, info.end)
  };
}
