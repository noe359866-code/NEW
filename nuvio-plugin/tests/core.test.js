'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const core = require('./.build/core.cjs');
const { makeTorrent } = require('./utils');

/* Muestras reales recogidas de los sitios el 05/11/2026 ------------------ */

const ELITE_TORRENT_PARAM = 'VjJ0YWEyRXlTbk5oTTJ4WVZrWndUbHBXVW5ObFJteFlUVmhhYTFZd05URlphMUpMV1ZVd2QyTklWbGhXZWtaWVdXdGtUMlJHU25ST1ZURnBZVEJ3ZDFkc1pISk9WMDVYWWtSV1RsZEhVbUZaYkZaaFpGWnJlVTFWWkdsaE0yUTFXVlZrZDJKR1dYZGpSRVphVFZkU1lWcEhjM2hqVmtaWllrVTVhRlpIWjNwV1J6RnlUbGRPU0ZSdVVsTlhSa3B3V1ZaU1IyUXhaRmhPV0U1clZtNUNWVlJXYUd0WGJVcFdWMVJLWVZKNlZsUlpWbFkwVmtkR1NFNVdjR2xXYkhCNlYxUkplRkl5U25KT1ZWWmhUVEJLVGxsc1pGTmpSbVJ6V2taa2JGWnRlRmxYV0c5M1VGRTlQUT09';
const ELITE_TORRENT_URL = 'https://www.elitetorrent.com/wp-content/uploads/2026/06/ven-a-volar-conmigo-(torrent48).torrent';

const ELITE_MAGNET_PARAM = 'VjJ4amQwMVZNVWRpUm14VVlsUldVVmxYY0hObFZtUjFZak5vYVUxWVFsbFZiRkpoWVZVeGRGVlliR0ZTYkVveVZGZDRWMVpXWkhOVmJGcG9ZWHBGTVZac2FIZFZNVkYzVGxSYVYxWkZTazlWYlhSTFZsWmFWMVZzY0U5V1ZHeElWVlpvZDFWR1NraFZiRUpWVFZad1QxUnNWWGhXVmtaVlZXczVVMkY2UlRCV1J6RTBVV3N3ZDAxVlpGUlhSemc1';
const ELITE_MAGNET = 'magnet:?xt=urn:btih:6D6FE32F4A7540CFD698C387A9F91084F16C70E3';

const DIVX_TORRENT_PARAM = 'aHR0cHM6Ly9kaXZ4dG90YWwuZm9vL3dwLWNvbnRlbnQvdXBsb2Fkcy8yMDI2LzEwL3Byb3llY3RvLXNhbHZhY2lvbjM5NS0oY2VudHJhbCkudG9ycmVudA==';
const DIVX_TORRENT_URL = 'https://divxtotal.foo/wp-content/uploads/2026/10/proyecto-salvacion395-(central).torrent';

const SINSITIO_DDL_PARAM = 'aHR0cHM6Ly93d3cuc2luc2l0aW8uc2l0ZS9pbmRleC5waHA%2FZG89ZG93bmxvYWQmaWQ9NzI1Nzc%3D';
const SINSITIO_DDL_URL = 'https://www.sinsitio.site/index.php?do=download&id=72577';

test('decodeShortLink: enlace .torrent real de EliteTorrent (Base64 ×5 + ROT13)', () => {
  assert.equal(core.decodeShortLink(ELITE_TORRENT_PARAM), ELITE_TORRENT_URL);
});

test('decodeShortLink: variante magnet real de EliteTorrent', () => {
  assert.equal(core.decodeShortLink(ELITE_MAGNET_PARAM), ELITE_MAGNET);
});

test('decodeShortLink: enlaces de short-info.link usados por DivxTotal', () => {
  const encoded = core.bytesToB64(core.utf8ToBytes(ELITE_TORRENT_URL));
  const layered = [0, 1, 2, 3].reduce((value) => core.bytesToB64(core.utf8ToBytes(value)), encoded);
  assert.equal(core.decodeShortLink(layered), ELITE_TORRENT_URL);
});

