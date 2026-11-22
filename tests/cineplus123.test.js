'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadProvider, mockFetch, tmdbMovie, tmdbTv, NuvioURL } = require('./utils');

// Fixtures sintéticos con la estructura pública de búsqueda, episodios y
// botones DooPlay; ninguna URL de vídeo procede de una fuente real.
function card(title, href, year) {
  return `<div class="result-item"><article>
    <div class="image"><a href="${href}"><img alt="${title}" src="/poster.jpg"><span>TV</span></a></div>
    <div class="details"><div class="title"><a href="${href}">${title}</a></div>
    <div class="meta"><span class="rating">IMDb 8.1</span><span class="year">${year || ''}</span></div></div>
  </article></div>`;
}
function option(post, number, type, title) {
  return `<li data-type="${type}" class="dooplay_player_option" data-nume="${number}" data-post="${post}">
    <span class="title">${title}</span></li>`;
}
function players(...rows) { return `<ul id="playeroptionsul">${rows.join('')}</ul>`; }
function row(number, href) {
  return `<li class="mark-1"><div class="numerando">${number}</div>
    <div class="episodiotitle"><a href="${href}">Episodio</a></div></li>`;
}
function assertNoMediaFetch(fetch) {
  assert.ok(fetch.calls.every(call => !/\.(?:m3u8|mp4)$/i.test(new URL(call.url).pathname)), 'no se solicitan vídeos ni playlists');
}

test('CinePlus123: película DooPlay, idiomas, API GET e iframes sin anuncios ni trailers', async () => {
  const search = card('Interstellar 2', '/peliculas/interstellar-2/', '2014') +
    card('Interstellar', '/serie-de-tv/interstellar/', '2014') +
    card('Interstellar', '/peliculas/interestellar/?ref=search', '2014');
  const detail = `<a href="https://www.imdb.com/title/tt0816692/fullcredits/">Reparto</a>
    <iframe src="https://ads.example/banner.mp4"></iframe>
    ${players(
      option('9166', 'trailer', 'movie', 'Ver trailer'),
      option('9166', '1', 'movie', 'LATINO HD'),
      option('9166', '2', 'movie', 'CASTELLANO'),
      option('9166', '3', 'movie', 'SUBTITULADO'),
      option('9166', '4', 'movie', 'Vídeo'),
      option('9166', '5', 'movie', 'Vídeo'),
      option('9166', '8', 'movie', 'Ver tráiler'),
      option('9999', '6', 'movie', 'LATINO HD'),
      option('9166', '7', 'tv', 'LATINO HD')
    )}`;
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/157336', tmdbMovie(157336, 'Interstellar', '2014')],
    ['cineplus123.org/?s=', search],
    ['cineplus123.org/peliculas/interestellar/', detail],
    ['/wp-json/dooplayer/v2/9166/movie/1', { __json: { type: 'iframe', embed_url: 'https://player.example/e/lat' } }],
    ['/wp-json/dooplayer/v2/9166/movie/2', { __json: { type: 'iframe', embed_url: '<iframe src="about:blank" data-litespeed-src="https://backup.example/e/cast"></iframe>' } }],
    ['/wp-json/dooplayer/v2/9166/movie/3', { __json: { type: 'iframe', embed_url: 'https://media.example/720p/sub.mp4?sig=secret' } }],
    ['/wp-json/dooplayer/v2/9166/movie/4', { __json: { type: 'Trailer', embed_url: 'https://cdn.example/preview.mp4' } }],
    ['/wp-json/dooplayer/v2/9166/movie/5', { __json: { type: 'iframe', embed_url: 'https://ads.example/video.mp4' } }],
    ['player.example/e/lat', '<script>sources:["https://cdn.example/1080p/film.m3u8?sig=abc"]</script><source src="https://cdn.example/ads/spot.mp4">'],
    ['backup.example/e/cast', '<video><source src="https://cdn.example/cast.mp4?sig=def"></video>']
  ]);
  const streams = await loadProvider('cineplus123', { fetch, URL: NuvioURL }).getStreams('157336', 'movie');
  assert.equal(streams.length, 3);
  const byLanguage = Object.fromEntries(Array.from(streams, stream => [stream.language, stream]));
  assert.equal(byLanguage.Latino.url, 'https://cdn.example/1080p/film.m3u8?sig=abc');
  assert.equal(byLanguage.Latino.quality, '1080p');
  assert.equal(byLanguage.Latino.headers.Referer, 'https://player.example/e/lat');
  assert.equal(byLanguage.Latino.headers.Origin, 'https://player.example');
  assert.equal(byLanguage.Castellano.url, 'https://cdn.example/cast.mp4?sig=def');
  assert.equal(byLanguage.Castellano.headers.Referer, 'https://backup.example/e/cast');
  assert.equal(byLanguage.Subtitulado.url, 'https://media.example/720p/sub.mp4?sig=secret');
  assert.equal(byLanguage.Subtitulado.headers.Referer, 'https://cineplus123.org/peliculas/interestellar/');
  assert.ok(streams.every(stream => stream.type === 'direct' && stream.provider === 'cineplus123'));
  const apis = fetch.calls.filter(call => call.url.includes('/wp-json/dooplayer/'));
  assert.equal(apis.length, 5);
  assert.ok(apis.every(call => call.method === 'GET' && call.headers.Referer.endsWith('/peliculas/interestellar/')));
  assert.ok(!fetch.calls.some(call => /youtube|ads\.example|\/serie-de-tv\/interstellar|interstellar-2/.test(call.url)));
  assertNoMediaFetch(fetch);
});

