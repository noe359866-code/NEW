// Ejercita la imagen de producción completa, no solo el manejador aislado.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

process.on('uncaughtException', (error) => {
  console.error(error);
  if (process.env.GITHUB_ACTIONS) {
    console.error(`::error::${String(error.message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
  }
  process.exitCode = 1;
});

const base = process.env.NEBULA_BASE_URL || 'http://127.0.0.1:8080';
let ready = false;
for (let i = 0; i < 20; i++) {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(2000) });
    if (response.ok && (await response.text()).includes('<html')) { ready = true; break; }
  } catch { /* el contenedor puede estar arrancando */ }
  await delay(500);
}
assert.ok(ready, 'El frontend de producción no respondió');

async function addon(label, url, validate) {
  const response = await fetch(`${base}/api/addon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${label}: ${data.error || response.status}`);
  assert.ok(validate(data), `${label}: respuesta inesperada`);
  console.log(`OK ${label}`);
}

await addon('Cinemeta manifest', 'https://v3-cinemeta.strem.io/manifest.json', (data) => Boolean(data.name && Array.isArray(data.resources)));
await addon('Cinemeta catálogo', 'https://v3-cinemeta.strem.io/catalog/movie/top.json', (data) => Array.isArray(data.metas) && data.metas.length > 0);
await addon('Cinemeta metadatos', 'https://v3-cinemeta.strem.io/meta/movie/tt0133093.json', (data) => Boolean(data.meta?.name));
await addon('Torrentio manifest', 'https://torrentio.strem.fun/manifest.json', (data) => Boolean(data.name && Array.isArray(data.resources)));
await addon('Torrentio streams', 'https://torrentio.strem.fun/stream/movie/tt0133093.json', (data) => Array.isArray(data.streams));

const blocked = await fetch(`${base}/api/addon`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'http://127.0.0.1/manifest.json' }),
});
assert.equal(blocked.status, 403, 'El backend debe bloquear direcciones locales');
console.log('OK bloqueo de direcciones locales');
