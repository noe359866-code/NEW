'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { ROOT, loadProvider, mockFetch, makeTorrent, tmdbMovie, tmdbTv } = require('./utils');

/* ------------------------------------------------------------------ */
/* Fixtures: HTML con la misma estructura que sirven los sitios.       */
/* ------------------------------------------------------------------ */

const DON_SEARCH_MOVIE = `
<div class="seccion" id="buscador">
  <div class="card"><div class="card-body">
    <p class="lead">Resultados: <b>1</b></p>
    <ul class="list-unstyled">
      <li><span>
        <a class="text-primary" href="/pelicula/31199/A-Dog39s-Perfect-Christmas">A Dog's Perfect Christmas</a>
        <span>(DVDRip)</span>
      </span></li>
    </ul>
  </div></div>
</div>`;

const DON_SEARCH_SERIES = `
<div class="seccion" id="buscador">
  <div class="card"><div class="card-body">
    <p class="lead">Resultados: <b>1</b></p>
    <ul class="list-unstyled">
      <li><span>
        <a class="text-primary" href="/serie/131739/131739/La-emperatriz-divorciada-1-Temporada-1080p">La emperatriz divorciada - 1ª Temporada [1080p]</a>
        <span>(HDTV-1080p)</span>
      </span></li>
    </ul>
  </div></div>
</div>`;

const DON_DETAIL_MOVIE = `
<html><body>
  <h1>A Dog's Perfect Christmas</h1>
  <div class="d-inline-block ml-2"><p class="m-1"><a href="#">2026</a></p></div>
  <p><b>Formato:</b> DVDRip</p>
  <div class="descargar"><div class="card"><div class="card-body">
    <div class="text-center">
      <a class="btn btn-primary protected-download" data-content-id="31199" data-tabla="peliculas" href="#">Descargar</a>
    </div>
    <div class="d-inline-block"><p>1,35 GB</p></div>
  </div></div></div>
</body></html>`;

const DON_DETAIL_SERIES = `
<html><body>
  <h1>La emperatriz divorciada - 1ª Temporada [1080p]</h1>
  <p><b>Formato:</b> HDTV-1080p</p>
  <div class="descargar"><div class="card"><div class="card-body">
    <table class="table"><tbody>
      <tr><td>1x01 Descargar</td><td><a class="protected-download" data-content-id="901" data-tabla="episodios" href="#">Descargar</a></td><td>2026-11-05</td></tr>
      <tr><td>1x02 Descargar</td><td><a class="protected-download" data-content-id="902" data-tabla="episodios" href="#">Descargar</a></td><td>2026-11-05</td></tr>
    </tbody></table>
  </div></div></div>
</body></html>`;

const ELITE_SEARCH = `
<div class="card">
  <a href="https://www.elitetorrent.com/peliculas/ven-a-volar-conmigo/" title="Ven a volar conmigo">
    <img src="https://www.elitetorrent.com/wp-content/uploads/2026/06/ven-a-volar-conmigo-(poster691).jpg">
  </a>
  <img src="https://www.elitetorrent.com/wp-content/themes/EliteTorrent/images/espanol.png"> <em>720p</em>
  <span>2.5GB</span>
</div>`;

const ELITE_MAGNET_PARAM = 'VjJ4amQwMVZNVWRpUm14VVlsUldVVmxYY0hObFZtUjFZak5vYVUxWVFsbFZiRkpoWVZVeGRGVlliR0ZTYkVveVZGZDRWMVpXWkhOVmJGcG9ZWHBGTVZac2FIZFZNVkYzVGxSYVYxWkZTazlWYlhSTFZsWmFWMVZzY0U5V1ZHeElWVlpvZDFWR1NraFZiRUpWVFZad1QxUnNWWGhXVmtaVlZXczVVMkY2UlRCV1J6RTBVV3N3ZDAxVlpGUlhSemc1';

const ELITE_DETAIL = `
<html><body>
  <h1>Descargar ven a volar conmigo por torrent</h1>
  <p><b>Idioma:</b> Español</p>
  <p><b>Calidad:</b> 720p</p>
  <p><b>Tamaño:</b> 2.5GB</p>
  <a href="https://acortame-esto.com/s.php?i=${ELITE_MAGNET_PARAM}&st=et">Descargar por magnet link</a>
</body></html>`;

const DIVX_SEARCH = `
<table class="table"><tbody>
  <tr>
    <td><a href="https://divxtotal.foo/peliculas/proyecto-salvacion/" title="Proyecto Salvación">Proyecto Salvación</a></td>
    <td><a href="https://divxtotal.foo/category/aventura/">Aventura</a></td>
    <td>31-10-2026</td>
    <td>1,35 GB</td>
  </tr>
</tbody></table>`;

