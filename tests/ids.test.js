'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../addon/server');
const { parseVodId } = require('../addon/vod');
const { mockFetch, loadProvider, tmdbMovie, tmdbTv, NuvioURL } = require('./utils');

const ANIME_MAP = {
  titles: { es: 'Ataque a los Titanes', en: 'Attack on Titan', 'x-jat': 'Shingeki no Kyojin' },
  episodes: {
    1: { tvdbShowId: 267440, seasonNumber: 1, episodeNumber: 1, absoluteEpisodeNumber: 1, airDate: '2013-04-07' }
  }
};

function animeFetch(extra = []) {
  return mockFetch([
    ['api.ani.zip/mappings?anilist_id=16498', { __json: ANIME_MAP }],
    ['api.ani.zip/mappings?kitsu_id=7442', { __json: ANIME_MAP }],
    ['api.ani.zip/mappings?mal_id=16498', { __json: ANIME_MAP }],
    ['query.wikidata.org/sparql', { __json: { results: { bindings: [{
      imdb: { value: 'tt2560140' }, tmdb: { value: '1429' }, tvdb: { value: '267440' }
    }] } } }],
    ['v3-cinemeta.strem.io/meta/series/tt2560140.json', { __json: { meta: { type: 'series', name: 'Attack on Titan', year: '2013' } } }],
    ['api.themoviedb.org/3/tv/1429', tmdbTv(1429, 'Attack on Titan', '2013', [{ season_number: 1, episode_count: 25 }])],
    ['latanime.org/buscar?q=', '<a href="/anime/shingeki-no-kyojin-latino"><h3>Attack on Titan Latino</h3><span>Latino 2013</span></a>'],
    ['latanime.org/anime/shingeki-no-kyojin-latino', '<a href="/ver/shingeki-no-kyojin-latino-episodio-1">Episodio 1</a>'],
    ['latanime.org/ver/shingeki-no-kyojin-latino-episodio-1', '<iframe src="https://player.example/e/aot1"></iframe>'],
    ['player.example/e/aot1', '<source src="https://cdn.example/aot/1.m3u8?sig=1">'],
    ...extra
  ]);
}

test('un ID de anime de Nuvio (anilist/kitsu/mal) llega a Latanime con sus títulos', async () => {
  for (const id of ['anilist:16498:1:1', 'kitsu:7442:1:1', 'mal:16498:1:1']) {
    const fetch = animeFetch();
    const streams = await loadProvider('latanime', { fetch }).getStreams(id, 'anime', 1, 1);
    assert.equal(streams.length, 1, id);
    assert.equal(streams[0].url, 'https://cdn.example/aot/1.m3u8?sig=1', id);
    assert.equal(streams[0].bingGroup || streams[0].bingeGroup, 'latanime', id);
    assert.match(streams[0].filename, /Ataque|Attack|Latino/i, id);
    assert.ok(fetch.calls.some(call => call.url.includes('api.ani.zip')), 'consulta el mapa del anime');
    assert.ok(fetch.calls.every(call => !/\.(?:m3u8|mp4)$/i.test(new URL(call.url).pathname)), 'nunca descarga medios');
  }
});

test('tipo "anime" se trata como serie en los metadatos', async () => {
  const fetch = animeFetch();
  const provider = loadProvider('latanime', { fetch });
  const info = await provider.resolveMeta('anilist:16498', 'anime', 1, 1);
  assert.equal(info.isTv, true);
  assert.equal(info.title, 'Ataque a los Titanes');
  assert.equal(info.season, 1);
  assert.equal(info.episode, 1);
});

test('un ID TheTVDB se traduce con Wikidata a IMDb/TMDB antes de buscar', async () => {
  const fetch = mockFetch([
    ['query.wikidata.org/sparql', { __json: { results: { bindings: [{
      imdb: { value: 'tt0944947' }, tmdb: { value: '1399' }, tvdb: { value: '121361' }
    }] } } }],
    ['v3-cinemeta.strem.io/meta/series/tt0944947.json', { __json: { meta: { type: 'series', name: 'Juego de Tronos', year: '2011' } } }],
    ['api.themoviedb.org/3/find/tt0944947', { __json: { tv_results: [{ id: 1399 }], movie_results: [] } }],
    ['api.themoviedb.org/3/tv/1399', tmdbTv(1399, 'Juego de Tronos', '2011', [{ season_number: 1, episode_count: 10 }])],
    ['latanime.org/buscar?q=', '<a href="/anime/got"><h3>Juego de Tronos</h3><span>Latino 2011</span></a>'],
    ['latanime.org/anime/got', '<a href="/ver/got-episodio-2">Episodio 2</a>'],
    ['latanime.org/ver/got-episodio-2', '<source src="https://cdn.example/got.mp4">']
  ]);
  const streams = await loadProvider('latanime', { fetch }).getStreams('tvdb:121361:1:2', 'tv', 1, 2);
  assert.equal(streams.length, 1);
  assert.ok(fetch.calls.some(call => /wikidata/.test(call.url)), 'usa el mapa de Wikidata');
  assert.ok(fetch.calls.some(call => /tt0944947/.test(call.url)), 'enriquece con IMDb');
});

