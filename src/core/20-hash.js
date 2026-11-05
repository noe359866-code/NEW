/* ------------------------------------------------------------------
 * Nébula Scrapers · core/hash
 * SHA-1 y SHA-256 en JS puro (sin crypto de Node ni crypto.subtle).
 * - SHA-1: infohash BTIH del diccionario "info" de un .torrent
 * - SHA-256: proof-of-work de las descargas de DonTorrent/MejorTorrent
 * ------------------------------------------------------------------ */

function rotl32(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function rotr32(value, bits) {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function bytesToWords(bytes) {
  var words = new Array(((bytes.length + 3) >> 2));
  for (var i = 0; i < words.length; i++) words[i] = 0;
  for (var j = 0; j < bytes.length; j++) {
    words[j >> 2] |= bytes[j] << (24 - (j % 4) * 8);
  }
  return words;
}

function paddedWords(bytes, littleEndianLength) {
  var lengthBitsHigh = Math.floor((bytes.length * 8) / 4294967296);
  var lengthBitsLow = (bytes.length * 8) >>> 0;
  var total = (((bytes.length + 8) >> 6) + 1) << 4;
  var words = new Array(total);
  for (var i = 0; i < total; i++) words[i] = 0;
  for (var j = 0; j < bytes.length; j++) {
    words[j >> 2] |= bytes[j] << (24 - (j % 4) * 8);
  }
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  if (littleEndianLength) {
    words[total - 1] = lengthBitsLow;
    words[total - 2] = lengthBitsHigh;
  } else {
    words[total - 1] = lengthBitsLow;
    words[total - 2] = lengthBitsHigh;
  }
  return words;
}

function wordsToHex(words) {
  var hex = '';
  for (var i = 0; i < words.length; i++) hex += ('00000000' + (words[i] >>> 0).toString(16)).slice(-8);
  return hex;
}

/** SHA-1 de un Uint8Array -> hex */
function sha1Bytes(bytes) {
  var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var words = paddedWords(data, false);
  var h0 = 0x67452301;
  var h1 = 0xEFCDAB89;
  var h2 = 0x98BADCFE;
  var h3 = 0x10325476;
  var h4 = 0xC3D2E1F0;
  var w = new Array(80);

  for (var block = 0; block < words.length; block += 16) {
    for (var i = 0; i < 16; i++) w[i] = words[block + i] | 0;
    for (var t = 16; t < 80; t++) w[t] = rotl32(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);

    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;

    for (var s = 0; s < 80; s++) {
      var f;
      var k;
      if (s < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5A827999;
      } else if (s < 40) {
        f = b ^ c ^ d;
        k = 0x6ED9EBA1;
      } else if (s < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8F1BBCDC;
      } else {
        f = b ^ c ^ d;
        k = 0xCA62C1D6;
      }
      var temp = (rotl32(a, 5) + (f | 0) + e + k + w[s]) | 0;
      e = d;
      d = c;
      c = rotl32(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  return wordsToHex([h0, h1, h2, h3, h4]);
}

var SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

/** SHA-256 de un Uint8Array -> hex */
function sha256Bytes(bytes) {
  var data = bytes instanceof Uint8Array ? bytes : utf8ToBytes(bytes);
  var words = paddedWords(data, false);
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var w = new Array(64);

  for (var block = 0; block < words.length; block += 16) {
    for (var i = 0; i < 16; i++) w[i] = words[block + i] | 0;
    for (var t = 16; t < 64; t++) {
      var s0 = rotr32(w[t - 15], 7) ^ rotr32(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      var s1 = rotr32(w[t - 2], 17) ^ rotr32(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    var a = h[0];
    var b = h[1];
    var c = h[2];
    var d = h[3];
    var e = h[4];
    var f = h[5];
    var g = h[6];
    var hh = h[7];

    for (var k = 0; k < 64; k++) {
      var S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      var ch = (e & f) ^ ((~e) & g);
      var temp1 = (hh + S1 + ch + SHA256_K[k] + w[k]) | 0;
      var S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) | 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }

  return wordsToHex(h);
}

function sha256Hex(text) {
  return sha256Bytes(utf8ToBytes(String(text == null ? '' : text)));
}

function sha1Hex(text) {
  return sha1Bytes(utf8ToBytes(String(text == null ? '' : text)));
}