const DIVX_TORRENT_PARAM = 'aHR0cHM6Ly9kaXZ4dG90YWwuZm9vL3dwLWNvbnRlbnQvdXBsb2Fkcy8yMDI2LzEwL3Byb3llY3RvLXNhbHZhY2lvbjM5NS0oY2VudHJhbCkudG9ycmVudA==';
const DIVX_TORRENT_URL = 'https://divxtotal.foo/wp-content/uploads/2026/10/proyecto-salvacion395-(central).torrent';

const DIVX_DETAIL = `
<html><body>
  <h1>Proyecto Salvación</h1>
  <p><b>Calidad:</b> DVD-R</p>
  <p><b>Idioma:</b> Español</p>
  <table><tbody><tr>
    <td>ES</td><td>MP4</td><td>DVD-R</td><td>N/A</td>
    <td><a href="https://divxtotal.foo/download_tt.php?u=${DIVX_TORRENT_PARAM}">Descargar</a></td>
  </tr></tbody></table>
</body></html>`;

const SINSITIO_SEARCH = `
<div class="searchresults">
  <a href="https://www.sinsitio.site/dvdrip-bdrip/37317-zona-cero-bdrip-xvid-castellano.html" title="Zona Cero BDrip XviD Castellano">
    <img src="https://www.sinsitio.site/uploads/posts/2026-11/thumbs/gangchae.jpg">
  </a>
  <a href="https://www.sinsitio.site/dvdrip-bdrip/37317-zona-cero-bdrip-xvid-castellano.html">Zona Cero BDrip XviD Castellano</a>
</div>`;

const SINSITIO_DDL_PARAM = 'aHR0cHM6Ly93d3cuc2luc2l0aW8uc2l0ZS9pbmRleC5waHA%2FZG89ZG93bmxvYWQmaWQ9NzI1Nzc%3D';
const SINSITIO_DETAIL = `
<html><body>
  <h1>Zona Cero BDrip XviD Castellano</h1>
  <a href="https://www.sinsitio.site/ddlUrl.php?url=${SINSITIO_DDL_PARAM}&name=Zona%20Cero%20Bdrip%20Xvid%20Castellano">
    🎬 Zona Cero Bdrip Xvid Castellano2.55 GB
  </a>
</body></html>`;

const WOLF_SEARCH = `
<div class="grid">
  <a href="https://wolftorrent.com/pelicula/5dw2j7" title="Jack Reacher (4K-HDR)">
    <img src="https://wolftorrent.com/caratulas/peliculas/jack.jpg">
    <h3>Jack Reacher (4K-HDR)</h3>
  </a>
  <span>2012</span><strong>4K</strong><span>45,34 GB</span>
</div>`;

const WOLF_DETAIL = `
<html><body>
  <h1>Jack Reacher (4K-HDR)</h1>
  <span>Calidad</span><strong>4K</strong>
  <span>Tamaño</span><span>45,34 GB</span>
  <button>Descargar torrent</button>
</body></html>`;

const ENLACITO_PAGE = `
<html><body><div class="app-message">
  <a class="buttonPassword" href="https://enlacito.com/xyz">Continuar</a>
</div></body></html>`;

test('manifest: todos los scrapers tienen archivo compilado y exportan getStreams', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.ok(manifest.scrapers.length >= 7);
  for (const scraper of manifest.scrapers) {
    const file = path.join(ROOT, scraper.filename);
    assert.ok(fs.existsSync(file), `${scraper.id}: falta ${scraper.filename}`);
    const provider = loadProvider(scraper.id, { fetch: mockFetch([]) });
    assert.equal(typeof provider.getStreams, 'function', `${scraper.id}: getStreams no es función`);
    if (scraper.hasSettings) assert.equal(typeof provider.onSettings, 'function');
  }
});

