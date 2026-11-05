'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadProvider, mockFetch, makeTorrent, tmdbMovie, tmdbTv } = require('./utils');

/* ------------------------------------------------------------------ */
/* Fixtures construidos a partir del HTML real de cada sitio           */
/* (capturado el 5 de noviembre de 2026).                              */
/* ------------------------------------------------------------------ */

const TGX_SEARCH_MOVIE = `
<main>
  <a href="https://en.torrentgalaxy-official.is/movies/the-mongoose-2026">
    <img src="https://image.tmdb.org/t/p/w342/5rhTDKUhPYvpdQIijFIs5VoWsON.jpg">
    <h3>The Mongoose</h3>
    <span>2026</span><span>⭐6.4</span>
  </a>
  <a href="https://en.torrentgalaxy-official.is/movies/wildwood-2026">
    <h3>Wildwood</h3><span>2026</span>
  </a>
</main>`;

const TGX_DETAIL_MOVIE = `
<main>
  <h1>The Mongoose</h1>
  <section id="torrents">
    <h2>🧲 Torrents 4</h2>
    <table><tbody>
      <tr>
        <td>The.Mongoose.2026.2160p.WEB-DL.DDP5.1</td>
        <td>2160p</td><td>7.4 GB</td><td>812</td>
        <td><a href="magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=The.Mongoose.2026.2160p">🧲</a></td>
      </tr>
      <tr>
        <td>The.Mongoose.2026.1080p.WEB-DL.DDP5.1</td>
        <td>1080p</td><td>2.1 GB</td><td>1543</td>
        <td><a href="magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=The.Mongoose.2026.1080p">🧲</a></td>
      </tr>
    </tbody></table>
  </section>
</main>`;

const TGX_SEARCH_SERIES = `
<main>
  <a href="https://en.torrentgalaxy-official.is/series/tierra-de-mafiosos-2025">
    <h3>Tierra de mafiosos</h3><span>2025</span>
  </a>
</main>`;

const TGX_DETAIL_SERIES = `
<main>
  <h1>Tierra de mafiosos</h1>
  <table><tbody>
    <tr>
      <td>MobLand.S02E02.1080p.WEB-DL</td>
      <td>1080p</td><td>1.3 GB</td><td>402</td>
      <td><a href="magnet:?xt=urn:btih:3333333333333333333333333333333333333333&dn=MobLand.S02E02.1080p">🧲</a></td>
    </tr>
    <tr>
      <td>MobLand.S02E03.1080p.WEB-DL</td>
      <td>1080p</td><td>1.2 GB</td><td>311</td>
      <td><a href="magnet:?xt=urn:btih:4444444444444444444444444444444444444444&dn=MobLand.S02E03.1080p">🧲</a></td>
    </tr>
  </tbody></table>
</main>`;

const TGX_CHALLENGE = `
<!DOCTYPE html><html><head><title>Just a moment...</title></head>
<body><h2>Performing security verification</h2>
<div id="cf-chl-widget"></div></body></html>`;

/* ------------------------------------------------------------------ */

const GT_SEARCH = `
<article>
  <a href="https://grantorrent.fyi/peliculas/la-mangosta/">
    <img src="https://image.tmdb.org/t/p/w185/2UkYw2GCXif38KoX3vDFNZnVlbi.jpg" alt="La mangosta">
    <h3>La mangosta</h3>
  </a>
  <a href="https://grantorrent.fyi/peliculas/la-mangosta/">La mangosta</a>
  <span>2026</span><span>6.4</span><span>HD 1080p</span>
</article>
<article>
  <a href="https://grantorrent.fyi/peliculas/otra-pelicula-2025/">
    <h3>Otra película</h3>
  </a>
  <span>2025</span>
</article>`;