test('CinePlus123: Vidara consulta JSON con código y devuelve HLS con Referer del reproductor', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/157336', tmdbMovie(157336, 'Interstellar')],
    ['cineplus123.org/?s=', card('Interstellar', '/peliculas/interestellar/', 2014)],
    ['cineplus123.org/peliculas/interestellar/', players(option('9166', '2', 'movie', 'LATINO HD'))],
    ['/wp-json/dooplayer/v2/9166/movie/2', { __json: { type: 'iframe', embed_url: 'https://vidara.to/e/TestCode123?mirror=1' } }],
    ['vidara.to/api/stream', (_url, init) => {
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'manual');
      assert.deepEqual(JSON.parse(init.body), { filecode: 'TestCode123', device: 'web' });
      assert.equal(init.headers.Referer, 'https://vidara.to/e/TestCode123?mirror=1');
      assert.equal(init.headers.Origin, 'https://vidara.to');
      return { __json: { streaming_url: 'https://cdn.example/playlist.m3u8?token=abc', subtitles: [
        { file_path: '/subs/es.vtt?sig=123', language: 'Español Latino' },
        { file_path: 'https://subs.example/en.srt', language: 'English' },
        { file_path: 'https://127.0.0.1/private.vtt', language: 'English' },
        { file_path: 'https://ads.example/spot.vtt', language: 'English' },
        { file_path: 'https://subs.example/page.html', language: 'English' },
        { file_path: 'javascript:alert(1)', language: 'English' }
      ] } };
    }]
  ]);
  const streams = await loadProvider('cineplus123', { fetch }).getStreams('157336', 'movie');
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/playlist.m3u8?token=abc');
  assert.equal(streams[0].language, 'Latino');
  assert.equal(streams[0].headers.Referer, 'https://vidara.to/');
  assert.equal(streams[0].headers.Origin, 'https://vidara.to');
  assert.deepEqual(Array.from(streams[0].subtitles, item => [item.url, item.lang, item.label]), [
    ['https://vidara.to/subs/es.vtt?sig=123', 'spa', 'Español Latino'],
    ['https://subs.example/en.srt', 'eng', 'English']
  ]);
  assert.ok(streams[0].subtitles.every(item => /^vidara-[0-9a-f]{16}$/.test(item.id)));
  assert.ok(!fetch.calls.some(call => call.url.includes('vidara.to/e/')));
  assert.ok(!fetch.calls.some(call => /\.(?:vtt|srt)$/i.test(new URL(call.url).pathname)));
  assertNoMediaFetch(fetch);
});