test('DonTorrent: película → PoW → .torrent → magnet', async () => {
  const torrent = makeTorrent('A.Dogs.Perfect.Christmas.DVDRip.mkv', 1450000000);
  let powCalls = 0;

  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/31199', tmdbMovie('31199', "A Dog's Perfect Christmas")],
    ['dontorrent.tips/buscar', DON_SEARCH_MOVIE],
    ['dontorrent.tips/pelicula/31199', DON_DETAIL_MOVIE],
    ['api_validate_pow.php', (url, init) => {
      powCalls++;
      if (String(init.body).indexOf('"generate"') !== -1) {
        return { __json: { success: true, challenge: 'challenge-abc', difficulty: 3 } };
      }
      return { __json: { success: true, download_url: '/descargas/31199.torrent' } };
    }],
    ['/descargas/31199.torrent', { __binary: true, bytes: torrent.bytes }]
  ]);

  const provider = loadProvider('dontorrent', { fetch: fetchImpl });
  const streams = await provider.getStreams('31199', 'movie', null, null);

  assert.equal(streams.length, 1, 'debe devolver una fuente');
  assert.equal(streams[0].infoHash, torrent.infoHash);
  assert.match(streams[0].url, /^magnet:\?xt=urn:btih:/);
  assert.equal(streams[0].quality, 'SD');
  assert.match(streams[0].name, /DonTorrent/);
  assert.equal(powCalls, 2, 'generate + validate');
});

test('DonTorrent: serie elige el episodio pedido', async () => {
  const torrent = makeTorrent('La.emperatriz.divorciada.S01E02.1080p.mkv', 2200000000);

  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/tv/94997', tmdbTv('94997', 'La emperatriz divorciada')],
    ['dontorrent.tips/buscar', DON_SEARCH_SERIES],
    ['dontorrent.tips/serie/131739', DON_DETAIL_SERIES],
    ['api_validate_pow.php', (url, init) => {
      if (String(init.body).indexOf('"generate"') !== -1) {
        return { __json: { success: true, challenge: 'serie-1', difficulty: 3 } };
      }
      assert.match(String(init.body), /"nonce":\d+/);
      return { __json: { success: true, download_url: '/descargas/902.torrent' } };
    }],
    ['/descargas/902.torrent', { __binary: true, bytes: torrent.bytes }]
  ]);

  const provider = loadProvider('dontorrent', { fetch: fetchImpl });
  const streams = await provider.getStreams('94997', 'tv', 1, 2);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, torrent.infoHash);
  assert.equal(streams[0].quality, '1080p');
  assert.match(streams[0].title, /1x02/);
});

test('EliteTorrent: magnet real decodificado sin descargar .torrent', async () => {
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/37402', tmdbMovie('37402', 'Ven a volar conmigo', '2026')],
    ['elitetorrent.com/?s=', ELITE_SEARCH],
    ['elitetorrent.com/peliculas/ven-a-volar-conmigo/', ELITE_DETAIL]
  ]);

  const provider = loadProvider('elitetorrent', { fetch: fetchImpl });
  const streams = await provider.getStreams('37402', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'magnet:?xt=urn:btih:6D6FE32F4A7540CFD698C387A9F91084F16C70E3');
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].language, 'Castellano');
});

test('DivxTotal: download_tt.php en Base64 → .torrent → magnet', async () => {
  const torrent = makeTorrent('Proyecto.Salvacion.DVD-R.mp4', 1450000000);

  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/693134', tmdbMovie('693134', 'Proyecto Salvación')],
    ['divxtotal.foo/?s=', DIVX_SEARCH],
    ['divxtotal.foo/peliculas/proyecto-salvacion/', DIVX_DETAIL],
    [DIVX_TORRENT_URL, { __binary: true, bytes: torrent.bytes }]
  ]);

  const provider = loadProvider('divxtotal', { fetch: fetchImpl });
  const streams = await provider.getStreams('693134', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, torrent.infoHash);
  assert.match(streams[0].name, /DivxTotal/);
});

test('SinSitio: ddlUrl.php → .torrent → magnet', async () => {
  const torrent = makeTorrent('Zona.Cero.Bdrip.Xvid.Castellano.avi', 2550000000);

  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/1234567', tmdbMovie('1234567', 'Zona Cero')],
    ['sinsitio.site/index.php?do=search', SINSITIO_SEARCH],
    ['sinsitio.site/dvdrip-bdrip/37317', SINSITIO_DETAIL],
    ['sinsitio.site/index.php?do=download&id=72577', { __binary: true, bytes: torrent.bytes }]
  ]);

  const provider = loadProvider('sinsitio', { fetch: fetchImpl });
  const streams = await provider.getStreams('1234567', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, torrent.infoHash);
  assert.match(streams[0].name, /SinSitio/);
});

