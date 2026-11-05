/*__CORE__*/

/* ------------------------------------------------------------------
 * MejorTorrent · www47.mejortorrent.eu
 * Comparte software con DonTorrent (mismas rutas, mismos botones
 * protegidos y mismo proof-of-work), cambia el dominio y el catálogo.
 * ------------------------------------------------------------------ */

var MEJORTORRENT_ENGINE = createDonEngine({
  id: 'mejortorrent',
  label: 'MejorTorrent',
  hosts: [
    'https://www47.mejortorrent.eu',
    'https://www46.mejortorrent.eu',
    'https://www45.mejortorrent.eu',
    'https://mejortorrent.eu'
  ],
  maxResults: 8
});

function getStreams(tmdbId, mediaType, season, episode) {
  return MEJORTORRENT_ENGINE.getStreams(tmdbId, mediaType, season, episode);
}

function onSettings() {
  return Promise.resolve([
    { type: 'header', label: 'MejorTorrent' },
    { type: 'info', label: 'MejorTorrent rota de dominio a menudo (wwwNN.mejortorrent.eu). El provider prueba varios automáticamente.' },
    { type: 'select', key: 'maxResults', label: 'Máximo de fuentes', defaultValue: '8', options: [
      { value: '4', label: '4' }, { value: '6', label: '6' }, { value: '8', label: '8' }, { value: '12', label: '12' }
    ] }
  ]);
}

module.exports = { getStreams: getStreams, onSettings: onSettings };
