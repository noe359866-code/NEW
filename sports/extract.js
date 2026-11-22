'use strict';

const { UA, safeUrl, mediaUrl, isAdvertisementUrl } = require('./http');

function decode(value) {
  return String(value || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'").replace(/\\u0026/gi, '&').replace(/\\u003d/gi, '=')
    .replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');
}

function attr(tag, name) {
  const match = new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? decode(match[1] ?? match[2] ?? match[3]) : '';
}

function text(html) {
  return decode(String(html || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

// El formato _econfig se contrastó con dlhd-bridge (licencia MIT):
// licenses/dlhd-bridge-MIT.txt. No se usa su proxy de vídeo.
function decodeEconfig(html) {
  const m = /\b_econfig\s*=\s*["']([A-Za-z0-9+/=_-]{20,})["']/i.exec(html);
  if (!m) return null;
  try {
    const raw = Buffer.from(m[1], 'base64').toString('binary');
    // /assets/stream.js: divide en cuatro, retira el cuarto carácter,
    // reordena [2,0,3,1] y decodifica cada fragmento y el resultado.
    const length = Math.floor(raw.length / 4);
    if (length < 5) return null;
    const order = [2, 0, 3, 1];
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const part = raw.slice(i * length, (i + 1) * length);
      parts[order[i]] = Buffer.from(part.slice(0, 3) + part.slice(4), 'base64').toString('binary');
    }
    return JSON.parse(Buffer.from(parts.join(''), 'base64').toString('utf8'));
  } catch { return null; }
}

function extractMedia(html, base) {
  const result = [];
  const raw = decode(html);
  const re = /["']([^"'<>\s]{1,2000}\.(?:m3u8|mp4)(?:[?#][^"'<>\s]*)?)["']/gi;
  let m;
  while ((m = re.exec(raw)) && result.length < 20) {
    if (/[|{}]/.test(m[1]) || /https?:\/\//i.test(m[1].replace(/^https?:\/\//i, ''))) continue;
    const url = mediaUrl(m[1], base);
    if (url && !isAdvertisementUrl(url)) result.push(url);
  }
  const config = decodeEconfig(raw);
  if (config && config.stream_url) {
    const url = mediaUrl(config.stream_url, base);
    if (url && !isAdvertisementUrl(url)) result.push(url);
  }
  return [...new Set(result)];
}

function extractPlayers(html, base) {
  const result = [];
  let m;
  const tags = /<iframe\b[^>]*>/gi;
  while ((m = tags.exec(html)) && result.length < 12) {
    const raw = attr(m[0], 'src') || attr(m[0], 'data-src');
    // Un medio http también puede entregarse al cliente, pero las páginas
    // que visita el servidor siempre deben ser HTTPS en el puerto estándar.
    const url = mediaUrl(raw, base) || safeUrl(raw, base, { page: true });
    if (url && !isAdvertisementUrl(url) && !/facebook|chatango|\/chat\//i.test(url)) result.push(url);
  }
  // TVEnVivo expone las opciones en una tabla JS SOURCES con rutas core.php.
  const decoded = decode(html);
  const core = /(?:https?:\/\/[^"'\s<>]+)?\/live\d*\/core\.php\?[^"'\s<>\\]+/gi;
  while ((m = core.exec(decoded)) && result.length < 18) {
    const url = safeUrl(m[0], base, { page: true });
    if (url && /(?:^|\.)tvenvivo\.org$/i.test(new URL(url).hostname)) result.push(url);
  }
  return [...new Set(result)];
}

function sourceFromEmbed(embed) {
  try {
    const playerUrl = safeUrl(embed, undefined, { page: true });
    if (!playerUrl) return null;
    const player = new URL(playerUrl);
    // La API de OnDemand devuelve /player/hls/?url=<medio>. El parámetro es
    // el recurso del sitio, no una URL de nuestro servidor.
    if (!/(?:^|\.)(?:damitv\.st|ondemand\.st|ondemand\.to)$/i.test(player.hostname) ||
        !/^\/player\/hls\/?$/i.test(player.pathname)) return null;
    const url = mediaUrl(player.searchParams.get('url'), player.origin + '/');
    return url && !isAdvertisementUrl(url) ? { url, headers: { Referer: player.origin + '/', Origin: player.origin, 'User-Agent': UA } } : null;
  } catch { return null; }
}

/** BFS de documentos, nunca solicita una URL .m3u8/.mp4. */
async function resolvePages(seeds, get, { maxPages = 8, maxDepth = 3, maxResults = 8 } = {}) {
  const queue = seeds.map(seed => ({ ...seed, depth: 0 }));
  const seen = new Set();
  const results = [];
  const deadline = Date.now() + 20000;
  let visited = 0;
  while (queue.length && Date.now() < deadline && results.length < maxResults) {
    const item = queue.shift();
    const direct = mediaUrl(item.url, item.referer);
    const url = direct || safeUrl(item.url, item.referer, { page: true });
    if (!url || isAdvertisementUrl(url) || seen.has(url) || item.depth > maxDepth) continue;
    seen.add(url);
    if (direct) {
      const origin = item.referer ? new URL(item.referer).origin : new URL(url).origin;
      results.push({ url: direct, name: item.name || '', headers: { Referer: item.referer || origin + '/', Origin: origin, 'User-Agent': UA } });
      continue;
    }
    if (visited >= maxPages) continue;
    visited++;
    let page;
    try { page = await get(url, { referer: item.referer }); } catch { continue; }
    if (!page) continue;
    if (page.redirectMedia) {
      const target = mediaUrl(page.redirectMedia);
      if (target && !isAdvertisementUrl(target)) results.push({ url: target, name: item.name || '', headers: { Referer: url, Origin: new URL(url).origin, 'User-Agent': UA } });
      continue;
    }
    const current = safeUrl(page.url || url, url, { page: true }) || url;
    const requestedUrl = new URL(url);
    const finalUrl = new URL(current);
    // Una opción inexistente puede redirigir a la portada del sitio; no se
    // deben interpretar los reproductores ajenos de la portada como el canal.
    if (current !== url && finalUrl.origin === requestedUrl.origin &&
        /^\/(?:index\.php)?$/i.test(finalUrl.pathname) && !/^\/(?:index\.php)?$/i.test(requestedUrl.pathname)) continue;
    const html = String(page.text || '');
    for (const media of extractMedia(html, current)) {
      results.push({ url: media, name: item.name || '', headers: { Referer: new URL(current).origin + '/', Origin: new URL(current).origin, 'User-Agent': UA } });
    }
    if (item.depth >= maxDepth) continue;
    for (const player of extractPlayers(html, current)) {
      queue.push({ url: player, referer: current, name: item.name, depth: item.depth + 1 });
    }
  }
  return results.filter((item, index, list) => list.findIndex(other => other.url === item.url) === index).slice(0, maxResults);
}

module.exports = { decode, attr, text, decodeEconfig, extractMedia, extractPlayers, sourceFromEmbed, resolvePages };
