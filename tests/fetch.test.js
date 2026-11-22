'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const zlib = require('node:zlib');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { safeFetch, requestHeaders, MAX_BYTES } = require('../addon/fetch');
const { budgetFetcher } = require('../addon/vod');
const { getDocument } = require('../addon/documents');
const { publicLookup, safeUrl } = require('../sports/http');

function fakeHttps(t) {
  const calls = [];
  const closedBeforeBody = [];
  const longText = Buffer.alloc(MAX_BYTES + 1, 97);
  const start = (url, options, callback) => {
    assert.equal(options.lookup, publicLookup);
    const call = { url, method: options.method || 'GET', headers: { ...options.headers } };
    calls.push(call);
    const req = new EventEmitter();
    let res;
    req.end = body => { call.body = body; };
    req.destroy = error => {
      if (res) res.destroy();
      if (error) process.nextTick(() => req.emit('error', error));
    };
    process.nextTick(() => {
      const target = new URL(url);
      res = new PassThrough();
      res.statusCode = 200;
      res.headers = { 'content-type': 'text/html; charset=utf-8' };
      let body = Buffer.from('<html>ok</html>');
      let stall = false;
      if (target.pathname === '/api/stream' && options.method === 'POST') {
        if (target.hostname === 'vidara.so') {
          const match = /redirect(301|302|303|307|308)/i.exec(JSON.parse(call.body).filecode);
          res.statusCode = match ? Number(match[1]) : 307;
          res.headers = { location: 'https://other.example/finish' };
        } else {
          res.headers = { 'content-type': 'application/json' };
          body = Buffer.from('{"streaming_url":"https://cdn.example/media.m3u8"}');
        }
      } else if (target.pathname === '/redirect-media') {
        res.statusCode = 302; res.headers = { location: 'https://cdn.example/live.m3u8?sig=secret' };
      } else if (target.pathname === '/redirect-private') {
        res.statusCode = 302; res.headers = { location: 'https://127.0.0.1/admin' };
      } else if (target.pathname === '/redirect-other') {
        res.statusCode = 302; res.headers = { location: 'https://other.example/finish' };
      } else if (target.pathname === '/loop') {
        res.statusCode = 302; res.headers = { location: '/loop' };
      } else if (target.pathname === '/no-extension') {
        res.headers = { 'content-type': 'application/vnd.apple.mpegurl' };
        body = Buffer.from('#EXTM3U');
      } else if (target.pathname === '/gzip') {
        res.headers = { 'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip' };
        body = zlib.gzipSync(Buffer.from('{"ok":true}'));
      } else if (target.pathname === '/large') {
        body = longText;
      } else if (target.pathname === '/large-gzip') {
        res.headers['content-encoding'] = 'gzip';
        body = zlib.gzipSync(longText);
      } else if (target.pathname === '/forbidden') {
        res.statusCode = 403;
        body = Buffer.from('<script id="anubis_challenge">{}</script>');
      } else if (target.pathname === '/stall') stall = true;
      callback(res);
      if (res.destroyed) closedBeforeBody.push(url);
      else if (!stall) res.end(body);
    });
    return req;
  };
  t.mock.method(https, 'get', start);
  t.mock.method(https, 'request', start);
  return { calls, closedBeforeBody };
}

test('cabeceras entrantes son limitadas y no permiten inyección', () => {
  const headers = requestHeaders({
    Referer: 'https://player.example/page', Cookie: 'session=abc',
    Authorization: 'secret', Host: '127.0.0.1', 'User-Agent': 'bad\r\nX-Injection: yes'
  });
  assert.equal(headers.Referer, 'https://player.example/page');
  assert.equal(headers.Cookie, 'session=abc');
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers.Host, undefined);
  assert.doesNotMatch(headers['User-Agent'], /X-Injection/);
  assert.equal(safeUrl('https://localhost./x', undefined, { page: true }), null);
  assert.equal(safeUrl('https://printer/x', undefined, { page: true }), null);
  assert.equal(safeUrl('https://host.localdomain/x', undefined, { page: true }), null);
});

