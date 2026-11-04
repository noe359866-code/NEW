import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAddonHandler, isPublicAddress, validateUrl } from '../server/addon-proxy.js';

const upstream = http.createServer((req, res) => {
  if (req.url === '/redirect/manifest.json') { res.writeHead(302, { location: 'http://127.0.0.1/manifest.json' }); return res.end(); }
  if (req.url === '/bad/manifest.json') return res.end('not json');
  if (req.url === '/missing/manifest.json') { res.writeHead(404); return res.end(); }
  res.end(JSON.stringify({ path: req.url }));
});
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const port = upstream.address().port;
// Conexión local inyectada solo para el test; la resolución de producción no permite loopback.
const api = http.createServer(createAddonHandler({
  lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  request: (url, options, callback) => http.request({ ...options, hostname: '127.0.0.1', port, path: url.pathname + url.search, lookup: undefined }, callback),
}));
await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
after(() => { api.close(); upstream.close(); });
const base = `http://127.0.0.1:${api.address().port}`;
const call = (url) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });

test('transporta manifest y recursos con configuración y extras', async () => {
  for (const path of ['/config/manifest.json', '/config/catalog/movie/top/search=hello%20world.json', '/config/meta/movie/tt123.json', '/config/stream/series/tt123%3A1%3A2.json']) {
    const res = await call(`http://addon.example${path}`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).path, path);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
});
test('bloquea direcciones privadas, credenciales, rutas arbitrarias y redirecciones privadas', async () => {
  for (const url of ['http://127.0.0.1/manifest.json', 'http://[::1]/manifest.json', 'http://169.254.169.254/manifest.json', 'http://user:pass@addon.example/manifest.json', 'https://addon.example/secret', 'http://addon.example/redirect/manifest.json']) {
    const res = await call(url);
    assert.ok(res.status >= 400, url);
  }
  for (const ip of ['127.0.0.1', '10.0.0.2', '192.168.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.throws(() => validateUrl('file:///manifest.json'));
});
test('propaga errores sin almacenar datos ni permitir solicitudes entre sitios', async () => {
  assert.equal((await call('http://addon.example/missing/manifest.json')).status, 404);
  assert.equal((await call('http://addon.example/bad/manifest.json')).status, 502);
  const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: '{}' });
  assert.equal(res.status, 403);
  assert.equal((await fetch(base)).status, 405);
});

test('rechaza DNS mixto y no llega a conectar con el destino', async () => {
  let connected = false;
  const server = http.createServer(createAddonHandler({
    lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '192.168.1.1', family: 4 }],
    request: () => { connected = true; throw new Error('No debe conectar'); },
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'http://mixed.example/manifest.json' }) });
    assert.equal(res.status, 403);
    assert.equal(connected, false);
  } finally { server.close(); }
});
