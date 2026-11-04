import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

const MAX_BODY = 16 * 1024;
const MAX_RESPONSE = 2 * 1024 * 1024;
const TIMEOUT = 12000;

class ProxyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function isPublicAddress(address) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === 'unicast';
  } catch { return false; }
}

export function validateUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new ProxyError(400, 'URL del addon inválida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new ProxyError(400, 'Solo se permiten URLs HTTP(S) sin credenciales ni fragmentos.');
  }
  // La API solo transporta respuestas JSON del protocolo Stremio, no contenido arbitrario.
  if (!/(?:\/manifest\.json|\/(?:catalog|meta|stream)\/[^/]+\/.+\.json)$/i.test(url.pathname)) {
    throw new ProxyError(400, 'Recurso de addon no permitido.');
  }
  return url;
}

async function resolvePublic(url, lookup) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = ipaddr.isValid(hostname)
      ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6 }]
      : await lookup(hostname, { all: true, verbatim: true });
  } catch { throw new ProxyError(502, 'No se pudo resolver el servidor del addon.'); }
  // Rechazar toda la respuesta DNS si contiene alguna dirección no pública evita rebinding.
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new ProxyError(403, 'Por seguridad no se permiten servidores locales o privados.');
  }
  return addresses[0];
}

async function fetchAddon(initialUrl, { lookup = dns.lookup, request = null, signal } = {}) {
  let url = validateUrl(initialUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const address = await resolvePublic(url, lookup);
    if (signal?.aborted) throw new ProxyError(504, 'El addon tardó demasiado en responder.');
    const result = await new Promise((resolve, reject) => {
      const transport = request || (url.protocol === 'https:' ? https.request : http.request);
      const req = transport(url, {
        method: 'GET', signal, headers: { accept: 'application/json', 'user-agent': 'Nebula/1.2 addon-client' },
        lookup: (_host, options, callback) => options.all
          ? callback(null, [address])
          : callback(null, address.address, address.family),
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          resolve({ redirect: res.headers.location });
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new ProxyError(res.statusCode === 404 ? 404 : 502, `El addon respondió con error ${res.statusCode}.`));
          return;
        }
        let size = 0;
        const chunks = [];
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_RESPONSE) { req.destroy(new ProxyError(502, 'La respuesta del addon es demasiado grande.')); return; }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          try { resolve({ body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
          catch { reject(new ProxyError(502, 'El addon no devolvió JSON válido.')); }
        });
      });
      req.setTimeout(TIMEOUT, () => req.destroy(new ProxyError(504, 'El addon tardó demasiado en responder.')));
      req.on('error', reject);
      req.end();
    });
    if (!result.redirect) return result.body;
    if (redirects === 3) throw new ProxyError(502, 'Demasiadas redirecciones del addon.');
    url = validateUrl(new URL(result.redirect, url).href);
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

export function createAddonHandler(options = {}) {
  let active = 0;
  return async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'Método no permitido.' });
    // JSON + comprobación de origen evitan solicitudes entre sitios desde navegadores.
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Se requiere JSON.' });
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: 'Origen no permitido.' });
      } catch { return send(res, 403, { error: 'Origen no permitido.' }); }
    }
    if (active >= 40) return send(res, 503, { error: 'Demasiadas consultas simultáneas. Inténtalo de nuevo.' });
    active++;
    const controller = new AbortController();
    let timer;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY) throw new ProxyError(413, 'Solicitud demasiado grande.');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new ProxyError(400, 'JSON inválido.'); }
      if (typeof body?.url !== 'string') throw new ProxyError(400, 'Falta la URL del addon.');
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ProxyError(504, 'El addon tardó demasiado en responder.'));
        }, TIMEOUT);
      });
      const data = await Promise.race([fetchAddon(body.url, { ...options, signal: controller.signal }), deadline]);
      send(res, 200, data);
    } catch (error) {
      if (!res.headersSent) send(res, error instanceof ProxyError ? error.status : 502,
        { error: error instanceof ProxyError ? error.message : 'No se pudo conectar con el addon.' });
    } finally {
      clearTimeout(timer);
      active--;
    }
  };
}