const GT_DETAIL_MOVIE = `
<div id="info"><h1>La mangosta</h1>
  <span>Oct. 29, 2026</span>
  <span>Audio: Castellano</span><span>Calidad: HD 1080p</span>
</div>
<div id="linksx">
  <table><tbody>
    <tr><th>Opciones</th><th>Calidad</th><th>Idioma</th><th>Tamaño</th><th>Clicks</th></tr>
    <tr>
      <td><img src="https://s2.googleusercontent.com/s2/favicons?domain=free.7hd.club"><a href="https://grantorrent.fyi/enlaces/jbcf78im11/">Descarga</a></td>
      <td><b>HD 1080p</b></td><td>Español Latino</td><td>---</td><td>18</td>
    </tr>
    <tr>
      <td><img src="https://s2.googleusercontent.com/s2/favicons?domain=utorrent.com"><a href="https://grantorrent.fyi/enlaces/mczlwfzdtb/">Obtener torrent</a></td>
      <td><b>BluRay-720p</b></td><td>Castellano</td><td>---</td><td>44</td>
    </tr>
  </tbody></table>
</div>`;

const GT_SHORT_PAGE = `
<html><body>
<a href="https://filess.top/es/mczlwfzdtb/file">Continuar</a>
Haga clic en el botón para continuar
</body></html>`;

const GT_HOST_PAGE = `
<html><body>
<div class="filename">The-Mongoose-(BluRay-720p)-(dqLY).torrent</div>
<a href="https://filess.top/es/mczlwfzdtb/download">Descargar</a>
</body></html>`;

const GT_SEARCH_SERIES = `
<article>
  <a href="https://grantorrent.fyi/series/tierra-de-mafiosos/"><h3>Tierra de mafiosos</h3></a>
  <span>2025</span>
</article>`;

const GT_EPISODE_PAGE = `
<div id="info"><h1>Tierra de mafiosos: 2x2</h1>
  <span>Audio: Castellano</span><span>Calidad: HD 1080p</span>
</div>
<table><tbody>
  <tr>
    <td><img src="https://s2.googleusercontent.com/s2/favicons?domain=utorrent.com"><a href="https://grantorrent.fyi/enlaces/6nfd9fqiwz/">Obtener torrent</a></td>
    <td><b>HD 1080p</b></td><td>Castellano</td><td>---</td><td>2552</td>
  </tr>
</tbody></table>`;

/* ------------------------------------------------------------------ */

const CC_SEARCH = `
<div class="movies-list">
  <div class="ml-item">
    <a href="https://www.cinecalidad.am/ver-pelicula/colision/" title="Colisión">
      <img src="https://image.tmdb.org/t/p/w342//sMPIiaOoyTr5o6s602KIVMJX3P2.jpg" alt="Colisión">
      <span class="in_title">Colisión</span>
    </a>
    <span>Película</span><span>Dual 1080p</span><span>6.8</span>
  </div>
  <div class="ml-item">
    <a href="https://www.cinecalidad.am/ver-pelicula/armageddon/" title="Armageddon">
      <span class="in_title">Armageddon</span>
    </a>
  </div>
</div>`;

const CC_DETAIL_MOVIE = `
<html><body>
<h1>Colisión</h1>
<div class="info"><b>Audio:</b> Latino e idioma original<br><b>Calidad:</b> Dual 1080p</div>
<div class="downlinks">
  <p><a href="https://www.cinecalidad.am/ver-pelicula/colision/?download=ZDRWNUVNVjY3eTFGdHo4TjlWUVp0Zz09">Mega</a>
     <a href="https://www.cinecalidad.am/ver-pelicula/colision/?download=NUFEcVJpTGdDMXpuVEt0Ym56MGRiZz09">1fichier</a></p>
  <p><a href="magnet:?xt=urn:btih:cbbc40761a1fe12d94e70ddde1def7dc180b1cd8&dn=Colision.2026.Dual.1080p&xl=530399908">uTorrent1080p</a></p>
</div>
</body></html>`;

const CC_SEARCH_SERIES = `
<div class="ml-item">
  <a href="https://www.cinecalidad.am/ver-serie/trackers/" title="Trackers">
    <span class="in_title">Trackers</span>
  </a>
  <span>Series</span><span>Full HD</span>
</div>`;

