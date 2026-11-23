'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('./.build/core.cjs');

// Los módulos del core leen `globalThis.fetch`; se sustituye solo en esta prueba.
function mockFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push({ url: String(url) });
    for (const [matcher, handler] of routes) {
      const match = typeof matcher === 'string' ? String(url).includes(matcher) : matcher.test(String(url));
      if (!match) continue;
      const value = typeof handler === 'function' ? await handler(url) : handler;
      if (value == null) continue;
      const status = value.__response ? value.__response.status : 200;
      const body = value.__json ? JSON.stringify(value.__json) : (value.__response ? '' : String(value));
      return new Response(body, { status, headers: { 'content-type': 'application/json' } });
    }
    return new Response('', { status: 404 });
  };
  fn.calls = calls;
  return fn;
}

function encryptLink(url, challenge, salt) {
  const key = crypto.createHash('sha256').update(challenge + salt).digest();
  const iv = Buffer.alloc(16, 7);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(url), cipher.final()]).toString('base64');
}

test('normalización y atributos no confunden src con data-src', () => {
  assert.equal(core.norm('Película: La Niña'), 'pelicula la nina');
  assert.equal(core.attrOf('<iframe data-src="/falso" src="/real">', 'src'), '/real');
  assert.equal(core.attrOf('<iframe data-src="/falso">', 'src'), null);
  for (const value of ['', 'abc', 'ñ 🎬', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000)]) {
    assert.equal(core.sha256Hex(value), crypto.createHash('sha256').update(value).digest('hex'));
  }
});

test('directMediaUrl solo acepta HLS/MP4 públicos y no páginas de embed', () => {
  assert.equal(core.directMediaUrl('https://www.cdn.example/a.m3u8?sig=ABC'), 'https://www.cdn.example/a.m3u8?sig=ABC');
  assert.equal(core.directMediaUrl('https://cdn.example/a.mp4'), 'https://cdn.example/a.mp4');
  assert.equal(core.directMediaUrl('https://player.example/embed?url=https://cdn.example/a.m3u8'), null);
  assert.equal(core.directMediaUrl('https://127.0.0.1/a.mp4'), null);
  assert.equal(core.directMediaUrl('https://192.168.0.4/a.m3u8'), null);
  assert.equal(core.directMediaUrl('https://127.1/a.mp4'), null);
  assert.equal(core.directMediaUrl('https://0x7f000001/a.mp4'), null);
  assert.equal(core.directMediaUrl('https://router/a.mp4'), null);
  assert.equal(core.directMediaUrl('https://public.example.localdomain/a.mp4'), null);
  assert.equal(core.directMediaUrl('https://8.8.8.8/a.mp4'), null);
  assert.equal(core.directMediaUrl('magnet:?xt=urn:btih:aaaa'), null);
  assert.equal(core.directMediaUrl('https://cdn.example/a.torrent'), null);
  for (const value of ['about:blank', 'data:text/html,hello', 'file:///etc/passwd', 'javascript:alert(1)', 'blob:https://cdn.example/video']) {
    assert.equal(core.publicHttpUrl(value, 'https://player.example/e/1'), null, value);
  }
});

test('valida hosts numéricos sin depender de que URL normalice IPv4', () => {
  class JavaLikeURL {
    constructor(value) {
      const parsed = new URL(value);
      const authority = /^https?:\/\/([^/?#]+)/i.exec(value)[1];
      this.href = value;
      this.hostname = authority.replace(/:\d+$/, '');
      this.pathname = parsed.pathname;
      this.search = parsed.search;
      this.origin = parsed.origin;
    }
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '.build/core.cjs'), 'utf8'), { module, URL: JavaLikeURL });
  for (const host of ['127.1', '0177.0.0.1', '0x7f000001', '%31%32%37.0.0.1', '127.0.0.1.', '8.8.8.8', 'router']) {
    assert.equal(module.exports.publicHttpUrl(`https://${host}/movie.mp4`), null, host);
  }
  assert.equal(module.exports.publicHttpUrl('https://cdn.example/movie.mp4'), 'https://cdn.example/movie.mp4');
});

test('encuentra medios absolutos, relativos y escapados, pero no anuncios', () => {
  const html = `<script>var src="https:\\/\\/cdn.example\\/master.m3u8?token=a\\u0026v=1";</script>
    <video><source src="/video/episode.mp4?x=2"></video>
    <script>var ad="https://cdn.example/advert/trailer.mp4";</script>
    <source src="https://adserver.example/clip.mp4"><source src="https://cdn.example/publicidad/spot.mp4">`;
  assert.deepEqual(core.findDirectMedia(html, 'https://player.example/e/1'), [
    'https://cdn.example/master.m3u8?token=a&v=1',
    'https://player.example/video/episode.mp4?x=2'
  ]);
});