test('CinePlus123: serie distingue el año y usa el enlace del episodio publicado, no un slug inventado', async () => {
  const search = card('ONE PIECE', '/serie-de-tv/anime-one-piece/', 1999) +
    card('ONE PIECE', '/peliculas/one-piece/', 2023) +
    card('ONE PIECE', '/serie-de-tv/on3-piece/', 2023);
  const series = `<a href="/capitulo/one-piece-2x99/">Navegación ajena a la lista</a>
    <ul class="episodios">${row('1 - 2', '/capitulo/one-piece-1x2/')}
      ${row('2 - 1', '/capitulo/one-piece-2x1/')}
      ${row('2 - 10', '/capitulo/one-piece-2x10/')}</ul>`;
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/100', tmdbTv(100, 'ONE PIECE', '2023')],
    ['cineplus123.org/?s=', search],
    ['cineplus123.org/serie-de-tv/on3-piece/', series],
    ['cineplus123.org/capitulo/one-piece-2x1/', players(option('321', '1', 'tv', 'SUBTITULADO'))],
    ['/wp-json/dooplayer/v2/321/tv/1', { __json: { type: 'iframe', embed_url: 'https://host.example/embed/episode' } }],
    ['host.example/embed/episode', '<source src="https://cdn.example/episode-2-1.mp4">']
  ]);
  const provider = loadProvider('cineplus123', { fetch });
  const streams = await provider.getStreams('100', 'series', 2, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/episode-2-1.mp4');
  assert.equal(streams[0].language, 'Subtitulado');
  assert.match(streams[0].title, /S02E01/);
  assert.ok(!fetch.calls.some(call => /anime-one-piece|\/peliculas\/one-piece|2x10|2x99|on3-piece-2x1/.test(call.url)));
  assertNoMediaFetch(fetch);
  const before = fetch.calls.length;
  assert.equal((await provider.getStreams('100', 'series', null, null)).length, 0);
  assert.ok(!fetch.calls.slice(before).some(call => call.url.includes('cineplus123.org')));
});

test('CinePlus123: rechaza otras ediciones, IMDb distinto y títulos parcialmente parecidos', async () => {
  const wrongYear = mockFetch([
    ['api.themoviedb.org/3/tv/100', tmdbTv(100, 'ONE PIECE', '1999')],
    ['cineplus123.org/?s=', card('ONE PIECE', '/serie-de-tv/live-action/', 2023) +
      card('LEGO ONE PIECE', '/serie-de-tv/lego-one-piece/', 1999)]
  ]);
  assert.equal((await loadProvider('cineplus123', { fetch: wrongYear }).getStreams('100', 'tv', 1, 1)).length, 0);
  assert.ok(!wrongYear.calls.some(call => call.url.includes('/serie-de-tv/')));

  const wrongImdb = mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt0816692.json', { __json: { meta: { name: 'Interstellar', type: 'movie', year: '2014' } } }],
    ['cineplus123.org/?s=', card('Interstellar', '/peliculas/interestellar/', 2014)],
    ['cineplus123.org/peliculas/interestellar/', `<a href="https://www.imdb.com/title/tt9999999/fullcredits/">Reparto</a>${players(option('9166', '1', 'movie', 'LATINO'))}`]
  ]);
  assert.equal((await loadProvider('cineplus123', { fetch: wrongImdb }).getStreams('tt0816692', 'movie')).length, 0);
  assert.ok(!wrongImdb.calls.some(call => call.url.includes('/wp-json/dooplayer/')));
});

