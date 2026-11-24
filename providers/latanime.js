'use strict';
// Latanime: /buscar?q= -> /anime/<slug> -> /ver/<slug>-episodio-<n> -> reproductor
const cheerio = require('cheerio');
const { fetchText } = require('../lib/http');
const { bestTitleScore, normalize, parseSeason } = require('../lib/text');
const { toStremioStreams, findDirectUrls } = require('../lib/streams');

const BASE = 'https://latanime.org';

function cards(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('a[href*="/anime/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = /\/anime\/([^/?#]+)/.exec(href);
    if (!m) return;
    const slug = m[1];
    const title = $(a).find('h3, h2, strong, b').first().text().trim() || $(a).attr('title') || $(a).text().trim();
    const img = $(a).find('img').first().attr('src');
    if (!title) return;
    out.push({ slug, title, poster: img ? (img.startsWith('http') ? img : BASE + img) : undefined });
  });
  const seen = new Set();
  return out.filter(c => { if (seen.has(c.slug)) return false; seen.add(c.slug); return true; });
}

async function search(query) {
  const html = await fetchText(`${BASE}/buscar?q=${encodeURIComponent(query)}`);
  return cards(html);
}

async function getAnime(slug) {
  const html = await fetchText(`${BASE}/anime/${slug}`);
  const $ = cheerio.load(html);
  const title = $('h1, h2').first().text().trim() || slug;
  const poster = $('meta[property="og:image"]').attr('content');
  const eps = [...new Set(
    $('a[href*="/ver/"]').map((_, a) => {
      const m = /-episodio-(\d+)/.exec($(a).attr('href') || '');
      return m ? parseInt(m[1], 10) : 0;
    }).get().filter(n => n > 0)
  )].sort((a, b) => a - b);
  return { slug, title, poster, episodes: eps, html };
}

function embedsFromEpisode(html) {
  const $ = cheerio.load(html);
  const out = [];
  // iframes de reproductores
  $('iframe[src]').each((_, f) => {
    const src = $(f).attr('src') || $(f).attr('data-src');
    if (src && /^https?:\/\//.test(src)) out.push({ name: 'Reproductor', url: src });
  });
  // data-player / data-src en botones de servidores
  $('[data-player], [data-src], [data-url]').each((_, el) => {
    const v = $(el).attr('data-player') || $(el).attr('data-src') || $(el).attr('data-url');
    const label = $(el).text().trim() || 'Servidor';
    if (v && /^https?:\/\//.test(v)) out.push({ name: label.slice(0, 40) || 'Servidor', url: v });
  });
  // enlaces directos m3u8/mp4 en la pagina
  const direct = findDirectUrls(html);
  for (const u of direct) out.push({ name: 'Directo', url: u });
  // dedup
  const seen = new Set();
  return out.filter(e => { if (seen.has(e.url)) return false; seen.add(e.url); return true; });
}

async function getStreams(slug, episode) {
  const ep = episode ? Number(episode) : 1;
  const html = await fetchText(`${BASE}/ver/${slug}-episodio-${ep}`);
  const embeds = embedsFromEpisode(html);
  if (!embeds.length) return [];
  const anime = await getAnime(slug).catch(() => ({ title: slug }));
  // Si el embed ya es directo, toStremioStreams lo maneja igual
  return toStremioStreams(embeds, { provider: 'Latanime', title: anime.title, episode: ep });
}

async function streamsForTitle(title, episode) {
  const results = await search(title);
  if (!results.length) return [];
  const scored = results.map(r => ({ ...r, score: bestTitleScore(r.title, [title, normalize(title)]) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.3) return [];
  return getStreams(best.slug, episode);
}

module.exports = { search, getAnime, getStreams, streamsForTitle, BASE, parseSeason };
