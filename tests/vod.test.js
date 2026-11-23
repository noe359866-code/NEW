'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadProvider, mockFetch, tmdbMovie, tmdbTv, NuvioURL } = require('./utils');

function encryptLink(url) {
  const iv = Buffer.alloc(16, 4);
  const key = crypto.createHash('sha256').update('challenge' + 'salt').digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(url), cipher.final()]).toString('base64');
}

function assertNoMediaFetch(fetch) {
  assert.ok(fetch.calls.every(call => !/\.(?:m3u8|mp4)(?:[?#]|$)/i.test(new URL(call.url).pathname)), 'el extractor no debe descargar medios');
}

test('el manifiesto es un único addon y los bundles son providers internos', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json')));
  assert.equal(manifest.id, 'org.nebula.es.unificado');
  assert.deepEqual(manifest.resources.map(r => r.name), ['catalog', 'meta', 'stream']);
  assert.equal(manifest.scrapers, undefined);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'providers')).sort(), ['cineplus123.js', 'flixlatam.js', 'framextv.js', 'frikiserie.js', 'fuegocine.js', 'homecine.js', 'kdrama.js', 'latanime.js', 'pelishax.js', 'tioanime.js']);
});

test('FlixLatam: película → Embed69 AES → reproductor → HLS directo con cabeceras', async () => {
  const data = [{ video_language: 'LAT', sortedEmbeds: [{ servername: 'filemoon', link: encryptLink('https://player.example/e/1') }] }];
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/157336', tmdbMovie(157336, 'Interstellar')],
    ['flixlatam.com/search?s=', '<article><a href="/pelicula/interstellar"><img alt="Ver Interstellar online"></a></article>'],
    ['flixlatam.com/pelicula/interstellar', '<iframe src="https://embed69.org/f/tt0816692"></iframe>'],
    ['embed69.org/f/tt0816692', `const LINK_CHALLENGE='challenge'; const LINK_SALT='salt'; let dataLink=${JSON.stringify(data)};`],
    ['player.example/e/1', '<video><source src="https://www.cdn.example/1080p/master.m3u8?sig=A&amp;n=1"></video>']
  ]);
  const streams = await loadProvider('flixlatam', { fetch }).getStreams('157336', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://www.cdn.example/1080p/master.m3u8?sig=A&n=1');
  assert.equal(streams[0].provider, 'flixlatam');
  assert.equal(streams[0].type, 'direct');
  assert.equal(streams[0].quality, '1080p');
  assert.equal(streams[0].language, 'Latino');
  assert.equal(streams[0].headers.Referer, 'https://player.example/e/1');
  assertNoMediaFetch(fetch);
});

test('FlixLatam: serie solicita exclusivamente la temporada y episodio elegidos', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/123', tmdbTv(123, 'Black Clover')],
    ['flixlatam.com/search?s=', '<a href="/pelicula/black-clover"><img alt="Black Clover"></a><a href="/anime/black-clover"><img alt="Black Clover"></a>'],
    ['flixlatam.com/anime/black-clover/temporada/2/capitulo/5', '<video><source src="https://media.example/2-5.mp4"></video>']
  ]);
  const provider = loadProvider('flixlatam', { fetch });
  const streams = await provider.getStreams('123', 'tv', 2, 5);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://media.example/2-5.mp4');
  assert.match(streams[0].title, /S02E05/);
  assert.ok(!fetch.calls.some(call => /\/pelicula\//.test(call.url)));
  assertNoMediaFetch(fetch);
  assert.equal((await provider.getStreams('123', 'tv', null, null)).length, 0);
});

test('FlixLatam: reto Anubis acotado y cookie de sesión; sin descifrar ni ejecutar scripts arbitrarios', async () => {
  let attempts = 0;
  const challenge = JSON.stringify({ rules: { difficulty: 1 }, challenge: { id: 'test-id', randomData: '123456' } });
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/1', tmdbMovie(1, 'Prueba')],
    ['flixlatam.com/search?s=', '<a href="/pelicula/prueba"><img alt="Ver Prueba online"></a>'],
    ['flixlatam.com/pelicula/prueba', '<iframe src="https://embed69.org/f/demo"></iframe>'],
    ['embed69.org/.within.website/x/cmd/anubis/api/pass-challenge', (url) => {
      const args = new URL(url).searchParams;
      assert.equal(args.get('id'), 'test-id');
      assert.match(args.get('response'), /^0/);
      return { __response: { status: 302, headers: { 'set-cookie': 'anubis-auth=ok; Path=/' } } };
    }],
    ['embed69.org/f/demo', (_url, init) => {
      attempts++;
      if (!init.headers.Cookie) return {
        __response: { status: 403, headers: { 'content-type': 'text/html' } },
        body: `<script id="anubis_challenge" type="application/json">${challenge}</script>`
      };
      assert.match(init.headers.Cookie, /anubis-auth=ok/);
      return '<source src="https://media.example/movie.mp4">';
    }]
  ]);
  const streams = await loadProvider('flixlatam', { fetch }).getStreams('1', 'movie');
  assert.equal(attempts, 2);
  assert.equal(streams[0].url, 'https://media.example/movie.mp4');
  assertNoMediaFetch(fetch);
});