test('desempaqueta P.A.C.K.E.R sin ejecutar el JavaScript remoto', () => {
  const html = `eval(function(p,a,c,k,e,d){return p}('0:[{1:"2"}]',3,3,'sources|file|https://cdn.example/hls/master.m3u8'.split('|'),0,{}))`;
  const unpacked = core.unpackPlayerScript(html);
  assert.match(unpacked, /sources:\[\{file:/);
  assert.deepEqual(core.findDirectMedia(html, 'https://player.example'), ['https://cdn.example/hls/master.m3u8']);
});

test('data-player en Base64 y dataLink AES producen enlaces de reproductor, no embeds falsos', () => {
  const encoded = Buffer.from('https://filemoon.example/e/123').toString('base64');
  const links = core.pagePlayerLinks(`<a data-player="${encoded}">filemoon</a>`, 'https://latanime.org/ver/a');
  assert.equal(links[0].url, 'https://filemoon.example/e/123');
  const lazy = core.pagePlayerLinks(`<iframe src="about:blank" data-litespeed-src="https://player.example/e/456"></iframe>
    <iframe src="https://www.youtube.com/embed/trailer"></iframe>
    <iframe src="https://ads.example/spot.mp4"></iframe>`, 'https://site.example/');
  assert.deepEqual(lazy.map(item => item.url), ['https://player.example/e/456']);

  const encrypted = encryptLink('https://player.example/embed/abc', 'reto', 'sal');
  const groups = [{ video_language: 'LAT', sortedEmbeds: [{ servername: 'filemoon', link: encrypted }] }];
  const html = `const LINK_CHALLENGE = 'reto'; const LINK_SALT = 'sal'; let dataLink = ${JSON.stringify(groups)};`;
  const decoded = core.embed69Links(html, 'https://embed69.org/f/x');
  assert.equal(decoded.length, 1);
  assert.equal(decoded[0].url, 'https://player.example/embed/abc');
  assert.equal(decoded[0].language, 'Latino');
  // Anubis cuenta bits: dificultad 4 = 4 bits = primer nibble hexadecimal 0.
  const solved = core.solvePlayerPow('challenge', 4);
  assert.ok(solved && solved.hash[0] === '0');
  assert.equal(core.sha256Hex('challenge' + solved.nonce), solved.hash);
  assert.equal(core.solvePlayerPow('challenge', 40), null);
});

// Referencia: FlixLatamProvider.solvePoW de StreamflixReborn. Embed69 valida
// «hash.startsWith("0".repeat(difficulty))», es decir ceros HEXADECIMALES, no
// bits como Anubis. Con el criterio equivocado el dataLink no se descifraba.
test('Embed69 resuelve su PoW con ceros hexadecimales y descifra el dataLink', () => {
  const solved = core.solvePlayerPowHex('reto', 4);
  assert.ok(solved, 'resuelve 4 ceros hexadecimales');
  assert.match(solved.hash, /^0000/);
  assert.equal(core.sha256Hex('reto' + solved.nonce), solved.hash);
  assert.equal(core.solvePlayerPowHex('reto', 9), null, 'un presupuesto imposible no se acepta');

  const key = crypto.createHash('sha256').update('reto' + solved.nonce + 'sal').digest();
  const iv = Buffer.alloc(16, 3);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const link = Buffer.concat([iv, cipher.update('https://player.example/embed/pow'), cipher.final()]).toString('base64');
  const html = `const POW_CHALLENGE = 'reto'; const POW_SALT = 'sal'; const POW_DIFFICULTY = 4;
    let dataLink = ${JSON.stringify([{ video_language: 'LAT', sortedEmbeds: [{ servername: 'filemoon', link }] }])};`;
  const links = core.embed69Links(html, 'https://embed69.org/f/x');
  assert.equal(links.length, 1);
  assert.equal(links[0].url, 'https://player.example/embed/pow');
});

test('dataLink en formato cabecera.payload.firma se decodifica en base64', () => {
  const payload = Buffer.from(JSON.stringify({ link: 'https://player.example/embed/jwt' })).toString('base64').replace(/=+$/, '');
  const link = ['eyJhbGciOiJIUzI1NiJ9', payload, 'firma'].join('.');
  const html = `let dataLink = ${JSON.stringify([{ video_language: 'LAT', sortedEmbeds: [{ servername: 'streamtape', link }] }])};`;
  const links = core.embed69Links(html, 'https://embed69.org/f/x');
  assert.equal(links.length, 1);
  assert.equal(links[0].url, 'https://player.example/embed/jwt');
});

test('go_to_playerVast aporta los reproductores y descarta las descargas', () => {
  const html = `<ul class="OD_1">
    <li onclick="go_to_playerVast('https://p.example/e/1')"><span>Filemoon</span></li>
    <li onclick="go_to_playerVast('https://p.example/dl')"><span>Download</span></li>
    <li onclick="go_to_playerVast('//p2.example/e/2')"><span>Streamtape</span></li>
  </ul>`;
  const links = core.pagePlayerLinks(html, 'https://embed69.org/f/tt1/');
  assert.deepEqual(links.map(item => item.url), ['https://p.example/e/1', 'https://p2.example/e/2']);
  assert.equal(links[0].name, 'Filemoon');
});

test('Cinemeta aporta el id de TMDB cuando el metadato lo incluye', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/series/tt0417299.json', { __json: { meta: {
      type: 'series', name: 'Avatar: The Last Airbender', year: '2005', moviedb_id: 246 } } }],
    ['api.themoviedb.org', { __response: { status: 403 } }]
  ]);
  const previous = globalThis.fetch;
  globalThis.fetch = fetch;
  let media;
  try {
    media = await core.resolveMedia('tt0417299', 'series', 3, 1);
  } finally { globalThis.fetch = previous; }
  assert.equal(media.tmdbId, '246');
  assert.equal(media.title, 'Avatar: The Last Airbender');
  assert.equal(media.isTv, true);
});

