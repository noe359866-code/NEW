'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadProvider, mockFetch } = require('../tests/utils');

const SERIES = [
  ['v3-cinemeta.strem.io/meta/series/tt2560140.json', { __json: { meta: { type: 'series', name: 'Shingeki no Kyojin', year: '2013' } } }],
  ['tioanime.com/directorio?q=', u => {
    const q = new URL(u).searchParams.get('q');
    return q === 'Shingeki no Kyojin'
      ? '<main><article class="anime"><a href="/anime/shingeki-no-kyojin"><h3 class="title">Shingeki no Kyojin</h3><img src="https://tioanime.com/uploads/portadas/999.jpg"></a></article></main>'
      : '<p>nada</p>';
  }],
  ['tioanime.com/anime/shingeki-no-kyojin', '<script>var anime_info = ["999"]; var episodes = [1,2,3,4];</script>'],
  ['tioanime.com/ver/shingeki-no-kyojin-3', '<script>var videos = [["Voe","https://voe.example/e/abc"],["YourUpload","//yourupload.example/e/1"],["Netu","https://netu.example/x"]];</script>'],
  ['voe.example/e/abc', '<source src="https://cdn.example/aot/3.m3u8">'],
  ['yourupload.example/e/1', '<video src="https://cdn.example/aot/3b.mp4"></video>']
];

test('TioAnime: directorio → ficha → episodio → servidores de la lista blanca', async () => {
  const fetch = mockFetch(SERIES);
  const streams = await loadProvider('tioanime', { fetch, tmdbKey: '' }).getStreams('tt2560140', 'series', 1, 3);
  assert.equal(streams.length, 2);
  // El array viene del sandbox del provider: se compara como JSON.
  assert.equal(JSON.stringify(streams.map(s => s.url).sort()), JSON.stringify(['https://cdn.example/aot/3.m3u8', 'https://cdn.example/aot/3b.mp4']));
  assert.ok(streams.every(s => s.name === 'TioAnime' || s.name.includes('TioAnime')));
  assert.ok(fetch.calls.every(c => !/netu\.example/.test(c.url)), 'descarta servidores fuera de la lista blanca');
});

test('TioAnime: un episodio que no existe en la lista no adivina la URL', async () => {
  const fetch = mockFetch(SERIES);
  const streams = await loadProvider('tioanime', { fetch, tmdbKey: '' }).getStreams('tt2560140', 'series', 1, 40);
  assert.equal(streams.length, 0);
  assert.ok(!fetch.calls.some(c => c.url.includes('/ver/shingeki-no-kyojin-40')));
});

test('TioAnime: película usa /ver/<slug>-1 y respeta el tipo', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt0816692.json', { __json: { meta: { type: 'movie', name: 'Akira', year: '1988' } } }],
    ['tioanime.com/directorio?q=', '<article class="anime"><a href="/anime/akira"><h3 class="title">Akira</h3></a><span class="anime-type-peli">Película</span></article>'],
    ['tioanime.com/anime/akira', '<script>var episodes = [1];</script>'],
    ['tioanime.com/ver/akira-1', '<script>var videos = [["Voe","https://voe.example/e/akira"]];</script>'],
    ['voe.example/e/akira', '<source src="https://cdn.example/akira.m3u8">']
  ]);
  const streams = await loadProvider('tioanime', { fetch, tmdbKey: '' }).getStreams('tt0816692', 'movie');
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/akira.m3u8');
});
