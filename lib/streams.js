'use strict';
// Extrae enlaces directos (m3u8/mp4) de paginas de reproductores (Voe, YourUpload, etc.)
// y construye objetos de stream de Stremio.

const { fetchText } = require('./http');

function findDirectUrls(html) {
  const urls = new Set();
  const re = /https?:\/\/[^\s"'\\<>]+\.(?:m3u8|mp4)(?:\?[^\s"'\\<>]*)?/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    urls.add(m[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&'));
  }
  // Algunos hosts guardan la URL en "source" o "file"
  const re2 = /["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)["']/gi;
  while ((m = re2.exec(String(html || '')))) urls.add(m[1]);
  return [...urls];
}

async function resolveEmbed(embedUrl) {
  try {
    const html = await fetchText(embedUrl, { timeout: 10000 });
    const urls = findDirectUrls(html);
    return urls.length ? urls : [];
  } catch {
    return [];
  }
}

// Convierte una lista de {url, name} de embeds en streams de Stremio.
// Intenta enlace directo; si no hay, devuelve externalUrl para abrir en navegador.
async function toStremioStreams(embeds, { provider, title, episode }) {
  const out = [];
  const epLabel = episode ? `Ep. ${episode}` : '';
  const fullTitle = episode ? `${title} ${epLabel}` : title;

  for (const emb of embeds.slice(0, 8)) {
    const name = emb.name || 'Servidor';
    const direct = await resolveEmbed(emb.url);
    if (direct.length) {
      for (const url of direct.slice(0, 2)) {
        out.push({
          name: `${provider} · ${name}`,
          title: fullTitle,
          url,
          behaviorHints: { bingeGroup: `${provider}|${name}` },
        });
      }
    } else {
      out.push({
        name: `${provider} · ${name} ↗`,
        title: `${fullTitle}\nAbre ${name} en tu navegador`,
        externalUrl: emb.url,
        behaviorHints: { bingeGroup: `${provider}|${name}|ext` },
      });
    }
  }
  return out;
}

module.exports = { findDirectUrls, resolveEmbed, toStremioStreams };