const CC_EPISODE_PAGE = `
<html><body>
<h1>Trackers 1x2</h1>
<div class="info"><b>Audio:</b> Latino y original</div>
<div class="downlinks">
  <p><a href="magnet:?xt=urn:btih:cbbc40761a1fe12d94e70ddde1def7dc180b1cd8&dn=Trackers.S01E02.2019.720p-Dual-Lat&xl=530399908">uTorrentDual 1080p Ligero</a></p>
</div>
</body></html>`;

/* ------------------------------------------------------------------ */
/* TorrentGalaxy                                                      */
/* ------------------------------------------------------------------ */

test('TorrentGalaxy: ficha de película → magnets por release', async () => {
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/1275779', tmdbMovie('1275779', 'The Mongoose', '2026')],
    ['en.torrentgalaxy-official.is/movies?keyword=', TGX_SEARCH_MOVIE],
    ['en.torrentgalaxy-official.is/movies/the-mongoose-2026', TGX_DETAIL_MOVIE]
  ]);

  const provider = loadProvider('torrentgalaxy', { fetch: fetchImpl });
  const streams = await provider.getStreams('1275779', 'movie', null, null);

  assert.equal(streams.length, 2);
  assert.equal(streams[0].quality, '2160p');
  assert.equal(streams[0].seeders, 812);
  assert.equal(streams[0].infoHash, '1111111111111111111111111111111111111111');
  assert.match(streams[0].url, /^magnet:\?xt=urn:btih:1111/);
  assert.equal(streams[1].quality, '1080p');
  assert.equal(streams[0].language, 'Inglés');
  assert.equal(streams[0].provider, 'torrentgalaxy');
});

test('TorrentGalaxy: serie filtra el episodio pedido', async () => {
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/tv/247718', tmdbTv('247718', 'Tierra de mafiosos', '2025')],
    ['en.torrentgalaxy-official.is/series?keyword=', TGX_SEARCH_SERIES],
    ['en.torrentgalaxy-official.is/series/tierra-de-mafiosos-2025', TGX_DETAIL_SERIES]
  ]);

  const provider = loadProvider('torrentgalaxy', { fetch: fetchImpl });
  const streams = await provider.getStreams('247718', 'tv', 2, 3);

  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, '4444444444444444444444444444444444444444');
});

test('TorrentGalaxy: desafío de Cloudflare → VidSrc y lista vacía sin romper', async () => {
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/1275779', tmdbMovie('1275779', 'The Mongoose', '2026')],
    ['torrentgalaxy-official.is/', TGX_CHALLENGE]
  ]);

  const provider = loadProvider('torrentgalaxy', { fetch: fetchImpl, settings: { includeVidsrc: 'false' } });
  const streams = await provider.getStreams('1275779', 'movie', null, null);
  assert.equal(streams.length, 0);

  const fallback = loadProvider('torrentgalaxy', { fetch: fetchImpl });
  const withVidsrc = await fallback.getStreams('1275779', 'movie', null, null);
  assert.equal(withVidsrc.length, 1);
  assert.equal(withVidsrc[0].type, 'http');
  assert.match(withVidsrc[0].url, /vidsrc\.to\/embed\/movie\/1275779/);
});

/* ------------------------------------------------------------------ */
/* GranTorrent                                                        */
/* ------------------------------------------------------------------ */

test('GranTorrent: /enlaces/<code>/ → host de ficheros → .torrent → magnet', async () => {
  const torrent = makeTorrent('The-Mongoose-(BluRay-720p)-(dqLY).mkv', 1450000000);

  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/1275779', tmdbMovie('1275779', 'La mangosta', '2026')],
    ['grantorrent.fyi/?s=', GT_SEARCH],
    ['grantorrent.fyi/peliculas/la-mangosta/', GT_DETAIL_MOVIE],
    ['grantorrent.fyi/enlaces/jbcf78im11/', GT_SHORT_PAGE],
    ['grantorrent.fyi/enlaces/mczlwfzdtb/', GT_SHORT_PAGE],
    ['filess.top/es/mczlwfzdtb/file', GT_HOST_PAGE],
    ['filess.top/es/mczlwfzdtb/download', { __binary: true, bytes: torrent.bytes }]
  ]);

  const provider = loadProvider('grantorrent', { fetch: fetchImpl });
  const streams = await provider.getStreams('1275779', 'movie', null, null);

  assert.ok(streams.length >= 1, 'debe devolver al menos una fuente');
  assert.equal(streams[0].infoHash, torrent.infoHash);
  assert.equal(streams[0].provider, 'grantorrent');
  assert.match(streams[0].url, /^magnet:\?xt=urn:btih:/);
  // la fila «Obtener torrent» (Castellano 720p) va primero
  assert.ok(streams.some((stream) => stream.language === 'Castellano'));
});

