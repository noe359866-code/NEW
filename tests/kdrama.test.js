'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadProvider, mockFetch } = require('../tests/utils');

const SERIES = [
  ['v3-cinemeta.strem.io/meta/series/tt1234567.json', { __json: { meta: { type: 'series', name: 'Vincenzo', year: '2021' } } }],
  ['k-drama.in/search?q=', [
    '<a href="/detail/tv/vincenzo-117376" class="cineapse-card">',
    '<img src="https://image.tmdb.org/t/p/w342/x.jpg" alt="Vincenzo"></a>',
    '<a href="/detail/tv/otro-drama-999999" class="cineapse-card">',
    '<img src="https://image.tmdb.org/t/p/w342/y.jpg" alt="Otro Drama"></a>'
  ].join('')],
  [/k-drama\.in\/watch\/tv\/vincenzo-117376-episode-2/, [
    '<button onclick="switchServer(\'kat1\', \'https://k-drama.in/vid2.php/117376/1/2?m=hi\', \'embed\', \'\')">',
    '<button onclick="switchServer(\'server1\', \'https://embed.example/player/117376/1/2?key=k_abc\', \'embed\', \'\')">'
  ].join('')],
  ['k-drama.in/vid2.php/117376/1/2', '<iframe src="https://vidsync.pro/embed/tv/117376/1/2"></iframe>'],
  ['embed.example/player/117376/1/2', '<script>src = "https://cdn.example/vincenzo/102.m3u8"</script>']
];

test('KatDrama: ficha por id de TMDB → servidores del onclick → HLS', async () => {
  const fetch = mockFetch(SERIES);
  const streams = await loadProvider('kdrama', { fetch, tmdbKey: '' }).getStreams('tt1234567', 'series', 1, 2);
  const urls = streams.map(s => s.url).sort();
  assert.ok(urls.includes('https://cdn.example/vincenzo/102.m3u8'), JSON.stringify(urls));
  assert.ok(streams.every(s => s.name.includes('KatDrama')));
  assert.ok(!fetch.calls.some(c => c.url.includes('otro-drama-999999')), 'no abre fichas ajenas');
  assert.ok(fetch.calls.some(c => /vincenzo-117376-episode-2$/.test(c.url)), 'usa la URL de episodio del sitio');
});

test('KatDrama: película usa /watch/movie/<slug>', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt0000009.json', { __json: { meta: { type: 'movie', name: 'One Piece Film Red', year: '2022' } } }],
    ['k-drama.in/search?q=', '<a href="/detail/movie/one-piece-film-red-900000"><img alt="One Piece Film Red"></a>'],
    [/k-drama\.in\/watch\/movie\/one-piece-film-red-900000/, '<button onclick="switchServer(\'kat2\', \'https://k-drama.in/mx1.php?type=movie&id=900000\', \'embed\', \'\')">'],
    ['k-drama.in/mx1.php', '<video src="https://cdn.example/op-red.mp4"></video>']
  ]);
  const streams = await loadProvider('kdrama', { fetch, tmdbKey: '' }).getStreams('tt0000009', 'movie');
  assert.equal(streams.length, 1, JSON.stringify(streams.map(s => s.url)));
  assert.equal(streams[0].url, 'https://cdn.example/op-red.mp4');
});

test('KatDrama: sin episodio válido no se busca nada', async () => {
  const fetch = mockFetch([['k-drama.in', '<html></html>']]);
  const streams = await loadProvider('kdrama', { fetch, tmdbKey: '' }).getStreams('tt1234567', 'series');
  assert.equal(streams.length, 0);
  // Solo se consultaron metadatos: no se toca el sitio sin episodio.
  assert.ok(!fetch.calls.some(c => c.url.includes('k-drama.in')));
});
