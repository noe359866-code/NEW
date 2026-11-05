/* ------------------------------------------------------------------
 * Nébula Scrapers · core/shortlink
 * Decodificador de los enlaces ofuscados de EliteTorrent y DivxTotal
 * (acortame-esto.com / short-info.link):
 *
 *   capas de Base64  →  ROT13  →  https://…/archivo.torrent  o  magnet:
 *
 * Ejemplo real (EliteTorrent, 05/11/2026):
 *   i=VjJ0YWEyRXlTbk5o…  → 5 capas → "uggcf://jjj.ryvgrgbeerag.pbz/…"
 *   → ROT13 → "https://www.elitetorrent.com/wp-content/uploads/…"
 * ------------------------------------------------------------------ */

function looksLikeTarget(value) {
  return /^https?:\/\//i.test(value) || /^magnet:\?/i.test(value);
}

function printableText(text) {
  if (!text || text.length > 4096) return false;
  // Debe ser texto imprimible (una URL o magnet no lleva binario).
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
}

/**
 * @param {string} raw valor del parámetro `i` o `u`
 * @returns {string|null} URL .torrent o magnet
 */
function decodeShortLink(raw) {
  var value = String(raw == null ? '' : raw).trim();
  if (!value) return null;

  try {
    value = decodeURIComponent(value);
  } catch (e) { /* se queda como está */ }

  for (var layer = 0; layer < 10; layer++) {
    if (looksLikeTarget(value)) return value;

    var rotated = rot13(value);
    if (looksLikeTarget(rotated)) return rotated;

    var bytes = b64ToBytes(value);
    if (!bytes.length) return null;
    var text = bytesToText(bytes);
    if (!printableText(text) || text === value) return null;
    value = text;
  }
  return null;
}

/** Extrae el parámetro ofuscado (`i`, `u` o `url`) de un enlace completo. */
function shortParamOf(value) {
  var match = /[?&](?:i|u|url)=([^&#]+)/i.exec(String(value == null ? '' : value));
  return match ? match[1] : null;
}

/**
 * Variante tolerante: acepta el valor pelado o el enlace completo
 * (`acortame-esto.com/s.php?i=…`, `download_tt.php?u=…`, `ddlUrl.php?url=…`),
 * y devuelve las URLs que ya vienen en claro.
 */
function decodeShortLinkOrUrl(raw) {
  var direct = String(raw == null ? '' : raw).trim();
  if (!direct) return null;
  var param = shortParamOf(direct);
  if (param) {
    var decoded = decodeShortLink(param);
    if (decoded) return decoded;
    if (looksLikeTarget(param)) return param;
  }
  if (looksLikeTarget(direct)) return direct;
  return decodeShortLink(direct);
}