test('GranTorrent: el ajuste preferredLanguage filtra el idioma', async () => {
  const torrent = makeTorrent('La.Mangosta.Latino.mkv', 1000);
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/1275779', tmdbMovie('1275779', 'La mangosta', '2026')],
    ['grantorrent.fyi/?s=', GT_SEARCH],
    ['grantorrent.fyi/peliculas/la-mangosta/', GT_DETAIL_MOVIE],
    ['grantorrent.fyi/enlaces/jbcf78im11/', GT_SHORT_PAGE],
    ['grantorrent.fyi/enlaces/mczlwfzdtb/', GT_SHORT_PAGE],
    ['filess.top/es/mczlwfzdtb/download', { __binary: true, bytes: torrent.bytes }],
    ['filess.top/', GT_HOST_PAGE]
  ]);

  const provider = loadProvider('grantorrent', { fetch: fetchImpl, settings: { preferredLanguage: 'castellano' } });
  const streams = await provider.getStreams('1275779', 'movie', null, null);

  assert.ok(streams.length >= 1);
  for (const stream of streams) assert.equal(stream.language, 'Castellano');
});

test('GranTorrent: serie va a la página del episodio 2x2', async () => {
  const torrent = makeTorrent('MobLand.S02E02.1080p.mkv', 1300000000);
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/tv/247718', tmdbTv('247718', 'Tierra de mafiosos', '2025')],
    ['grantorrent.fyi/?s=', GT_SEARCH_SERIES],
    ['grantorrent.fyi/episodios/tierra-de-mafiosos-2x2/', GT_EPISODE_PAGE],
    ['grantorrent.fyi/enlaces/6nfd9fqiwz/', GT_SHORT_PAGE],
    ['filess.top/es/mczlwfzdtb/download', { __binary: true, bytes: torrent.bytes }],
    ['filess.top/', GT_HOST_PAGE]
  ]);

  const provider = loadProvider('grantorrent', { fetch: fetchImpl });
  const streams = await provider.getStreams('247718', 'tv', 2, 2);

  assert.ok(fetchImpl.calls.some((call) => call.url.includes('/episodios/tierra-de-mafiosos-2x2/')));
  assert.ok(streams.length >= 1);
  assert.equal(streams[0].infoHash, torrent.infoHash);
  assert.match(streams[0].title, /2x2/);
});

test('GranTorrent: desafío de Cloudflare devuelve [] sin lanzar', async () => {
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/1275779', tmdbMovie('1275779', 'La mangosta', '2026')],
    ['grantorrent', TGX_CHALLENGE]
  ]);
  const provider = loadProvider('grantorrent', { fetch: fetchImpl });
  assert.equal((await provider.getStreams('1275779', 'movie', null, null)).length, 0);
});

/* ------------------------------------------------------------------ */
/* Cinecalidad                                                        */
/* ------------------------------------------------------------------ */

test('Cinecalidad: magnet directo del bloque DESCARGAR', async () => {
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/1242378', tmdbMovie('1242378', 'Colisión', '2026')],
    ['cinecalidad.am/?s=', CC_SEARCH],
    ['cinecalidad.am/ver-pelicula/colision/', CC_DETAIL_MOVIE]
  ]);

  const provider = loadProvider('cinecalidad', { fetch: fetchImpl });
  const streams = await provider.getStreams('1242378', 'movie', null, null);

  assert.equal(streams.length, 1, 'Mega y 1fichier se descartan');
  assert.equal(streams[0].infoHash, 'cbbc40761a1fe12d94e70ddde1def7dc180b1cd8');
  assert.equal(streams[0].language, 'Latino');
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].provider, 'cinecalidad');
});