test('Latanime: mapea la numeración absoluta mediante recuentos de TMDB', async () => {
  const player = Buffer.from('https://filemoon.example/e/show-13').toString('base64');
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/44', tmdbTv(44, 'One Piece', '1999', [
      { season_number: 1, episode_count: 12 }, { season_number: 2, episode_count: 10 }
    ])],
    ['latanime.org/buscar?q=', '<a href="/anime/one-piece-latino"><h3>One Piece Latino</h3><span>Latino 1999</span></a>'],
    ['latanime.org/anime/one-piece-latino', '<a href="/ver/one-piece-latino-episodio-1">1</a><a href="/ver/one-piece-latino-episodio-13">13</a>'],
    ['latanime.org/ver/one-piece-latino-episodio-13', `<a class="play-video" data-player="${player}">filemoon</a>`],
    ['filemoon.example/e/show-13', '<script>const sources=[{file:"https://cdn.example/show-13.mp4"}]</script>']
  ]);
  const streams = await loadProvider('latanime', { fetch }).getStreams('44', 'tv', 2, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/show-13.mp4');
  assert.equal(streams[0].language, 'Latino');
  assert.ok(!fetch.calls.some(call => call.url.endsWith('/ver/one-piece-latino-episodio-1')));
  assertNoMediaFetch(fetch);
});

test('Latanime: temporada explícita usa el episodio relativo y sin mapa evita episodios equivocados', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/99', tmdbTv(99, 'Black Clover')],
    ['latanime.org/buscar?q=', '<a href="/anime/black-clover-latino"><h3>Black Clover Latino</h3></a><a href="/anime/black-clover-s2-latino"><h3>Black Clover S2 Latino</h3></a>'],
    ['latanime.org/anime/black-clover-s2-latino', '<a href="/ver/black-clover-s2-latino-episodio-2">2</a>'],
    ['latanime.org/anime/black-clover-latino', '<a href="/ver/black-clover-latino-episodio-2">2</a>'],
    ['latanime.org/ver/black-clover-s2-latino-episodio-2', '<source src="https://cdn.example/season2-episode2.m3u8">']
  ]);
  const streams = await loadProvider('latanime', { fetch }).getStreams('99', 'tv', 2, 2);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/season2-episode2.m3u8');
  assert.ok(!fetch.calls.some(call => call.url.endsWith('/ver/black-clover-latino-episodio-2')));
});

test('Latanime: películas del catálogo anime y fallos sin enlaces de página', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/2', tmdbMovie(2, 'Una película')],
    ['latanime.org/buscar?q=', '<a href="/anime/una-pelicula-latino"><h3>Una película Latino</h3><span>Pelicula Latino 2023</span></a>'],
    ['latanime.org/anime/una-pelicula-latino', '<a href="/ver/una-pelicula-latino-episodio-1">1</a>'],
    ['latanime.org/ver/una-pelicula-latino-episodio-1', '<iframe src="https://host.example/embed/1"></iframe>'],
    ['host.example/embed/1', '<p>CAPTCHA obligatorio</p>']
  ]);
  const streams = await loadProvider('latanime', { fetch }).getStreams('2', 'movie');
  assert.equal(streams.length, 0);
});

