'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadProvider, mockFetch } = require('../tests/utils');

const SERIES = [
  ['v3-cinemeta.strem.io/meta/series/tt1234567.json', { __json: { meta: { type: 'series', name: 'Vincenzo', year: '2021', moviedb_id: 117376 } } }],
  [/k-drama\.in\/watch\/tv\/n-a-117376-episode-2/, [
    '<button onclick="switchServer(\'kat1\', \'https://k-drama.in/vid2.php/117376/1/2?m=hi\', \'embed\', \'\')">',
    '<button onclick="switchServer(\'server1\', \'https://embed.example/player/117376/1/2?key=k_abc\', \'embed\', \'\')">'
  ].join('')],
  ['k-drama.in/vid2.php/117376/1/2', '<iframe src="https://vidsync.pro/embed/tv/117376/1/2"></iframe>'],
  ['embed.example/player/117376/1/2', '<script>src = "https://cdn.example/vincenzo/102.m3u8"</script>']
];

test('KatDrama: id de TMDB → URL de episodio → servidores del onclick → HLS', async () => {
  const fetch = mockFetch(SERIES);
  const streams = await loadProvider('kdrama', { fetch, tmdbKey: '' }).getStreams('tt1234567', 'series', 1, 2);
  const urls = streams.map(s => s.url).sort();
  assert.ok(urls.includes('https://cdn.example/vincenzo/102.m3u8'), JSON.stringify(urls));
  assert.ok(streams.every(s => s.name.includes('KatDrama')));
  assert.ok(fetch.calls.some(c => /\/watch\/tv\/n-a-117376-episode-2$/.test(c.url)), 'usa la ruta de episodio del sitio');
});

test('KatDrama: película usa /watch/movie/n-a-<tmdb>', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt0000009.json', { __json: { meta: { type: 'movie', name: 'One Piece Film Red', year: '2022', moviedb_id: 900000 } } }],
    [/k-drama\.in\/watch\/movie\/n-a-900000/, '<button onclick="switchServer(\'kat2\', \'https://k-drama.in/mx1.php?type=movie&id=900000\', \'embed\', \'\')">'],
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

test('KatDrama: sin id de TMDB no se inventa la URL', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt8888888.json', { __json: { meta: { type: 'movie', name: 'Sin Ida', year: '2019' } } }],
    ['api.themoviedb.org', { __response: { status: 403 } }],
    ['themoviedb.org', { __response: { status: 403 } }],
    ['wikidata', { __response: { status: 403 } }]
  ]);
  const streams = await loadProvider('kdrama', { fetch, tmdbKey: '' }).getStreams('tt8888888', 'movie');
  assert.equal(streams.length, 0);
  assert.ok(!fetch.calls.some(c => c.url.includes('watch/')));
});