test('CinePlus123: episodios ambiguos, contradictorios o ausentes no generan enlaces supuestos', async () => {
  const make = series => mockFetch([
    ['api.themoviedb.org/3/tv/106379', tmdbTv(106379, 'Fallout', '2024')],
    ['cineplus123.org/?s=', card('Fallout', '/serie-de-tv/fallout/', 2024)],
    ['cineplus123.org/serie-de-tv/fallout/', series]
  ]);
  for (const series of [
    `<a href="/capitulo/fallout-1x1/">No está en el listado</a><ul class="episodios">${row('1 - 2', '/capitulo/fallout-1x2/')}</ul>`,
    `<ul class="episodios">${row('1 - 1', '/capitulo/fallout-2x1/')}</ul>`,
    `<ul class="episodios">${row('1 - 1', '/capitulo/fallout-1x1/')}${row('1 - 1', '/capitulo/otro-1x1/')}</ul>`,
    `<ul class="episodios">${row('1 - 1', 'https://other.example/capitulo/fallout-1x1/')}</ul>`
  ]) {
    const fetch = make(series);
    const streams = await loadProvider('cineplus123', { fetch }).getStreams('106379', 'tv', 1, 1);
    assert.equal(streams.length, 0);
    assert.ok(!fetch.calls.some(call => call.url.includes('/capitulo/')));
  }
});

test('CinePlus123: MP4 declarado por DooPlay usa la página JW como Referer', async () => {
  const source = 'https://cdn.example/movie.mp4?token=123';
  const jw = 'https://cineplus123.org/jwplayer/?source=' + encodeURIComponent(source) + '&type=mp4';
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/157336', tmdbMovie(157336, 'Interstellar')],
    ['cineplus123.org/?s=', card('Interstellar', '/peliculas/interestellar/', 2014)],
    ['cineplus123.org/peliculas/interestellar/', players(option('9166', '1', 'movie', 'LATINO'))],
    ['/wp-json/dooplayer/v2/9166/movie/1', { __json: { type: 'mp4', embed_url: jw } }]
  ]);
  const streams = await loadProvider('cineplus123', { fetch }).getStreams('157336', 'movie');
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, source);
  assert.equal(streams[0].headers.Referer, jw);
  assert.ok(!fetch.calls.some(call => call.url.includes('/jwplayer/')));
  assertNoMediaFetch(fetch);
});

test('CinePlus123: espejo Vidara solo si es un origen conocido y conserva el código', async () => {
  const fixture = mirror => mockFetch([
    ['api.themoviedb.org/3/movie/157336', tmdbMovie(157336, 'Interstellar')],
    ['cineplus123.org/?s=', card('Interstellar', '/peliculas/interestellar/', 2014)],
    ['cineplus123.org/peliculas/interestellar/', players(option('9166', '2', 'movie', 'LATINO HD'))],
    ['/wp-json/dooplayer/v2/9166/movie/2', { __json: { type: 'iframe', embed_url: 'https://vidara.to/e/TestCode123' } }],
    ['vidara.to/api/stream', { __response: { status: 500 }, body: '' }],
    ['vidara.to/e/TestCode123', `<script>const MIRROR_ORIGIN = "${mirror}";</script>`],
    ['vidvara.fit/api/stream', (_url, init) => {
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'manual');
      assert.deepEqual(JSON.parse(init.body), { filecode: 'TestCode123', device: 'web' });
      assert.equal(init.headers.Referer, 'https://vidara.to/e/TestCode123');
      assert.equal(init.headers.Origin, 'https://vidvara.fit');
      return { __json: { streaming_url: 'https://cdn.example/via-mirror.m3u8' } };
    }]
  ]);
  const good = fixture('https://vidvara.fit');
  const streams = await loadProvider('cineplus123', { fetch: good }).getStreams('157336', 'movie');
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/via-mirror.m3u8');
  assert.equal(streams[0].headers.Referer, 'https://vidvara.fit/');
  assert.equal(streams[0].headers.Origin, 'https://vidvara.fit');
  assertNoMediaFetch(good);

  for (const mirror of [
    'https://vidvara.fit.evil.example', 'https://evil.example', 'http://vidvara.fit',
    'https://user@vidvara.fit', 'https://vidvara.fit/api/stream', 'https://vidvara.fit/?target=other'
  ]) {
    const bad = fixture(mirror);
    assert.equal((await loadProvider('cineplus123', { fetch: bad }).getStreams('157336', 'movie')).length, 0, mirror);
    assert.ok(!bad.calls.some(call => call.url.includes('vidvara.fit/api/stream')), mirror);
    assertNoMediaFetch(bad);
  }
});

