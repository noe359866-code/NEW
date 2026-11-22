#!/usr/bin/env node
'use strict';

// Un solo servidor Stremio/Nuvio. Sirve metadatos y enlaces; no retransmite
// vídeo ni acepta URLs de reproducción suministradas por el cliente.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('../manifest.json');
const { getDocument } = require('./documents');
const { createVodResolver, toStremioStream } = require('./vod');
const { createMetaResolver } = require('./meta');
const { PREFIX, SOURCE_IDS, SportsCatalog, resolveEntry } = require('../sports/sources');

const PAGE_SIZE = 100;
const landing = fs.readFileSync(path.join(__dirname, 'index.html'));

function toSportsMeta(entry, type) {
  const meta = {
    id: entry.id,
    type,
    name: entry.name,
    posterShape: 'square',
    genres: ['Deportes'],
    behaviorHints: { isLive: true },
    description: `Deportes en vivo · ${entry.source}${entry.league ? ' · ' + entry.league : ''}. El enlace directo se busca al reproducir.`
  };
  if (entry.poster) meta.poster = entry.poster;
  return meta;
}

function toSportsStream(entry, item) {
  return toStremioStream({
    name: entry.source,
    title: entry.name + (item.name ? ` · ${item.name}` : ''),
    url: item.url,
    headers: item.headers
  });
}

function paramsFromExtra(raw, query) {
  const params = new URLSearchParams(raw || '');
  for (const [key, value] of query.entries()) if (!params.has(key)) params.set(key, value);
  const search = String(params.get('search') || '').slice(0, 120).trim().toLowerCase();
  const requested = Number(params.get('skip') || 0);
  const skip = Number.isSafeInteger(requested) && requested >= 0 && requested <= 100000 ? requested : 0;
  return { search, skip };
}

function send(res, status, value, extra = {}) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  });
  res.end(body);
}

function createHandler(options = {}) {
  const get = options.get || getDocument;
  const catalog = options.catalog || new SportsCatalog({ get });
  const resolveVod = options.resolveVod || createVodResolver({
    fetcher: options.fetcher,
    tmdbKey: options.tmdbKey == null ? (process.env.TMDB_API_KEY || '') : options.tmdbKey
  });
  const resolveMeta = options.resolveMeta || createMetaResolver({
    fetcher: options.fetcher,
    loadProvider: options.loadProvider,
    tmdbKey: options.tmdbKey == null ? (process.env.TMDB_API_KEY || '') : options.tmdbKey
  });
  const maxConcurrent = Number.isInteger(options.maxConcurrent) && options.maxConcurrent > 0 ? options.maxConcurrent : 6;
  let active = 0;

  async function limited(res, work) {
    if (active >= maxConcurrent) {
      return send(res, 503, { error: 'Servicio ocupado; inténtalo de nuevo en unos segundos.' }, { 'Retry-After': '5' });
    }
    active++;
    try { return await work(); } finally { active--; }
  }

  return async function handler(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido' }, { Allow: 'GET, OPTIONS' });
    let url;
    try { url = new URL(req.url, 'http://addon.invalid'); } catch { return send(res, 400, { error: 'URL inválida' }); }
    try {
      if (url.pathname === '/manifest.json') return send(res, 200, manifest);
      if (url.pathname === '/healthz') return send(res, 200, { status: 'ok' });
      if (url.pathname === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8', 'Content-Length': landing.length,
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
        });
        return res.end(landing);
      }

      const cat = /^\/catalog\/(tv|channel)\/(nuvio-)?(deportes|tvenvivo|ondemand|thedaddy)(?:\/([^/]*))?\.json$/i.exec(url.pathname);
      if (cat) {
        const type = cat[1].toLowerCase();
        // Los IDs son únicos en el manifiesto y cada catálogo responde con su
        // propio tipo: channel para Nuvio y tv para Stremio.
        if ((type === 'channel') !== Boolean(cat[2])) return send(res, 404, { error: 'Catálogo no encontrado' });
        return await limited(res, async () => {
          const id = cat[3].toLowerCase();
          const { search, skip } = paramsFromExtra(cat[4], url.searchParams);
          const entries = await catalog.all(SOURCE_IDS.includes(id) ? id : null);
          const filtered = entries.filter(entry => !search || entry.name.toLowerCase().includes(search))
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
          return send(res, 200, { metas: filtered.slice(skip, skip + PAGE_SIZE).map(entry => toSportsMeta(entry, type)) });
        });
      }

      // Nuvio nombra los anime con el tipo `anime`; la ruta es la misma.
      const item = /^\/(meta|stream)\/(movie|series|tv|anime|channel)\/([^/]+)\.json$/i.exec(url.pathname);
      if (item) {
        let id;
        try { id = decodeURIComponent(item[3]); } catch { return send(res, 400, { error: 'Identificador inválido' }); }
        const resource = item[1].toLowerCase();
        const type = item[2].toLowerCase();
        if (id.length > 200) return send(res, 200, resource === 'stream' ? { streams: [] } : { meta: null });
        return await limited(res, async () => {
          if (id.startsWith(PREFIX)) {
            if (type !== 'channel' && type !== 'tv') return send(res, 200, resource === 'stream' ? { streams: [] } : { meta: null });
            // El cliente no puede indicar una URL: el ID debe existir en el
            // catálogo deportivo filtrado. OnDemand se renueva al reproducir.
            const force = resource === 'stream' && id.startsWith(PREFIX + 'ondemand:');
            const entry = await catalog.find(id, { force });
            if (!entry) return send(res, 200, resource === 'stream' ? { streams: [] } : { meta: null });
            if (resource === 'meta') return send(res, 200, { meta: toSportsMeta(entry, type) });
            const streams = await resolveEntry(entry, get);
            return send(res, 200, { streams: streams.map(stream => toSportsStream(entry, stream)).filter(Boolean) });
          }
          if (resource === 'meta') {
            // Nuvio pide los metadatos con el ID exacto que después enviará a
            // /stream. Se responde con el título y sus episodios, sin buscar
            // fuentes ni abrir reproductores.
            const meta = await resolveMeta(type, id).catch(() => null);
            return send(res, 200, { meta: meta || null });
          }
          // En Nuvio, tv también puede significar una serie TMDB. Los IDs
          // deportivos se distinguen antes por su prefijo propio.
          const streams = await resolveVod(type, id);
          return send(res, 200, { streams });
        });
      }
      return send(res, 404, { error: 'Ruta no encontrada' });
    } catch {
      // Un origen caído no rompe el resto del addon ni revela consultas o claves.
      return send(res, 200, /^\/stream\//i.test(url.pathname) ? { streams: [] } :
        /^\/meta\//i.test(url.pathname) ? { meta: null } : { metas: [] });
    }
  };
}

function createServer(options) {
  const server = http.createServer(createHandler(options));
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 7000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido');
  createServer().listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`Nébula ES: addon escuchando en el puerto ${port} (/manifest.json)`);
  });
}

module.exports = { PAGE_SIZE, toSportsMeta, toSportsStream, paramsFromExtra, createHandler, createServer };