test('sin TMDB_API_KEY un ID tmdb obtiene el título de la redirección de TMDB', async () => {
  const fetch = mockFetch([
    ['www.themoviedb.org/movie/157336', { __response: { status: 302, url: 'https://www.themoviedb.org/movie/157336',
      headers: { location: 'https://www.themoviedb.org/movie/157336-interstellar' } }, body: '' }],
    ['www.themoviedb.org/tv/1399', { __response: { status: 302, url: 'https://www.themoviedb.org/tv/1399',
      headers: { location: 'https://www.themoviedb.org/tv/1399-game-of-thrones' } }, body: '' }],
    ['flixlatam.com/search?s=', url => {
      const q = new URL(url).searchParams.get('s');
      return q === 'Interstellar' ? '<a href="/pelicula/interstellar"><img alt="Ver Interstellar online"></a>'
        : q === 'Game Of Thrones' ? '<a href="/serie/game-of-thrones"><img alt="Ver Game of Thrones online"></a>' : '<p>nada</p>';
    }],
    ['flixlatam.com/pelicula/interstellar', '<video><source src="https://cdn.example/int.mp4"></video>'],
    ['flixlatam.com/serie/game-of-thrones/temporada/1/capitulo/1', '<video><source src="https://cdn.example/got1.mp4"></video>']
  ]);
  const provider = loadProvider('flixlatam', { fetch, tmdbKey: '' });
  const movie = await provider.getStreams('tmdb:157336', 'movie');
  assert.equal(movie.length, 1);
  assert.equal(movie[0].url, 'https://cdn.example/int.mp4');
  const episode = await provider.getStreams('tmdb:1399:1:1', 'series', 1, 1);
  assert.equal(episode.length, 1);
  assert.equal(episode[0].url, 'https://cdn.example/got1.mp4');
});

test('los IDs con espacios de Nuvio se aceptan y los mal formados se rechazan', () => {
  const nuvioUrl = new NuvioURL('https://addon.example/manifest.json');
  assert.equal(nuvioUrl.href, 'https://addon.example/manifest.json');
  for (const [type, id] of [
    ['tv', 'tmdb:1399:1:1'], ['series', 'tmdb-1399:1:1'], ['series', 'tmdb_1399:1:1'],
    ['anime', 'kitsu:7442:1:1'], ['anime', 'anilist:16498:1:1'], ['anime', 'anidb:12:1:1'],
    ['series', 'tvdb:121361:1:2'], ['movie', '1399']
  ]) assert.ok(parseVodId(type, id), `${type} ${id}`);
  for (const [type, id] of [
    ['movie', 'kitsu:7442:1:1'], ['series', 'kitsu:'], ['series', 'anilist:16498:1'],
    ['series', 'tmdb:1399:1:1:1'], ['movie', 'tmdb:1399/../x'], ['series', 'kitsu:7442:0:1']
  ]) assert.equal(parseVodId(type, id), null, `${type} ${id}`);
});

test('/meta responde con el título y los vídeos que el cliente usará en /stream', async () => {
  const fetch = mockFetch([
    ['www.themoviedb.org/tv/1399', '<html><head><meta property="og:title" content="Juego de Tronos (2011)"></head></html>']
  ]);
  const resolveMeta = async (type, id) => {
    const provider = loadProvider('flixlatam', { fetch, tmdbKey: '' });
    return provider.resolveMeta(id, type, 2, 4);
  };
  const server = createServer({
    get: async () => ({ url: 'https://example.com/', text: '' }),
    loadProvider: (id, opts) => loadProvider(id, { ...opts, fetch, tmdbKey: '' })
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch0(base + '/meta/series/' + encodeURIComponent('tmdb:1399:2:4') + '.json');
    assert.equal(res.status, 200);
    const meta = (await res.json()).meta;
    assert.equal(meta.name, 'Juego de Tronos');
    assert.equal(meta.type, 'series');
    assert.ok(meta.videos.some(video => video.id === 'tmdb:1399:2:4'), 'el ID reproducido está en los vídeos');
    const anime = await fetch0(base + '/meta/anime/' + encodeURIComponent('kitsu:7442:1:1') + '.json');
    assert.equal(anime.status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

function fetch0(url) {
  return globalThis.fetch(url);
}
