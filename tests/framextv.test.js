'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadProvider, mockFetch } = require('../tests/utils');

const SOURCES = {
  __json: {
    sources: [
      { id: 'castle-1-en-auto', url: 'https://img.hscow.com/hls_mps/1/720/index.m3u8',
        type: 'hls', quality: 'Auto', availableQualities: ['1080p', '720p', 'Auto'],
        audioLanguage: 'en', audioLabel: 'English',
        streamHeaders: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/137.0.0.0', Referer: 'https://api.hlowb.com/' },
        server: 'Castle', provider: { id: 'castle', name: 'Castle' } },
      { id: 'netmirror-1', url: 'https://vidsync-shard.vs-deals41.workers.dev/api/netmirror/master.m3u8?cid=1',
        type: 'hls', quality: '720p', server: 'NetMirror', provider: { id: 'netmirror', name: 'NetMirror' } },
      { id: 'basura', url: 'https://player.example/embed?url=x', type: 'hls' }
    ],
    subtitles: [{ id: 'sub-0', url: 'https://vidsync-shard.vs-deals41.workers.dev/api/subtitles/vtt?url=x',
      language: 'en', label: 'English' }]
  }
};

test('frameXTV: shard de VidSync → sources HLS con cabeceras y subtítulos', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt0000005.json', { __json: { meta: { type: 'movie', name: 'Scary Movie', year: '2000', moviedb_id: 4247 } } }],
    ['vidsync-shard.vs-deals79.workers.dev', SOURCES]
  ]);
  const streams = await loadProvider('framextv', { fetch, tmdbKey: '' }).getStreams('tt0000005', 'movie');
  const urls = streams.map(s => s.url).sort();
  assert.equal(urls.length, 2, JSON.stringify(urls));
  assert.ok(urls.includes('https://img.hscow.com/hls_mps/1/720/index.m3u8'));
  assert.ok(!urls.some(u => u.includes('player.example')), 'descarta páginas de embed');
  const castle = streams.find(s => s.url.includes('hscow'));
  assert.equal(castle.quality, '1080p');
  assert.equal(castle.subtitles.length, 1);
  assert.ok(fetch.calls.some(c => c.url.includes('/api/core/streams?type=movie&id=4247')),
    JSON.stringify(fetch.calls.map(c => c.url)));
});

test('frameXTV: si el primer shard falla se prueba el siguiente', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/series/tt0000006.json', { __json: { meta: { type: 'series', name: 'Vincenzo', year: '2021', moviedb_id: 117376 } } }],
    [/vs-deals79/, { __response: { status: 503 } }],
    [/vs-deals41/, SOURCES]
  ]);
  const streams = await loadProvider('framextv', { fetch, tmdbKey: '' }).getStreams('tt0000006', 'series', 1, 2);
  assert.ok(streams.length >= 1);
  assert.ok(fetch.calls.some(c => c.url.includes('vs-deals41')));
  assert.ok(/season=1&episode=2/.test(fetch.calls.find(c => c.url.includes('vs-deals41')).url));
});

test('frameXTV: sin id de TMDB no inventa la consulta', async () => {
  const fetch = mockFetch([
    ['v3-cinemeta.strem.io/meta/movie/tt9999999.json', { __json: { meta: { type: 'movie', name: 'X', year: '2020' } } }],
    ['api.themoviedb.org', { __response: { status: 403 } }],
    ['themoviedb.org', { __response: { status: 403 } }],
    ['wikidata', { __response: { status: 403 } }]
  ]);
  const streams = await loadProvider('framextv', { fetch, tmdbKey: '' }).getStreams('tt9999999', 'movie');
  assert.equal(streams.length, 0);
  assert.ok(!fetch.calls.some(c => c.url.includes('api/core/streams')));
});