test('transporte alojado valida redirects/DNS, corta medios y limita cuerpos', async t => {
  const { calls, closedBeforeBody } = fakeHttps(t);
  const initial = calls.length;
  await assert.rejects(safeFetch('https://cdn.example/direct.m3u8'), /No se solicitan medios/);
  await assert.rejects(safeFetch('https://ads.example/spot.mp4'), /No se solicitan medios/);
  await assert.rejects(safeFetch('https://127.0.0.1/private'), /URL de página no permitida/);
  await assert.rejects(safeFetch('https://example.com:8443/private'), /URL de página no permitida/);
  await assert.rejects(safeFetch('http://example.com/page'), /URL de página no permitida/);
  await assert.rejects(safeFetch('https://example.com/page', { method: 'POST' }), /Método no permitido/);
  assert.equal(calls.length, initial, 'no se abre ningún socket para URLs o métodos rechazados');

  const redirect = await safeFetch('https://site.example/redirect-media');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), 'https://cdn.example/live.m3u8?sig=secret');
  const sports = await getDocument('https://site.example/redirect-media');
  assert.equal(sports.redirectMedia, 'https://cdn.example/live.m3u8?sig=secret');
  await assert.rejects(safeFetch('https://site.example/redirect-private'), /Redirección no permitida/);
  await assert.rejects(safeFetch('https://site.example/loop'), /Demasiadas redirecciones/);
  assert.equal(calls.filter(call => call.url.endsWith('/loop')).length, 4);

  const nonDoc = await safeFetch('https://site.example/no-extension');
  assert.equal(nonDoc.ok, false);
  assert.equal(await nonDoc.text(), '');
  assert.ok(closedBeforeBody.some(url => url.endsWith('/no-extension')));
  assert.ok(calls.every(call => !call.url.includes('cdn.example')), 'no se siguen las redirecciones a vídeo');

  const json = await safeFetch('https://site.example/gzip');
  assert.deepEqual(await json.json(), { ok: true });
  const denied = await safeFetch('https://site.example/forbidden');
  assert.equal(denied.ok, false);
  assert.match(await denied.text(), /anubis_challenge/);
  await assert.rejects(safeFetch('https://site.example/large'), /demasiado grande/);
  await assert.rejects(safeFetch('https://site.example/large-gzip'), /demasiado grande/);

  const crossed = await safeFetch('https://site.example/redirect-other', {
    headers: { Cookie: 'session=secret', Referer: 'https://site.example/' }
  });
  assert.equal(crossed.url, 'https://other.example/finish');
  assert.equal(calls.find(call => call.url.endsWith('/redirect-other')).headers.Cookie, 'session=secret');
  assert.equal(calls.find(call => call.url === 'https://other.example/finish').headers.Cookie, undefined);

  await assert.rejects(safeFetch('https://site.example/stall', { signal: AbortSignal.timeout(20) }), /cancelada/);
});

