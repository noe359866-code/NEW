'use strict';
// Cliente HTTP compartido: User-Agent de navegador, timeout y cache en memoria.
// Sin esto, cada episodio abre decenas de paginas y los sitios nos limitan (429).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

const cache = new Map();
const MAX_ENTRIES = 300;
const TTL_MS = 10 * 60 * 1000;
const EPISODE_TTL_MS = 60 * 60 * 1000;

function ttlFor(url) {
  return /\/ver\/|-episodio-\d+|\/media\/[^/]+\/\d+/.test(url) ? EPISODE_TTL_MS : TTL_MS;
}

async function fetchText(url, { timeout = 12000, headers = {} } = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < ttlFor(url)) return hit.body;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...headers,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    const body = await res.text();
    cache.set(url, { body, time: Date.now() });
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, opts = {}) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}

function clearCache() { cache.clear(); }

module.exports = { fetchText, fetchJson, clearCache, UA };
