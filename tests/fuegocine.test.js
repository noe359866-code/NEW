'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadProvider, mockFetch } = require('../tests/utils');

const MOVIE = [
  ['v3-cinemeta.strem.io/meta/movie/tt0000001.json', { __json: { meta: { type: 'movie', name: 'La Odisea', year: '2026' } } }],
  ['fuegocine.com/search?s=', '<p>Sin resultados</p>'],
  [/(?:fuegocine\.com\/movies|fuegocine\.com\/movies\?page=\d)$/, [
    '<div class="item"><a href="https://fuegocine.com/movies/details/otra-pelicula/100" title="Otra Película">',
    '<a href="/movies/details/la-odisea/227" title="La Odisea"><img src="https://image.tmdb.org/x.jpg"></a>'
  ].join('')],
  [/fuegocine\.com\/movies\/watch\/la-odisea\/227/, [
    '<div class="multi-server-player">',
    '<iframe src="https://unlimplay.com/f/embed/movie/1368337"></iframe>',
    '<iframe src="https://player.abyssplayer.com/KxBGoCWcV"></iframe>',
    '</div>'
  ].join('')],
  ['vimeos.unlimplay.com/?id=1368337', { __json: { embeds: { latino: { direct: 'https://p3.vimeos.zip/hls2/master.m3u8?t=abc' } } } }],
  ['player.abyssplayer.com/KxBGoCWcV', '<script>var src = "https://cdn.abyss.example/odisea.m3u8";</script>']
];

test('FuegoCine: catálogo → /watch → Unlimplay JSON y iframe directo', async () => {
  const fetch = mockFetch(MOVIE);
  const streams = await loadProvider('fuegocine', { fetch, tmdbKey: '' }).getStreams('tt0000001', 'movie');
  const urls = streams.map(s => s.url).sort();
  assert.ok(urls.includes('https://p3.vimeos.zip/hls2/master.m3u8?t=abc'), JSON.stringify(urls));
  assert.ok(urls.includes('https://cdn.abyss.example/odisea.m3u8'), JSON.stringify(urls));
  assert.ok(streams.every(s => s.name.includes('FuegoCine')));
  assert.ok(streams.find(s => s.url.includes('vimeos')).title.startsWith('La Odisea'), 'usa el título de la ficha');
});

test('FuegoCine: una película con otro título no se confunde con el catálogo', async () => {
  const fetch = mockFetch(MOVIE);
  const streams = await loadProvider('fuegocine', { fetch, tmdbKey: '' }).getStreams('tt0000001', 'movie');
  assert.ok(!fetch.calls.some(c => c.url.includes('/otra-pelicula/')), 'no abre fichas ajenas');
  assert.ok(!streams.some(s => /otra/i.test(s.title)));
});

test('FuegoCine: serie → ficha → temporada → episodio 1x02', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/series/tt0000002.json', { __json: { meta: { type: 'series', name: 'VisionQuest', year: '2025' } } }],
    ['fuegocine.com/search?s=', '<p>Sin resultados</p>'],
    [/(?:fuegocine\.com\/shows|fuegocine\.com\/shows\?page=\d)$/, '<a href="https://fuegocine.com/shows/details/visionquest/24" title="VisionQuest">'],
    [/fuegocine\.com\/shows\/details\/visionquest\/24/,
      '<a href="https://fuegocine.com/shows/visionquest/seasons/temporada-1/66" title="Temporada 1">'],
    [/fuegocine\.com\/shows\/visionquest\/seasons\/temporada-1\/66/,
      '<a href="https://fuegocine.com/shows/visionquest/01x01-sin-ataduras/49" title="01x01 - Sin ataduras">' +
      '<a href="https://fuegocine.com/shows/visionquest/01x02-teseo/50" title="01x02 - Teseo">'],
    [/fuegocine\.com\/shows\/visionquest\/01x02-teseo\/50/,
      '<iframe src="https://unlimplay.com/f/embed/movie/776503"></iframe>'],
    ['vimeos.unlimplay.com/?id=776503', { __json: { embeds: { latino: { direct: 'https://p3.vimeos.zip/hls2/vq/102.m3u8' } } } }]
  ]);
  const streams = await loadProvider('fuegocine', { fetch, tmdbKey: '' }).getStreams('tt0000002', 'series', 1, 2);
  assert.equal(streams.length, 1, JSON.stringify(streams.map(s => s.url)));
  assert.equal(streams[0].url, 'https://p3.vimeos.zip/hls2/vq/102.m3u8');
  assert.ok(/S01E02/.test(streams[0].title), streams[0].title);
  assert.ok(!fetch.calls.some(c => c.url.includes('01x01-sin-ataduras')), 'no abre otros episodios');
});

test('FuegoCine: sin episodio válido no pide nada', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/series/tt0000002.json', { __json: { meta: { type: 'series', name: 'VisionQuest', year: '2025' } } }]
  ]);
  const streams = await loadProvider('fuegocine', { fetch, tmdbKey: '' }).getStreams('tt0000002', 'series');
  assert.equal(streams.length, 0);
});
