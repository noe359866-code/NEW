'use strict';

// Transporte de documentos para los scrapers alojados. El servidor nunca
// solicita ni retransmite medios identificados como HLS/MP4.
const https = require('node:https');
const zlib = require('node:zlib');
const { UA, safeUrl, mediaUrl, publicLookup } = require('../sports/http');

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const DOCUMENT = /^(?:text\/html|application\/xhtml\+xml|application\/(?:[a-z0-9.+-]*\+)?json)(?:\s*;|$)/i;

function responseObject(url, status, rawHeaders, body, allowed = true) {
  const headers = {};
  for (const [name, value] of Object.entries(rawHeaders || {})) {
    if (value != null) headers[name.toLowerCase()] = (Array.isArray(value) ? value.join(',') : String(value)).slice(0, 8192);
  }
  const bytes = body || Buffer.alloc(0);
  return {
    ok: allowed && status >= 200 && status < 300,
    status,
    url,
    headers: { get(name) { return headers[String(name).toLowerCase()] || null; } },
    text: async () => bytes.toString('utf8'),
    json: async () => JSON.parse(bytes.toString('utf8')),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

function requestHeaders(input) {
  const allow = {
    'accept': 'Accept', 'accept-language': 'Accept-Language', 'user-agent': 'User-Agent',
    'referer': 'Referer', 'origin': 'Origin', 'cookie': 'Cookie'
  };
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/json;q=0.9,*/*;q=0.2',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6',
    'Accept-Encoding': 'identity'
  };
  if (!input || typeof input !== 'object') return headers;
  for (const [name, raw] of Object.entries(input)) {
    const key = String(name).toLowerCase();
    const value = typeof raw === 'string' ? raw : '';
    if (!Object.hasOwn(allow, key) || !value || value.length > 8192 || /[\r\n\0]/.test(value)) continue;
    if ((key === 'referer' || key === 'origin') && !safeUrl(value)) continue;
    headers[allow[key]] = value;
  }
  return headers;
}

function requestOnce(url, headers, { signal, timeout = TIMEOUT_MS, maxBytes = MAX_BYTES, method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new Error('Solicitud cancelada'));
    let req;
    let response;
    let decoder;
    let finished = false;
    let timer;
    const abort = () => { if (req) req.destroy(new Error('Solicitud cancelada')); };
    function finish(error, value) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abort);
      if (error) {
        if (response) response.destroy();
        if (decoder) decoder.destroy();
        reject(error);
      } else resolve(value);
    }
    try {
      const start = method === 'POST' ? https.request : https.get;
      req = start.call(https, url, { headers, lookup: publicLookup, method }, res => {
        response = res;
        const status = res.statusCode || 0;
        const responseHeaders = res.headers || {};
        const contentType = String(responseHeaders['content-type'] || '').trim();
        const isDocument = DOCUMENT.test(contentType);
        // De una redirección solo se leen sus cabeceras. Los errores 403/503
        // con HTML pueden contener un desafío del reproductor.
        const canRead = isDocument && ((status >= 200 && status < 300) || status === 403 || status === 503);
        if (!canRead) {
          res.destroy();
          return finish(null, responseObject(url, status, responseHeaders, null, isDocument));
        }
        if (Number(responseHeaders['content-length']) > maxBytes) {
          return finish(new Error('Respuesta demasiado grande'));
        }
        const encoding = String(responseHeaders['content-encoding'] || '').toLowerCase().trim();
        if (encoding && encoding !== 'identity') {
          if (encoding === 'gzip') decoder = zlib.createGunzip();
          else if (encoding === 'deflate') decoder = zlib.createInflate();
          else if (encoding === 'br') decoder = zlib.createBrotliDecompress();
          else return finish(new Error('Compresión no compatible'));
        }
        const chunks = [];
        let size = 0;
        let encodedSize = 0;
        const input = decoder || res;
        if (decoder) {
          res.on('data', chunk => {
            encodedSize += chunk.length;
            if (encodedSize > maxBytes) finish(new Error('Respuesta demasiado grande'));
          });
          res.pipe(decoder);
        }
        res.on('aborted', () => finish(new Error('Respuesta interrumpida')));
        res.on('error', error => finish(error));
        if (decoder) decoder.on('error', error => finish(error));
        input.on('data', chunk => {
          size += chunk.length;
          if (size > maxBytes) return finish(new Error('Respuesta demasiado grande'));
          chunks.push(chunk);
        });
        input.on('end', () => finish(null, responseObject(url, status, responseHeaders, Buffer.concat(chunks))));
      });
      req.on('error', error => finish(error));
      timer = setTimeout(() => req.destroy(new Error('Tiempo de espera agotado')), timeout);
      if (signal) signal.addEventListener('abort', abort, { once: true });
      // Cubrir una cancelación entre la comprobación inicial y el registro.
      if (signal && signal.aborted) abort();
      else if (method === 'POST') req.end(body);
    } catch (error) { finish(error); }
  });
}

// Única excepción al transporte GET: la API conocida de Vidara. No se permite
// convertir el addon en un proxy POST genérico ni enviar cuerpos arbitrarios.
const VIDARA_HOSTS = new Set(['vidara.to', 'vidara.so', 'vidvara.fit']);

function vidaraPostBody(url, raw) {
  const target = new URL(url);
  if (!VIDARA_HOSTS.has(target.hostname) || target.pathname !== '/api/stream' || target.search || target.hash ||
      typeof raw !== 'string' || raw.length > 256) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).sort().join(',') !== 'device,filecode' || data.device !== 'web' ||
      typeof data.filecode !== 'string' || !/^[a-z0-9]{1,64}$/i.test(data.filecode)) return null;
  return JSON.stringify({ filecode: data.filecode, device: 'web' });
}

/** Fetch limitado a documentos HTTPS públicos, sin seguir redirecciones a medios. */
async function safeFetch(value, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') throw new Error('Método no permitido');
  if (method === 'GET' && init.body != null) throw new Error('Método no permitido');
  if (mediaUrl(value)) throw new Error('No se solicitan medios');
  let url = safeUrl(value, undefined, { page: true });
  if (!url) throw new Error('URL de página no permitida');
  const body = method === 'POST' ? vidaraPostBody(url, init.body) : undefined;
  if (method === 'POST' && !body) throw new Error('Método no permitido');
  const headers = requestHeaders(init.headers);
  if (method === 'POST') {
    const target = new URL(url);
    const data = JSON.parse(body);
    const ref = safeUrl(headers.Referer, undefined, { page: true });
    const parsedRef = ref && new URL(ref);
    const expectedPath = new RegExp('^/(?:e|v)/' + data.filecode + '/?$');
    // Un espejo puede recibir el Referer del reproductor original, siempre
    // que ambos pertenezcan a la lista fija y el código sea el mismo.
    if (!parsedRef || !VIDARA_HOSTS.has(parsedRef.hostname) || !expectedPath.test(parsedRef.pathname)) headers.Referer = target.origin + '/';
    headers.Origin = target.origin;
    headers.Accept = 'application/json';
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(body));
  }
  for (let redirects = 0; ; redirects++) {
    const response = await requestOnce(url, headers, { signal: init.signal, method, body });
    // Nunca reenviar el cuerpo de una solicitud POST a un destino distinto.
    if (method === 'POST' || ![301, 302, 303, 307, 308].includes(response.status) || init.redirect === 'manual') return response;
    const location = response.headers.get('location');
    if (!location) return response;
    // No seguir medios, ni siquiera cuando llegan mediante una redirección.
    if (mediaUrl(location, url)) return response;
    const next = safeUrl(location, url, { page: true });
    if (!next) throw new Error('Redirección no permitida');
    if (redirects >= MAX_REDIRECTS) throw new Error('Demasiadas redirecciones');
    if (typeof init.onRedirectRequest === 'function') init.onRedirectRequest();
    if (new URL(next).origin !== new URL(url).origin) delete headers.Cookie;
    url = next;
  }
}

module.exports = { safeFetch, requestOnce, requestHeaders, responseObject, MAX_BYTES, TIMEOUT_MS, MAX_REDIRECTS };