test('No confunde coincidencias parciales con el título solicitado', async () => {
  const flixFetch = mockFetch([
    ['api.themoviedb.org/3/movie/1', tmdbMovie(1, 'Interstellar')],
    ['flixlatam.com/search?s=', '<a href="/pelicula/interstellar-2"><img alt="Ver Interstellar 2 online"></a>'],
    ['flixlatam.com/pelicula/interstellar-2', '<source src="https://cdn.example/wrong.mp4">']
  ]);
  assert.equal((await loadProvider('flixlatam', { fetch: flixFetch }).getStreams('1', 'movie')).length, 0);
  assert.ok(!flixFetch.calls.some(call => /pelicula\/interstellar-2/.test(call.url)));

  const latFetch = mockFetch([
    ['api.themoviedb.org/3/tv/99', tmdbTv(99, 'Black Clover')],
    ['latanime.org/buscar?q=', '<a href="/anime/squishy-black-clover"><h3>Squishy! Black Clover</h3></a>'],
    ['latanime.org/anime/squishy-black-clover', '<a href="/ver/squishy-black-clover-episodio-1">1</a>']
  ]);
  assert.equal((await loadProvider('latanime', { fetch: latFetch }).getStreams('99', 'tv', 1, 1)).length, 0);
  assert.ok(!latFetch.calls.some(call => /\/anime\/squishy/.test(call.url)));
});

test('IMDb para series y URLs de búsqueda con el polyfill de Nuvio', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/series/tt7441658.json', { __json: { meta: { type: 'series', name: 'Black Clover' } } }],
    ['flixlatam.com/search?s=', '<a href="/anime/black-clover?tracking=1#part"><img alt="Ver Black Clover online"></a>'],
    ['flixlatam.com/anime/black-clover/temporada/1/capitulo/2', '<source src="https://cdn.example/episode.mp4">']
  ]);
  const provider = loadProvider('flixlatam', { fetch, URL: NuvioURL });
  const streams = await provider.getStreams('tt7441658', 'series', 1, 2);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/episode.mp4');
  assert.ok(fetch.calls.some(call => call.url === 'https://flixlatam.com/anime/black-clover/temporada/1/capitulo/2'));
  assert.ok(!fetch.calls.some(call => call.url.includes('/meta/movie/')));
});

test('Latanime busca también el título alternativo de TMDB cuando el original no coincide', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/17', url => ({ __json: {
      id: 17, name: url.includes('language=es-ES') ? 'Mi academia' : 'My Academy',
      original_name: 'Título original', first_air_date: '2020-01-01', seasons: []
    } })],
    ['latanime.org/buscar?q=', url => decodeURIComponent(url).includes('My Academy')
      ? '<a href="/anime/my-academy-latino"><h3>My Academy Latino</h3></a>' : '<p>Sin resultados</p>'],
    ['latanime.org/anime/my-academy-latino', '<a href="/ver/my-academy-latino-episodio-1">1</a>'],
    ['latanime.org/ver/my-academy-latino-episodio-1', '<source src="https://cdn.example/episode.mp4">']
  ]);
  const streams = await loadProvider('latanime', { fetch }).getStreams('17', 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.equal(fetch.calls.filter(call => call.url.includes('/buscar?q=')).length, 3);
});

test('Latanime separa el título destacado de las etiquetas de tipo, idioma y año', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/21', tmdbTv(21, 'Black Clover')],
    ['latanime.org/buscar?q=', `<a href="/anime/black-clover-latino">
       <img src="/thumbs/black-clover.jpg"><strong>Black Clover Latino</strong>
       <span>Latino</span> <span>2018</span></a>`],
    ['latanime.org/anime/black-clover-latino', '<a href="/ver/black-clover-latino-episodio-1">1</a>'],
    ['latanime.org/ver/black-clover-latino-episodio-1', '<source src="https://cdn.example/episode.mp4">']
  ]);
  const streams = await loadProvider('latanime', { fetch }).getStreams('21', 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/episode.mp4');
});