test('Cinecalidad: serie resuelve /ver-el-episodio/<slug>-<n>x<m>/', async () => {
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/tv/87917', tmdbTv('87917', 'Trackers', '2019')],
    ['cinecalidad.am/?s=', CC_SEARCH_SERIES],
    ['cinecalidad.am/ver-el-episodio/trackers-1x2/', CC_EPISODE_PAGE]
  ]);

  const provider = loadProvider('cinecalidad', { fetch: fetchImpl });
  const streams = await provider.getStreams('87917', 'tv', 1, 2);

  assert.ok(fetchImpl.calls.some((call) => call.url === 'https://www.cinecalidad.am/ver-el-episodio/trackers-1x2/'));
  assert.equal(streams.length, 1);
  assert.equal(streams[0].infoHash, 'cbbc40761a1fe12d94e70ddde1def7dc180b1cd8');
  assert.match(streams[0].title, /1x2|S01E02/);
});

test('Cinecalidad: acortalink con alfabeto propio → .torrent → magnet', async () => {
  const torrent = makeTorrent('Colision.Dual.1080p.mkv', 2100000000);
  const torrentUrl = 'https://filess.top/es/abc123/file.torrent';
  const standard = Buffer.from(torrentUrl, 'utf8').toString('base64');

  // el sitio reordena el alfabeto base64: se reconstruye esa variante
  const SAFE = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
  const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const swapped = standard.replace(/=+$/, '').split('').map((ch) => SAFE[STD.indexOf(ch)]).join('');

  const detail = `
    <h1>Colisión</h1><div><b>Audio:</b> Latino</div>
    <p><a href="https://acortalink.net/s.php?i=${swapped}">uTorrentDual 1080p</a></p>
    <p><a href="https://acortalink.net/s.php?i=${standard}">uTorrentWEB-DL 1080p</a></p>`;

  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/1242378', tmdbMovie('1242378', 'Colisión', '2026')],
    ['cinecalidad.am/?s=', CC_SEARCH],
    ['cinecalidad.am/ver-pelicula/colision/', detail],
    [torrentUrl, { __binary: true, bytes: torrent.bytes }]
  ]);

  const provider = loadProvider('cinecalidad', { fetch: fetchImpl });
  const streams = await provider.getStreams('1242378', 'movie', null, null);

  assert.equal(streams.length, 1, 'las dos variantes dan el mismo infohash');
  assert.equal(streams[0].infoHash, torrent.infoHash);
});

test('Cinecalidad: sin coincidencias no inventa resultados', async () => {
  const fetchImpl = mockFetch([
    ['api.themoviedb.org/3/movie/1', tmdbMovie('1', 'Película Inexistente', '1999')],
    ['cinecalidad.am/?s=', CC_SEARCH]
  ]);
  const provider = loadProvider('cinecalidad', { fetch: fetchImpl });
  assert.equal((await provider.getStreams('1', 'movie', null, null)).length, 0);
});

test('los tres providers nuevos exportan onSettings y sobreviven sin red', async () => {
  const offline = mockFetch([], { fallback: () => ({}) });
  for (const id of ['torrentgalaxy', 'grantorrent', 'cinecalidad']) {
    const provider = loadProvider(id, { fetch: offline, tmdbKey: '' });
    assert.equal(typeof provider.onSettings, 'function', `${id}: falta onSettings`);
    const layout = await provider.onSettings();
    assert.ok(Array.isArray(layout) && layout.length > 0);
    assert.ok(layout.some((item) => item.key === 'maxResults'), `${id}: sin ajuste maxResults`);
    assert.equal((await provider.getStreams('31199', 'movie', null, null)).length, 0);
  }
});
