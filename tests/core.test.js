'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('./.build/core.cjs');

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
  assert.equal(core.solvePlayerPow('challenge', 9), null);
});