test('PeliShax: la ficha se abre por id de TMDB, sin pasar por el buscador', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/5084', tmdbMovie(5084, 'El señor de los anillos')],
    ['pelishaxpro.com/movies/5084', `<ul class="servers">
      <li class="server-item" data-link="https://vidara.to/e/latino1" data-lang="Español Latino"><strong>Vidara</strong></li>
      <li class="server-item" data-link="https://streamwish.to/e/jap1" data-lang="Japonés"><strong>StreamWish</strong></li>
      <li class="server-item" data-link="https://vidmoly.biz/embed-dup.html" data-lang="Español Latino"><strong>Vidmoly</strong></li>
      </ul>`],
    ['vidara.to/e/latino1', '<source src="https://cdn.pelishax.example/latino/master.m3u8">'],
    ['streamwish.to/e/jap1', '<source src="https://cdn.pelishax.example/jap/720.mp4">'],
    ['vidmoly.biz/embed-dup.html', '<source src="https://cdn.pelishax.example/latino/master.m3u8">']
  ]);
  const streams = await loadProvider('pelishax', { fetch }).getStreams('5084', 'movie', null, null);
  assert.equal(streams.length, 2);
  const latino = streams.find(item => item.url.includes('/latino/'));
  assert.equal(latino.language, 'Latino');
  assert.equal(latino.provider, 'pelishax');
  assert.equal(latino.type, 'direct');
  assert.match(latino.title, /Vidara/);
  assert.equal(streams.find(item => item.url.includes('/jap/')).language, 'Japonés');
  assert.ok(!fetch.calls.some(call => call.url.includes('/search?q=')), 'el id de TMDB basta');
  assertNoMediaFetch(fetch);
});

test('PeliShax: serie usa la ficha del episodio concreto y no la de la temporada', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/575', tmdbTv(575, 'El marginal')],
    // La ficha de la serie lista reproductores y episodios en la misma página.
    ['pelishaxpro.com/series/575', `<li class="server-item" data-link="https://vidmoly.biz/embed-trailer.html" data-lang="Español Latino">Vidmoly</li>
      <div class="episode-list" id="season-1"><a href="/tv/575/1/1"><div class="episode-item">1</div></a>
      <a href="/tv/575/1/2"><div class="episode-item">2</div></a></div>`],
    ['pelishaxpro.com/tv/575/1/2', '<li class="server-item" data-link="https://vidhidevip.com/v/ep2" data-lang="Español Latino">VidHide</li>'],
    ['vidhidevip.com/v/ep2', '<source src="https://cdn.pelishax.example/s01e02.mp4">']
  ]);
  const streams = await loadProvider('pelishax', { fetch }).getStreams('575', 'tv', 1, 2);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.pelishax.example/s01e02.mp4');
  assert.match(streams[0].title, /S01E02/);
  assert.ok(!fetch.calls.some(call => call.url.endsWith('/tv/575/1/1')));
  assert.equal((await loadProvider('pelishax', { fetch }).getStreams('575', 'tv', null, null)).length, 0);
});

test('HomeCine: pestañas de idioma emparejadas con su iframe de fastream', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/603', tmdbMovie(603, 'Matrix')],
    ['homecine.to/?s=', '<div class="item"><a href="/matrix"><img alt="Matrix"><h2>Matrix</h2></a></div>'],
    ['homecine.to/matrix', `<div class="les-title"><strong>Server Cload</strong></div>
      <div class="les-content"><a href="#tab1">480p - Latino</a></div>
      <div class="les-content"><a href="#tab2">HD 1080p - Castellano</a></div>
      <div id="content-embed"><IFRAME SRC="https://fastream.to/embed-lat1.html"></IFRAME>
      <IFRAME SRC="https://fastream.to/embed-cast2.html"></IFRAME></div>`],
    ['fastream.to/embed-lat1.html', '<source src="https://cdn.homecine.example/latino/480.mp4">'],
    ['fastream.to/embed-cast2.html', '<source src="https://cdn.homecine.example/castellano/1080.mp4">']
  ]);
  const streams = await loadProvider('homecine', { fetch }).getStreams('603', 'movie', null, null);
  assert.equal(streams.length, 2);
  const cast = streams.find(item => item.url.includes('castellano'));
  assert.equal(cast.language, 'Castellano');
  assert.equal(cast.quality, '1080p');
  const lat = streams.find(item => item.url.includes('latino'));
  assert.equal(lat.language, 'Latino');
  assert.equal(lat.quality, '480p');
  assertNoMediaFetch(fetch);
});

test('HomeCine: la ficha de la serie lleva al episodio de la temporada pedida', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/900', tmdbTv(900, 'Mouse')],
    ['homecine.to/?s=', '<a href="/series/mouse"><h2>Mouse</h2></a>'],
    ['homecine.to/series/mouse', `<a href="https://www3.homecine.to/episode/mouse-temporada-1-capitulo-1">Episode 1</a>
      <a href="https://www3.homecine.to/episode/mouse-temporada-2-capitulo-3">Episode 3</a>`],
    ['homecine.to/episode/mouse-temporada-2-capitulo-3', `<div class="les-content"><a href="#tab1">HD 720p - Subtitulado</a></div>
      <IFRAME SRC="https://fastream.to/embed-ep23.html"></IFRAME>`],
    ['fastream.to/embed-ep23.html', '<source src="https://cdn.homecine.example/s02e03.mp4">']
  ]);
  const streams = await loadProvider('homecine', { fetch }).getStreams('900', 'tv', 2, 3);
  assert.equal(streams.length, 1);
  assert.match(streams[0].title, /S02E03/);
  assert.equal(streams[0].language, 'Subtitulado');
  assert.ok(!fetch.calls.some(call => call.url.includes('temporada-1-capitulo-1')));
});

