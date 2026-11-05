/* ------------------------------------------------------------------
 * Nébula Scrapers · core/cloudflare
 * Ayudas para los sitios que se sirven detrás de Cloudflare
 * (TorrentGalaxy y GranTorrent, entre otros).
 *
 * Un plugin no puede resolver el desafío «Just a moment…»: no hay
 * navegador ni espacio para ejecutar el reto JS. Lo que sí puede hacer
 * es reutilizar la sesión ya verificada del usuario:
 *
 *   SCRAPER_SETTINGS = { cfCookie: 'cf_clearance=…; __cf_bm=…',
 *                        userAgent: 'Mozilla/5.0 …' }
 *
 * Ese par cookie+UA es el que el navegador ya negoció, así que las
 * peticiones del plugin pasan como tráfico normal. Si no hay cookie,
 * los providers siguen funcionando: devuelven [] cuando aparece el
 * desafío en vez de fallar.
 * ------------------------------------------------------------------ */

var CLOUDFLARE_CHALLENGE_RE = /just a moment|performing security verification|checking your browser|cf-chl|cdn-cgi\/challenge|attention required|enable javascript and cookies|verifying you are human|ddos-guard/i;

/** ¿El HTML es la pantalla de verificación en lugar del sitio? */
function isChallengeHtml(html) {
  if (!html) return true;
  var sample = String(html).slice(0, 4000);
  if (!sample.trim()) return true;
  // un 200 con la portada del sitio nunca trae estos marcadores
  return CLOUDFLARE_CHALLENGE_RE.test(sample);
}

/** Ajustes de sesión del usuario (cookie de Cloudflare y User-Agent). */
function cloudflareSettings() {
  return settings({ cfCookie: '', userAgent: '' });
}

/**
 * Cabeceras con la sesión del usuario cuando existe.
 * @param {object} extra cabeceras adicionales (Referer, Accept…)
 */
function browserHeaders(extra) {
  var conf = cloudflareSettings();
  var headers = {};
  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) headers[key] = extra[key];
    }
  }

  var ua = String(conf.userAgent == null ? '' : conf.userAgent).trim();
  if (ua) headers['User-Agent'] = ua;

  var cookie = String(conf.cfCookie == null ? '' : conf.cfCookie).trim();
  if (cookie) {
    // acepta tanto "cf_clearance=abc" como el valor pelado de cf_clearance
    if (cookie.indexOf('=') === -1) cookie = 'cf_clearance=' + cookie;
    headers.Cookie = cookie;
    if (!headers.Referer && !headers.referer) headers.Referer = 'https://www.google.com/';
  }

  return headers;
}

/** Texto del ajuste `cfCookie` (para decidir si merece la pena reintentar). */
function hasCloudflareSession() {
  var conf = cloudflareSettings();
  return String(conf.cfCookie || '').trim().length > 0;
}