test('decodeShortLink: entrada inválida devuelve null', () => {
  assert.equal(core.decodeShortLink('no-es-un-enlace'), null);
  assert.equal(core.decodeShortLink(''), null);
  assert.equal(core.decodeShortLink(null), null);
});

test('download_tt.php: base64 del parámetro u (DivxTotal)', () => {
  const decoded = core.bytesToText(core.b64ToBytes(DIVX_TORRENT_PARAM));
  assert.equal(decoded, DIVX_TORRENT_URL);
});

test('ddlUrl.php: base64 con escape URL (SinSitio)', () => {
  const decoded = core.bytesToText(core.b64ToBytes(decodeURIComponent(SINSITIO_DDL_PARAM)));
  assert.equal(decoded, SINSITIO_DDL_URL);
});

test('parseTorrent: infohash idéntico al SHA-1 del diccionario info', () => {
  const torrent = makeTorrent('Pelicula.Castellano.1080p.mkv', 987654321);
  const parsed = core.parseTorrent(new Uint8Array(torrent.bytes));
  assert.ok(parsed, 'debe parsear el torrent');
  assert.equal(parsed.infoHash, torrent.infoHash);
  assert.equal(parsed.name, 'Pelicula.Castellano.1080p.mkv');
  assert.equal(parsed.size, 987654321);
});

test('parseTorrent: ignora HTML y binarios que no son torrent', () => {
  assert.equal(core.parseTorrent(core.utf8ToBytes('<html>no soy un torrent</html>')), null);
  assert.equal(core.parseTorrent(new Uint8Array(0)), null);
});

test('sha1Bytes y sha256Bytes coinciden con node:crypto', () => {
  const payload = core.utf8ToBytes('Nébula — scrapers en español · 2026');
  assert.equal(core.sha1Bytes(payload), crypto.createHash('sha1').update(payload).digest('hex'));
  assert.equal(core.sha256Bytes(payload), crypto.createHash('sha256').update(payload).digest('hex'));
});

test('sha256Hex con texto UTF-8 (acentos)', () => {
  const text = 'La emperatriz divorciada — 1ª Temporada';
  assert.equal(core.sha256Hex(text), crypto.createHash('sha256').update(text, 'utf8').digest('hex'));
});

test('proof-of-work de DonTorrent: nonce válido con dificultad 3', () => {
  const engine = core.createDonEngine({ id: 'test', label: 'Test', hosts: [] });
  const challenge = 'a1b2c3d4';
  const nonce = engine._internal.solveProofOfWork(challenge, 3);
  assert.equal(typeof nonce, 'number');
  const hash = core.sha256Hex(challenge + nonce);
  assert.ok(hash.startsWith('000'), `hash ${hash} debe tener tres ceros`);
  // el nonce anterior no debe cumplir la condición
  if (nonce > 0) assert.ok(!core.sha256Hex(challenge + (nonce - 1)).startsWith('000'));
});

test('buildMagnet: incluye infohash, nombre y trackers', () => {
  const magnet = core.buildMagnet('ABCDEF0123456789ABCDEF0123456789ABCDEF01', 'Peli 1080p', 1024);
  assert.match(magnet, /^magnet:\?xt=urn:btih:abcdef0123456789abcdef0123456789abcdef01/);
  assert.match(magnet, /&dn=Peli%201080p/);
  assert.match(magnet, /&tr=/);
  assert.equal(core.infoHashFromMagnet(magnet), 'abcdef0123456789abcdef0123456789abcdef01');
});

test('infoHashFromMagnet acepta base32', () => {
  const hex = 'abcdef0123456789abcdef0123456789abcdef01';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of hex) bits += parseInt(char, 16).toString(2).padStart(4, '0');
  let base32 = '';
  for (let i = 0; i < bits.length; i += 5) base32 += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  assert.equal(core.infoHashFromMagnet(`magnet:?xt=urn:btih:${base32}`), hex);
});

