'use strict';

// Metadatos mínimos para los títulos que este addon resuelve. No se anuncia
// `meta` para películas ni series en el manifiesto, así que el cliente sigue
// usando su catálogo; esto solo responde si consulta el ID exacto que envía a
// /stream. Nuvio pide /meta/... antes de buscar fuentes y descarta una opción
// cuyos `videos` no contengan el ID del episodio que está reproduciendo.
const { PROVIDERS, loadProvider } = require('./vod');
const { PREFIX } = require('../sports/sources');

const MAX_EPISODES = 2000;

function parseTarget(type, id) {
  const kind = String(id || '');
  if (!kind || kind.length > 200) return null;
  const parts = kind.split(':');
  const episodic = /^(?:series|tv|anime)$/i.test(type);
  if (!episodic) return null;
  // El ID de contenido puede tener un prefijo con dos puntos (tmdb:1399).
  const body = /^(?:tmdb|tvdb|kitsu|mal|anilist|anidb):\d{1,9}$/i.test(parts.slice(0, 2).join(':'))
    ? parts.slice(0, 2).join(':') : parts[0];
  const tail = parts.slice(body.includes(':') ? 2 : 1);
  const season = tail.length === 2 ? Number(tail[0]) : null;
  const episode = tail.length === 2 ? Number(tail[1]) : null;
  if (tail.length && (!Number.isInteger(season) || !Number.isInteger(episode) || season < 1 || episode < 1)) return null;
  return { contentId: body, season, episode };
}

function metaFromInfo(type, contentId, info, season, episode) {
  const name = info && info.title ? String(info.title).slice(0, 200) : '';
  if (!name) return null;
  const meta = {
    id: contentId,
    type,
    name,
    genres: [],
    description: 'Fuentes de Nébula ES.'
  };
  if (info.year) meta.releaseInfo = String(info.year);
  if (!info.isTv || season == null) return meta;
  const episodes = [];
  for (let n = 1; n <= MAX_EPISODES; n++) {
    episodes.push({ id: `${contentId}:${season}:${n}`, season, episode: n, title: `Episodio ${n}` });
  }
  meta.videos = episodes;
  return meta;
}

function createMetaResolver(options = {}) {
  const load = options.loadProvider || loadProvider;
  const fetcher = options.fetcher;
  const tmdbKey = options.tmdbKey == null ? (process.env.TMDB_API_KEY || '') : options.tmdbKey;
  return async function resolve(type, id) {
    if (String(id || '').startsWith(PREFIX)) return null;
    const target = parseTarget(type, id);
    if (!target) return null;
    let info = null;
    try {
      const provider = load(PROVIDERS[0], { tmdbKey, fetcher });
      // Se reutiliza la resolución del provider solo para nombrar el título:
      // no se buscan fuentes ni se abre ningún reproductor.
      if (provider && typeof provider.resolveMeta === 'function') info = await provider.resolveMeta(target.contentId, 'series', target.season, target.episode);
    } catch { info = null; }
    if (!info) return null;
    return metaFromInfo(String(type).toLowerCase(), target.contentId, info, target.season, target.episode);
  };
}

module.exports = { createMetaResolver, parseTarget, metaFromInfo, MAX_EPISODES };
