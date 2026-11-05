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

/** Variante tolerante para parámetros donde la URL puede venir en claro. */
function decodeShortLinkOrUrl(raw) {
  var direct = String(raw == null ? '' : raw).trim();
  if (looksLikeTarget(direct)) return direct;
  return decodeShortLink(direct);
}
