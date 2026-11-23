'use strict';

// Diagnóstico temporal para averiguar por qué una fuente no devuelve enlaces
// desde el servidor desplegado. Solo se activa con DIAG=1 y nunca devuelve
// claves, tokens ni parámetros de consulta: únicamente host, ruta y estado.
const { PROVIDERS, loadProvider } = require('./vod');
const { safeFetch } = require('./fetch');

const MAX_REQUESTS = 60;

function cleanUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.origin + parsed.pathname;
  } catch { return '[URL inválida]'; }
}

function recorder() {
  const requests = [];
  const fetcher = async (url, init = {}) => {
    const started = Date.now();
    // Del cuerpo solo interesan los nombres de campo (p. ej. la clave de un POST).
    const bodyKeys = typeof init.body === 'string' && init.body.length <= 4000
      ? Object.keys(Object.fromEntries(new URLSearchParams(init.body))).slice(0, 12) : [];
    const entry = { url: cleanUrl(url), method: init.method || 'GET', status: 0, ms: 0 };
    if (bodyKeys.length) entry.bodyKeys = bodyKeys;
    if (requests.length < MAX_REQUESTS) requests.push(entry);
    try {
      const response = await safeFetch(url, init);
      entry.status = response && response.status;
      entry.ms = Date.now() - started;
      return response;
    } catch (error) {
      entry.status = 0;
      entry.error = String((error && (error.code || error.message)) || 'error').slice(0, 100);
      entry.ms = Date.now() - started;
      throw error;
    }
  };
  return { fetcher, requests };
}

/** Responde a los metadatos (Cinemeta/TMDB) con datos falsos para separar
 * «no se sabe el título» de «el sitio no da enlaces». Todo lo demás va real. */
function metadataStub(title, year, fetcher) {
  return async (url, init) => {
    let host = '';
    try { host = new URL(String(url)).hostname; } catch { /* ignora */ }
    if (host === 'v3-cinemeta.strem.io' || host === 'v2-cinemeta.strem.io') {
      if (!/\/meta\//.test(String(url))) return fetcher(url, init);
      return new Response(JSON.stringify({ meta: { name: title, year: String(year), type: 'movie' } }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    if (host === 'api.themoviedb.org') {
      return new Response(JSON.stringify({ title, name: title, original_title: title, original_name: title,
        release_date: year + '-01-01', first_air_date: year + '-01-01',
        seasons: [{ season_number: 1, episode_count: 24 }] }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    return fetcher(url, init);
  };
}

async function runDiagnostic({ type, id, season, episode, probeTitle = 'Interstellar', providers = PROVIDERS } = {}) {
  const result = { input: { type, id, season: season || null, episode: episode || null }, providers: [] };
  for (const providerId of providers) {
    if (!PROVIDERS.includes(providerId)) continue;
    const report = { id: providerId };

    // 1) Metadatos reales: ¿se obtiene un título con lo que hay desplegado?
    {
      const { fetcher, requests } = recorder();
      const started = Date.now();
      try {
        const provider = loadProvider(providerId, { fetcher, tmdbKey: process.env.TMDB_API_KEY || '' });
        if (typeof provider.resolveMeta === 'function') {
          const info = await provider.resolveMeta(id, type, season, episode);
          report.media = info ? {
            title: info.title || '', year: info.year || null, isTv: !!info.isTv,
            imdbId: info.imdbId || null, tmdbId: info.tmdbId || null
          } : null;
        }
      } catch (error) {
        report.mediaError = String((error && error.message) || error).slice(0, 140);
      }
      report.mediaMs = Date.now() - started;
      report.mediaRequests = requests;
      report.hasTmdbKey = !!process.env.TMDB_API_KEY;
    }

    // 2) Camino completo con metadatos simulados: ¿el sitio da enlaces?
    {
      const { fetcher, requests } = recorder();
      const blocks = [];
      const started = Date.now();
      try {
        const provider = loadProvider(providerId, {
          fetcher: metadataStub(probeTitle, 2014, fetcher), tmdbKey: '',
          settings: { onBlocked: value => blocks.push({ url: cleanUrl(value.url), status: value.status }) }
        });
        const streams = await provider.getStreams(id, type, season, episode);
        report.blocked = blocks;
        report.simulated = { title: probeTitle, streams: Array.isArray(streams) ? streams.length : 0 };
        if (streams && streams.length) {
          report.simulated.sample = streams.slice(0, 2).map(stream => ({
            name: stream.name, url: cleanUrl(stream.url), hints: Object.keys(stream.behaviorHints || {})
          }));
        }
      } catch (error) {
        report.simulated = { title: probeTitle, streams: 0, error: String((error && error.message) || error).slice(0, 140) };
      }
      report.simulatedMs = Date.now() - started;
      report.simulatedRequests = requests;
    }
    result.providers.push(report);
  }
  return result;
}

module.exports = { runDiagnostic, cleanUrl };