test('CinePlus123: ante error Vidara se puede leer un player HTML sin devolver anuncios', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/movie/157336', tmdbMovie(157336, 'Interstellar')],
    ['cineplus123.org/?s=', card('Interstellar', '/peliculas/interestellar/', 2014)],
    ['cineplus123.org/peliculas/interestellar/', players(option('9166', '2', 'movie', 'CASTELLANO'))],
    ['/wp-json/dooplayer/v2/9166/movie/2', { __json: { type: 'iframe', embed_url: 'https://vidara.to/e/TestCode123' } }],
    ['vidara.to/api/stream', { __json: { streaming_url: 'https://ads.example/spot.mp4' } }],
    ['vidara.to/e/TestCode123', '<source src="https://cdn.example/fallback.mp4"><source src="https://cdn.example/trailer.mp4">']
  ]);
  const streams = await loadProvider('cineplus123', { fetch }).getStreams('157336', 'movie');
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/fallback.mp4');
  assert.equal(streams[0].headers.Referer, 'https://vidara.to/e/TestCode123');
  assertNoMediaFetch(fetch);
});

test('CinePlus123: comprueba el año de estreno de la ficha cuando la tarjeta no lo indica', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/44', tmdbTv(44, 'ONE PIECE', '1999')],
    ['cineplus123.org/?s=', card('ONE PIECE', '/serie-de-tv/on3-piece/', '')],
    ['cineplus123.org/serie-de-tv/on3-piece/', `<div class="sheader"><div class="data"><h1>ONE PIECE</h1>
      <div class="extra"><span class="date">Aug. 31, 2023</span></div></div></div>
      <ul class="episodios">${row('1 - 1', '/capitulo/one-piece-1x1/')}</ul>`]
  ]);
  const streams = await loadProvider('cineplus123', { fetch }).getStreams('44', 'tv', 1, 1);
  assert.equal(streams.length, 0);
  assert.ok(fetch.calls.some(call => call.url.includes('/serie-de-tv/on3-piece/')));
  assert.ok(!fetch.calls.some(call => call.url.includes('/capitulo/')));
});

test('CinePlus123: no confunde la fecha de un episodio con el estreno de la serie', async () => {
  const fetch = mockFetch([
    ['api.themoviedb.org/3/tv/106379', tmdbTv(106379, 'Fallout', '2024')],
    ['cineplus123.org/?s=', card('Fallout', '/serie-de-tv/fallout/', '')],
    ['cineplus123.org/serie-de-tv/fallout/', `<div class="sheader"><div class="data"><h1>Fallout</h1></div></div>
      <ul class="episodios">${row('1 - 1', '/capitulo/fallout-1x1/').replace('</li>', '<span class="date">2025</span></li>')}</ul>`],
    ['cineplus123.org/capitulo/fallout-1x1/', players(option('42', '1', 'tv', 'LATINO'))],
    ['/wp-json/dooplayer/v2/42/tv/1', { __json: { type: 'iframe', embed_url: 'https://cdn.example/ep.mp4' } }]
  ]);
  const streams = await loadProvider('cineplus123', { fetch }).getStreams('106379', 'tv', 1, 1);
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/ep.mp4');
  assertNoMediaFetch(fetch);
});
