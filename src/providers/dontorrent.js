/*__CORE__*/

/* ------------------------------------------------------------------
 * DonTorrent · dontorrent.tips  (dominio vigente en noviembre 2026)
 * Motor propio: búsqueda POST /buscar, fichas /pelicula y /serie,
 * descargas protegidas con proof-of-work SHA-256.
 * ------------------------------------------------------------------ */

var DONTORRENT_ENGINE = createDonEngine({
  id: 'dontorrent',
  label: 'DonTorrent',
  hosts: [
    'https://dontorrent.tips',
    'https://dontorrent.meme',
    'https://dontorrent.cfd',
    'https://dontorrent.pink',
    'https://dontorrent.diy'
  ],
  maxResults: 8
});

function getStreams(tmdbId, mediaType, season, episode) {
  return DONTORRENT_ENGINE.getStreams(tmdbId, mediaType, season, episode);
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'DonTorrent' },
    { type: 'info', label: 'Las descargas usan la prueba de trabajo SHA-256 del sitio; se resuelven en el dispositivo y se convierten en magnet con el infohash real.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] }
  ]);
}

module.exports = { getStreams: getStreams, onSettings: onSettings };
