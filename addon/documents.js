'use strict';

const { safeFetch } = require('./fetch');
const { mediaUrl } = require('../sports/http');

// Adaptador de documentos para el catálogo deportivo. Comparte con el VOD
// las restricciones de DNS, tamaños, tiempo y redirecciones.
async function getDocument(value, { referer = '', timeout = 10000 } = {}) {
  const direct = mediaUrl(value);
  if (direct) return { url: direct, text: '', redirectMedia: direct };
  const response = await safeFetch(value, {
    headers: referer ? { Referer: referer } : {},
    signal: AbortSignal.timeout(timeout)
  });
  if (response.status >= 300 && response.status < 400) {
    const target = mediaUrl(response.headers.get('location'), response.url);
    if (target) return { url: target, text: '', redirectMedia: target };
  }
  if (!response.ok) throw new Error('Respuesta no es HTML/JSON: ' + response.status);
  return { url: response.url, text: await response.text() };
}

module.exports = { getDocument };
