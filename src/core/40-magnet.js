/* ------------------------------------------------------------------
 * Nébula Scrapers · core/magnet
 * Construcción de enlaces magnet a partir del infohash de un .torrent.
 * Nuvio resuelve magnets con su integración de debrid nativa.
 * ------------------------------------------------------------------ */

var MAGNET_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce'
];

function buildMagnet(infoHash, name, size) {
  if (!infoHash) return null;
  var hash = String(infoHash).toLowerCase();
  var url = 'magnet:?xt=urn:btih:' + hash;
  if (name) url += '&dn=' + encodeURIComponent(name);
  if (size) url += '&xl=' + size;
  for (var i = 0; i < MAGNET_TRACKERS.length; i++) {
    url += '&tr=' + encodeURIComponent(MAGNET_TRACKERS[i]);
  }
  return url;
}

/** Extrae el infohash de un magnet ya existente (hex 40 o base32 32). */
function infoHashFromMagnet(magnet) {
  var m = /xt=urn:btih:([a-z0-9]{32,40})/i.exec(String(magnet || ''));
  if (!m) return null;
  var hash = m[1];
  if (hash.length === 40) return hash.toLowerCase();
  // base32 -> hex
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var bits = '';
  var upper = hash.toUpperCase();
  for (var i = 0; i < upper.length; i++) {
    var value = alphabet.indexOf(upper.charAt(i));
    if (value < 0) return null;
    bits += ('00000' + value.toString(2)).slice(-5);
  }
  var hex = '';
  for (var b = 0; b + 4 <= bits.length; b += 4) {
    hex += parseInt(bits.slice(b, b + 4), 2).toString(16);
  }
  return hex.slice(0, 40);
}

/** Nombre legible dentro de un magnet (`dn`). */
function magnetName(magnet) {
  var m = /[?&]dn=([^&]+)/i.exec(String(magnet || ''));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}