test('WolfMax4K: /api/descargas → Enlacito → link_out → .torrent → magnet', async () => {
  const torrent = makeTorrent('Jack.Reacher.4K.HDR.mkv', 45000000000);
  const torrentUrl = 'https://wolftorrent.com/descargas/abc123.torrent';
  const linkOut = Buffer.from(torrentUrl, 'utf8').toString('base64');

  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/75780', tmdbMovie('75780', 'Jack Reacher', '2012')],
    ['wolftorrent.com/buscar/', WOLF_SEARCH],
    ['wolftorrent.com/pelicula/5dw2j7', WOLF_DETAIL],
    ['wolftorrent.com/api/descargas', ENLACITO_PAGE],
    ['enlacito.com/xyz', '<html><body><form action="https://enlacito.com/go" method="post"><input type="hidden" name="linkser" value="token-1"></form></body></html>'],
    ['enlacito.com/go', `<!doctype html><script>var link_out = "${linkOut}";</script>`],
    [torrentUrl, { __binary: true, bytes: torrent.bytes }]
  ]);

  const provider = loadProvider('wolfmax4k', { fetch: fetchImpl });
  const streams = await provider.getStreams('75780', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, torrent.infoHash);
  assert.equal(streams[0].quality, '2160p');
  assert.match(streams[0].name, /WolfMax4K/);
});

test('WolfMax4K: link_out cifrado con AES (crypto-js) también se resuelve', async () => {
  const CryptoJS = require('crypto-js');
  const torrent = makeTorrent('Jack.Reacher.1080p.mkv', 8000000000);
  const torrentUrl = 'https://wolftorrent.com/descargas/aes456.torrent';
  const cipher = CryptoJS.AES.encrypt(torrentUrl, 'fee631d2cffda38a78b96ee6d2dfb43a').toString();

  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/75780', tmdbMovie('75780', 'Jack Reacher', '2012')],
    ['wolftorrent.com/buscar/', WOLF_SEARCH],
    ['wolftorrent.com/pelicula/5dw2j7', WOLF_DETAIL],
    ['wolftorrent.com/api/descargas', ENLACITO_PAGE],
    ['enlacito.com/xyz', '<html><body><form action="https://enlacito.com/go" method="post"><input type="hidden" name="linkser" value="token-1"></form></body></html>'],
    ['enlacito.com/go', `<!doctype html><script>var link_out = "${cipher}";</script>`],
    [torrentUrl, { __binary: true, bytes: torrent.bytes }]
  ]);

  const provider = loadProvider('wolfmax4k', { fetch: fetchImpl, cryptoJs: CryptoJS });
  const streams = await provider.getStreams('75780', 'movie', null, null);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, torrent.infoHash);
});

test('WolfMax4K: si aparece Turnstile devuelve lista vacía sin romper', async () => {
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/75780', tmdbMovie('75780', 'Jack Reacher', '2012')],
    ['wolftorrent.com/buscar/', WOLF_SEARCH],
    ['wolftorrent.com/pelicula/5dw2j7', WOLF_DETAIL],
    ['wolftorrent.com/api/descargas', '<html><div class="cf-turnstile"></div>Verificación Turnstile</html>']
  ]);

  const provider = loadProvider('wolfmax4k', { fetch: fetchImpl });
  const streams = await provider.getStreams('75780', 'movie', null, null);
  assert.equal(streams.length, 0);
});

test('red caída: cualquier provider devuelve [] sin lanzar', async () => {
  const fetchImpl = mockFetch([], { fallback: () => ({}) });
  for (const id of ['dontorrent', 'mejortorrent', 'elitetorrent', 'divxtotal', 'sinsitio', 'wolfmax4k', 'torrentlandia']) {
    const provider = loadProvider(id, { fetch: fetchImpl });
    const streams = await provider.getStreams('31199', 'movie', null, null);
    assert.equal(streams.length, 0, `${id} debe devolver [] cuando no hay red`);
  }
});

test('sin TMDB disponible: no se inventan resultados', async () => {
  const fetchImpl = mockFetch([]);
  const provider = loadProvider('dontorrent', { fetch: fetchImpl, tmdbKey: '' });
  const streams = await provider.getStreams('31199', 'movie', null, null);
  assert.equal(streams.length, 0);
});

test('resultados duplicados se deduplican por infohash', async () => {
  const torrent = makeTorrent('Duplicada.1080p.mkv', 1000);
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/550', tmdbMovie('550', 'Fight Club', '1999')],
    ['divxtotal.foo/?s=', DIVX_SEARCH],
    ['divxtotal.foo/peliculas/proyecto-salvacion/', DIVX_DETAIL],
    [DIVX_TORRENT_URL, { __binary: true, bytes: torrent.bytes }]
  ]);
  const provider = loadProvider('divxtotal', { fetch: fetchImpl });
  const streams = await provider.getStreams('550', 'movie', null, null);
  const hashes = streams.map((stream) => stream.infoHash);
  assert.equal(new Set(hashes).size, hashes.length);
});