test('parseSeasonEpisode: formatos que usan los sitios', () => {
  assert.deepEqual(pick(core.parseSeasonEpisode('Reacher4x5')), { season: 4, episode: 5 });
  assert.deepEqual(pick(core.parseSeasonEpisode('Terapia sin filtro 3×10')), { season: 3, episode: 10 });
  assert.deepEqual(pick(core.parseSeasonEpisode('The Wire S02E07 HDTV')), { season: 2, episode: 7 });
  assert.deepEqual(pick(core.parseSeasonEpisode('La emperatriz divorciada - 1ª Temporada [1080p]')), { season: 1, episode: null });
  assert.deepEqual(pick(core.parseSeasonEpisode('Cap. 4')), { season: null, episode: 4 });
  assert.deepEqual(pick(core.parseSeasonEpisode('Temporada 2')), { season: 2, episode: null });
});

test('matchesEpisode: acepta packs y rechaza otras temporadas', () => {
  assert.equal(core.matchesEpisode('1x01', 1, 1), true);
  assert.equal(core.matchesEpisode('Cap. 1-2', 1, 2), true);
  assert.equal(core.matchesEpisode('1x01', 1, 2), false);
  assert.equal(core.matchesEpisode('2x03', 1, 3), false);
  assert.equal(core.matchesEpisode('Temporada 1 [1080p]', 1, 5), true);
});

test('titleScore tolera acentos, artículos y coletillas de release', () => {
  const exact = core.titleScore('La emperatriz divorciada - 1ª Temporada [1080p]', 'La emperatriz divorciada');
  assert.ok(exact > 0.8, `puntuación ${exact}`);
  const partial = core.titleScore('A Dog Perfect Christmas DVDRip', "A Dog's Perfect Christmas");
  assert.ok(partial > 0.6, `puntuación ${partial}`);
  const other = core.titleScore('Otra película distinta', 'La emperatriz divorciada');
  assert.ok(other < 0.3, `puntuación ${other}`);
});

test('parseQuality y parseSize con formatos de los sitios', () => {
  assert.equal(core.parseQuality('BluRay-1080p'), '1080p');
  assert.equal(core.parseQuality('4K-HDR'), '2160p');
  assert.equal(core.parseQuality('HDRip'), 'SD');
  assert.equal(core.parseQuality('DVDRip XviD Castellano'), 'SD');
  assert.equal(core.parseSize('1,35 GB'), Math.round(1.35 * 1024 * 1024 * 1024));
  assert.equal(core.parseSize('793,61 MB'), Math.round(793.61 * 1024 * 1024));
  assert.equal(core.formatSize(1024 * 1024 * 1500), '1.46 GB');
});

test('cleanContentId acepta ids de TMDB, IMDb y prefijos', () => {
  assert.equal(core.cleanContentId('31199'), '31199');
  assert.equal(core.cleanContentId('tmdb:31199'), '31199');
  assert.equal(core.cleanContentId('tt0137523'), 'tt0137523');
  assert.equal(core.cleanContentId('31199:1:2'), '31199');
});

test('searchQueries combina título, original y año sin duplicados', () => {
  const queries = core.searchQueries({
    title: 'El señor de los anillos',
    originalTitle: 'The Lord of the Rings',
    year: 2001,
    titles: []
  });
  assert.equal(queries[0], 'El señor de los anillos');
  assert.ok(queries.includes('The Lord of the Rings'));
  assert.ok(queries.includes('El señor de los anillos 2001'));
});

test('settings mezcla valores por defecto con SCRAPER_SETTINGS', () => {
  const previous = global.SCRAPER_SETTINGS;
  global.SCRAPER_SETTINGS = { maxResults: '4' };
  try {
    const conf = core.settings({ maxResults: '8', includeVose: true });
    assert.equal(conf.maxResults, '4');
    assert.equal(conf.includeVose, true);
  } finally {
    global.SCRAPER_SETTINGS = previous;
  }
});

function pick(parsed) {
  return { season: parsed.season, episode: parsed.episode };
}