test('FrikiSeries: catálogo en ng-state → ficha → MP4 de OK.ru', async () => {
  const state = { '0': { 'data-info': [
    { titulo: 'Los Caballeros del Zodiaco (1986)', slug: 'los-caballeros-del-zodiaco-1986', totalCapitulos: '114',
      fecha: '1986', video: 'https://ok.ru/videoembed/14398744169198', tipo: 'serie', irAListaVideo: false },
    { titulo: 'Otra cosa', slug: 'otra-cosa', totalCapitulos: '10', fecha: '1990',
      video: 'xxxx', tipo: 'serie', irAListaVideo: true }
  ] } };
  const ngState = raw => `<html><script id="ng-state" type="application/json">${JSON.stringify(raw)}</script></html>`;
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/1259', tmdbTv(1259, 'Los Caballeros del Zodiaco')],
    ['frikiserie.com/', ngState(state)],
    ['frikiserie.com/ver-serie/los-caballeros-del-zodiaco-1986', ngState(state)],
    // Formato real: JSON con entidades HTML dentro de data-options.
    ['ok.ru/videoembed/14398744169198', `<div class="h-mod" data-module="OKVideo"
      data-movie-id="14398744169198"
      data-options="{&quot;flashvars&quot;:{&quot;metadata&quot;:{&quot;movie&quot;:{&quot;id&quot;:&quot;14398744169198&quot;},&quot;videos&quot;:[{&quot;name&quot;:&quot;mobile&quot;,&quot;url&quot;:&quot;https://vd.okcdn.ru/720.mp4?cmd=videoPlayerCdn\u0026expires=1&quot;}],&quot;hlsManifestUrl&quot;:&quot;https://ok6-7.vkuser.net/video.m3u8?cmd=videoPlayerCdn\u0026expires=1795501360418&quot;}}}"></div>`]
  ]);
  const streams = await loadProvider('frikiserie', { fetch }).getStreams('1259', 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://ok6-7.vkuser.net/video.m3u8?cmd=videoPlayerCdn&expires=1795501360418');
  assert.equal(streams[0].language, 'Latino');
  assert.equal(streams[0].provider, 'frikiserie');
  assert.equal(streams[0].headers.Origin, 'https://ok.ru');
  assertNoMediaFetch(fetch);
});

test('FrikiSeries: un título sin enlace real no produce resultados', async () => {
  const ngState = `<script id="ng-state" type="application/json">${JSON.stringify({ d: [
    { titulo: 'Relleno', slug: 'relleno', totalCapitulos: '3', fecha: '1999', video: 'xxxx', tipo: 'serie' }] })}</script>`;
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/1', tmdbTv(1, 'Relleno')],
    ['frikiserie.com/', ngState]
  ]);
  const streams = await loadProvider('frikiserie', { fetch }).getStreams('1', 'tv', 1, 1);
  assert.equal(streams.length, 0);
  assert.ok(!fetch.calls.some(call => call.url.includes('ok.ru')));
});

test('PeliShax: los servidores de OK.ru se leen de su reproductor, no se descartan', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/155', tmdbMovie(155, 'The Dark Knight')],
    ['pelishaxpro.com/movies/155', `<li class="server-item" data-link="https://ok.ru/video/7652106504857" data-lang="English">OK.ru</li>`],
    ['ok.ru/video/7652106504857', `data-options="{&quot;flashvars&quot;:{&quot;metadata&quot;:{&quot;hlsManifestUrl&quot;:&quot;https://vd9.okcdn.ru/video.m3u8?cmd=videoPlayerCdn\\u0026expires=9&quot;}}}"`]
  ]);
  const streams = await loadProvider('pelishax', { fetch }).getStreams('155', 'movie', null, null);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://vd9.okcdn.ru/video.m3u8?cmd=videoPlayerCdn&expires=9');
  assert.equal(streams[0].language, 'Inglés');
});