test('Vidara: POST restringido valida destino, cuerpo y cabeceras, y no sigue redirecciones', async t => {
  const { calls } = fakeHttps(t);
  const body = JSON.stringify({ filecode: 'A1b2', device: 'web' });
  const result = await safeFetch('https://vidara.to/api/stream', {
    method: 'POST', body,
    headers: { Referer: 'https://vidara.to/e/A1b2?server=1', Origin: 'https://evil.example', Cookie: 'sid=example' }
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { streaming_url: 'https://cdn.example/media.m3u8' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body, body);
  assert.equal(calls[0].headers.Referer, 'https://vidara.to/e/A1b2?server=1');
  assert.equal(calls[0].headers.Origin, 'https://vidara.to');
  assert.equal(calls[0].headers.Accept, 'application/json');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.equal(calls[0].headers['Content-Length'], String(Buffer.byteLength(body)));

  const redirected = await safeFetch('https://vidara.so/api/stream', {
    method: 'POST', body, headers: { Referer: 'https://evil.example/path', Origin: 'https://evil.example' }
  });
  assert.equal(redirected.status, 307);
  assert.equal(redirected.headers.get('location'), 'https://other.example/finish');
  assert.equal(calls.length, 2, 'el POST no se reenvía ni se convierte en GET');
  assert.equal(calls[1].headers.Referer, 'https://vidara.so/');
  assert.equal(calls[1].headers.Origin, 'https://vidara.so');

  await safeFetch('https://vidvara.fit/api/stream', {
    method: 'POST', body, headers: { Referer: 'https://vidara.to/e/A1b2', Origin: 'https://evil.example' }
  });
  assert.equal(calls[2].headers.Referer, 'https://vidara.to/e/A1b2', 'se conserva el reproductor conocido al usar un espejo');
  assert.equal(calls[2].headers.Origin, 'https://vidvara.fit');

  for (const [url, invalidBody] of [
    ['https://evil.example/api/stream', body],
    ['https://vidara.to.evil.example/api/stream', body],
    ['http://vidara.to/api/stream', body],
    ['https://vidara.to:444/api/stream', body],
    ['https://vidara.to/other', body],
    ['https://vidara.to/api/stream?proxy=evil', body],
    ['https://vidara.to/api/stream#evil', body],
    ['https://vidara.to/api/stream', '{broken'],
    ['https://vidara.to/api/stream', JSON.stringify({ filecode: 'a/b', device: 'web' })],
    ['https://vidara.to/api/stream', JSON.stringify({ filecode: 'x'.repeat(65), device: 'web' })],
    ['https://vidara.to/api/stream', JSON.stringify({ filecode: 'x', device: 'mobile' })],
    ['https://vidara.to/api/stream', JSON.stringify({ filecode: 'x', device: 'web', url: 'https://localhost/' })],
    ['https://vidara.to/api/stream', JSON.stringify(['x', 'web'])],
    ['https://vidara.to/api/stream', 'x'.repeat(257)]
  ]) await assert.rejects(safeFetch(url, { method: 'POST', body: invalidBody }));
  await assert.rejects(safeFetch('https://vidara.to/api/stream', { method: 'PUT', body }));
  await assert.rejects(safeFetch('https://vidara.to/api/stream', { method: 'GET', body }));
  assert.equal(calls.length, 3, 'ninguna petición inválida abre un socket');
});

test('Vidara: POST conserva la protección DNS contra direcciones privadas', async t => {
  const dns = require('node:dns');
  t.mock.method(dns, 'lookup', (name, options, callback) => {
    assert.equal(name, 'vidara.to');
    callback(null, [{ address: '127.0.0.1', family: 4 }]);
  });
  await assert.rejects(safeFetch('https://vidara.to/api/stream', {
    method: 'POST', body: '{"filecode":"A1b2","device":"web"}'
  }), /privad|públic|DNS|bloquead/i);
});

test('Vidara: ningún tipo de redirección POST reenvía el código', async t => {
  const { calls } = fakeHttps(t);
  for (const status of [301, 302, 303, 307, 308]) {
    const body = JSON.stringify({ filecode: `redirect${status}`, device: 'web' });
    const response = await safeFetch('https://vidara.so/api/stream', { method: 'POST', body });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('location'), 'https://other.example/finish');
  }
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.method === 'POST' && call.url === 'https://vidara.so/api/stream'));
});

test('presupuesto alojado cuenta cada redirección sin perjudicar a otra fuente', async t => {
  const { calls } = fakeHttps(t);
  const controller = new AbortController();
  const shared = budgetFetcher(safeFetch, controller.signal, 3);
  const one = budgetFetcher(shared, controller.signal, 2);
  const two = budgetFetcher(shared, controller.signal, 2);
  await assert.rejects(one('https://site.example/loop'), /Presupuesto de búsqueda agotado/);
  assert.equal(calls.length, 2, 'la tercera redirección no abre un socket');
  assert.equal((await two('https://other.example/finish')).status, 200);
  assert.equal(calls.length, 3);
  await assert.rejects(two('https://other.example/finish'), /Presupuesto de búsqueda agotado/);
  assert.equal(calls.length, 3, 'el límite global incluye ambas fuentes');
  controller.abort();
});
