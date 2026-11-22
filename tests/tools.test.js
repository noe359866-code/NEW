'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { parseArgs, validateArgs, tmdbStubFetch, loadProvider, displayUrl } = require('../tools/live-check');
const { mockFetch } = require('./utils');

test('live-check valida parámetros y oculta tokens en la salida', () => {
  const args = parseArgs(['--site', 'latanime', '--id', '44', '--type', 'tv', '--season', '2', '--episode', '1', '--title', 'One Piece', '--season-counts', '12,10']);
  assert.doesNotThrow(() => validateArgs(args));
  assert.deepEqual(args.seasonCounts, [12, 10]);
  assert.throws(() => validateArgs(parseArgs(['--all', '--id', '44', '--type', 'tv'])), /--season/);
  assert.throws(() => parseArgs(['--site']), /Falta el valor/);
  assert.equal(displayUrl('https://cdn.example/master.m3u8?token=secret'), 'https://cdn.example/master.m3u8?[oculto]');
});

test('live-check con metadatos simulados mantiene crypto-js y consulta páginas reales o simuladas', async () => {
  const iv = Buffer.alloc(16, 4);
  const key = crypto.createHash('sha256').update('challengesalt').digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([iv, cipher.update('https://player.example/e/1'), cipher.final()]).toString('base64');
  const data = [{ video_language: 'LAT', sortedEmbeds: [{ servername: 'Filemoon', link: encrypted }] }];
  const network = mockFetch([
    ['flixlatam.com/search?s=', '<a href="/pelicula/interstellar"><img alt="Ver Interstellar online"></a>'],
    ['flixlatam.com/pelicula/interstellar', '<iframe src="https://embed69.org/f/demo"></iframe>'],
    ['embed69.org/f/demo', `const LINK_CHALLENGE='challenge'; const LINK_SALT='salt'; let dataLink=${JSON.stringify(data)};`],
    ['player.example/e/1', '<source src="https://cdn.example/master.m3u8?token=secret">']
  ]);
  const fetcher = tmdbStubFetch('Interstellar', '2014', 'movie', network);
  const provider = loadProvider('flixlatam', { fetcher, tmdbKey: 'metadatos-simulados' });
  const streams = await provider.getStreams('157336', 'movie');
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, 'https://cdn.example/master.m3u8?token=secret');
  assert.ok(network.calls.every(call => !/\.m3u8/.test(new URL(call.url).pathname)));
});

test('la simulación TMDB ofrece recuentos de temporadas e IMDb para series', async () => {
  const fallback = async () => { throw new Error('No debe acceder a la red'); };
  const fetcher = tmdbStubFetch('One Piece', '1999', 'tv', fallback, [12, 10]);
  const payload = await (await fetcher('https://api.themoviedb.org/3/tv/44?api_key=fake')).json();
  assert.deepEqual(payload.seasons.map(s => s.episode_count), [12, 10]);
  const imdb = await (await fetcher('https://v3-cinemeta.strem.io/meta/series/tt1234567.json')).json();
  assert.equal(imdb.meta.type, 'series');
});