test('idiomas: cada web se etiqueta como Multi, Latino, Castellano, Inglés o Subtitulado', () => {
  const core = require('./.build/core.cjs');
  const expected = {
    // Multi-audio
    'multi': 'Multi', 'Dual Audio': 'Multi', 'MULTI | 1080p': 'Multi',
    // Español de Latinoamérica (se comprueba antes que «español»)
    'latino': 'Latino', 'LAT': 'Latino', 'Español Latino': 'Latino',
    'Español (Latinoamérica)': 'Latino', 'Audio Latino HD': 'Latino',
    // Español de España
    'castellano': 'Castellano', 'Español': 'Castellano', 'Spanish': 'Castellano',
    // Inglés
    'English': 'Inglés', 'en': 'Inglés',
    // Subtítulos
    'Español Subtitulado': 'Castellano Subtitulado',
    'Japonés Subtitulado': 'Japonés Subtitulado',
    'English subtitles': 'Inglés Subtitulado',
    'SUBTITULADO': 'Subtitulado',
    // Originales de los catálogos de anime/dorama
    'Hindi': 'Hindi', 'jap': 'Japonés',
    // Los sitios pegan la calidad al idioma: «Kat 1 - Hindi1080p»
    'Kat 1 - Hindi1080p': 'Hindi', 'Kat 2 - English1080p': 'Inglés', 'Latino720p': 'Latino',
    // Sin pista de idioma
    '1080p': null, '': null
  };
  for (const [text, label] of Object.entries(expected)) {
    assert.equal(core.languageLabel(text), label, text);
  }
  // «Original» / «VO» no identifican un idioma: no se inventa «Inglés».
  assert.equal(core.languageLabel('Original'), null);
  assert.equal(core.languageLabel('VO'), null);
  // «Español Latino» nunca debe caer en Castellano.
  assert.notEqual(core.languageLabel('Español Latino'), 'Castellano');
});

test('idiomas: al ordenar, el audio en español va antes que las versiones solo subtituladas', () => {
  const core = require('./.build/core.cjs');
  const streams = [
    { quality: '1080p', language: 'Japonés Subtitulado', url: 'https://cdn.example/3.mp4' },
    { quality: '1080p', language: 'Multi', url: 'https://cdn.example/1.mp4' },
    { quality: '1080p', language: 'Inglés Subtitulado', url: 'https://cdn.example/4.mp4' },
    { quality: '1080p', language: 'Castellano', url: 'https://cdn.example/2b.mp4' },
    { quality: '1080p', language: 'Latino', url: 'https://cdn.example/2.mp4' }
  ];
  const ordered = core.sortByQuality(streams).map(stream => stream.language);
  assert.deepEqual(ordered, ['Multi', 'Latino', 'Castellano', 'Inglés Subtitulado', 'Japonés Subtitulado']);
});
