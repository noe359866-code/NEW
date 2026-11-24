'use strict';
// Anime Solo — addon de Stremio SOLO streams (sin catalogos ni metadatos).
// Resuelve streams de anime en español latino desde TioAnime, Latanime y AnimeAV1.
// AniList solo se usa internamente para traducir el ID al titulo romaji que buscan los sitios.

const express = require('express');
const anilist = require('./lib/anilist');
const tioanime = require('./providers/tioanime');
const latanime = require('./providers/latanime');
const animeav1 = require('./providers/animeav1');

const app = express();
const PORT = process.env.PORT || 8080;

const manifest = {
  id: 'org.animesolo.addon',
  version: '1.0.0',
  name: 'Anime Solo Streams',
  description: 'Solo resuelve streams de anime en español latino (TioAnime, Latanime, AnimeAV1). Sin catalogos ni metadatos: usa tu addon de metadatos favorito (Cinemeta, TMDB, Kitsu...) y este solo pone los enlaces.',
  logo: 'https://i.imgur.com/placeholder.png',
  background: 'https://images.alphacoders.com/133/1331030.jpeg',
  types: ['movie', 'series'],
  resources: [
    { name: 'stream', types: ['movie', 'series'], idPrefixes: ['anilist:', 'mal:', 'kitsu:', 'anidb:', 'tt', 'tmdb:', 'tioanime:', 'latanime:', 'animeav1:'] },
  ],
  catalogs: [],
  behaviorHints: { configurable: false, configurationRequired: false },
};

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());

// Resuelve tt/tmdb -> titulo via ani.zip + AniList (solo para buscar en los sitios)
async function resolveExternalTitle(id) {
  try {
    const isTt = id.startsWith('tt');
    const raw = isTt ? id.split(':')[0] : id.split(':')[1];
    const key = isTt ? 'imdb_id' : 'tmdb_id';
    const res = await fetch(`https://api.ani.zip/mappings?${key}=${encodeURIComponent(raw)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const anilistId = json?.mappings?.anilist_id;
    if (!anilistId) return null;
    const meta = await anilist.getByAnilistId(anilistId);
    return meta ? meta.name : null;
  } catch { return null; }
}

// ---------- Stream (unico recurso) ----------
app.get('/stream/:type/:id.json', async (req, res) => {
  try {
    const { id } = req.params;
    const parts = id.split(':');
    const source = parts[0];
    let streams = [];

    if (source === 'tioanime' || source === 'latanime' || source === 'animeav1') {
      const slug = parts[1];
      const ep = parts[2];
      const prov = source === 'tioanime' ? tioanime : source === 'latanime' ? latanime : animeav1;
      streams = await prov.getStreams(slug, ep).catch(() => []);
    } else {
      let title = null;
      let episode = null;
      if (source === 'tt' || source === 'tmdb') {
        episode = source === 'tt' ? parts[2] : parts[3];
        title = await resolveExternalTitle(id).catch(() => null);
      } else {
        // anilist:123:2 / mal:456:2 / kitsu:789:2 / anidb:101:2
        episode = parts[2];
        const baseId = `${source}:${parts[1]}`;
        title = await anilist.getRomaji(baseId).catch(() => null);
      }
      if (!title) return res.json({ streams: [] });
      const results = await Promise.allSettled([
        tioanime.streamsForTitle(title, episode),
        latanime.streamsForTitle(title, episode),
        animeav1.streamsForTitle(title, episode),
      ]);
      for (const r of results) if (r.status === 'fulfilled' && Array.isArray(r.value)) streams.push(...r.value);
    }
    res.json({ streams });
  } catch (e) {
    console.error('stream error:', e.message);
    res.json({ streams: [] });
  }
});

// ---------- Manifest y landing ----------
app.get('/manifest.json', (req, res) => res.json(manifest));

app.get('/', (req, res) => {
  const host = req.get('host');
  const install = `stremio://${host}/manifest.json`;
  res.type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Anime Solo Streams — Stremio Addon</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6}
a.btn{display:inline-block;background:#5b2ee5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700}
code{background:#f1f1f1;padding:2px 6px;border-radius:4px}</style></head>
<body>
<h1>🎬 Anime Solo Streams</h1>
<p>Solo resuelve <b>streams</b> de anime en español latino (TioAnime, Latanime, AnimeAV1). Sin catalogos ni metadatos: usa Cinemeta/TMDB/Kitsu para el catalogo y este addon solo pone los enlaces.</p>
<p><a class="btn" href="${install}">Instalar en Stremio</a></p>
<p>O pega esta URL en Stremio → Addons:</p>
<p><code>https://${host}/manifest.json</code></p>
<p>IDs compatibles: <code>anilist:</code>, <code>mal:</code>, <code>kitsu:</code>, <code>anidb:</code>, <code>tt</code>, <code>tmdb:</code> y nativos <code>tioanime:</code>, <code>latanime:</code>, <code>animeav1:</code>.</p>
</body></html>`);
});

app.get('/health', (req, res) => res.json({ ok: true, name: manifest.name, version: manifest.version, resources: ['stream'] }));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Anime Solo Streams en http://localhost:${PORT} · manifest: /manifest.json`));
}

module.exports = app;
