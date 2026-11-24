'use strict';
// AnimeAV1: /catalogo?search= -> /media/<slug> -> /media/<slug>/<ep> -> servidores
const cheerio = require('cheerio');
const { fetchText } = require('../lib/http');
const { bestTitleScore, normalize } = require('../lib/text');
const { toStremioStreams, findDirectUrls } = require('../lib/streams');

const BASE = 'https://animeav1.com';

function cards(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('article').each((_, el) => {
    const a = $(el).find('a[href*="/media/"]').first();
    const href = a.attr('href') || '';
    const m = /\/media\/([^/?#]+)/.exec(href);
    if (!m) return;
    const slug = m[1];
    const title = $(el).find('h3, h2').first().text().trim() || a.text().trim();
    const img = $(el).find('img').first().attr('src');
    if (!title) return;
    out.push({ slug, title, poster: img ? (img.startsWith('http') ? img : BASE + img) : undefined });
  });
  const seen = new Set();
  return out.filter(c => { if (seen.has(c.slug)) return false; seen.add(c.slug); return true; });
}

async function search(query) {
  const html = await fetchText(`${BASE}/catalogo?search=${encodeURIComponent(query)}`);
  return cards(html);
}

async function getAnime(slug) {
  const html = await fetchText(`${BASE}/media/${slug}`);
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim() || slug;
  const poster = $('meta[property="og:image"]').attr('content') || $('figure img').first().attr('src');
  // Episodios: enlaces /media/<slug>/<n>
  const eps = [...new Set(
    $(`a[href*="/media/${slug}/"]`).map((_, a) => {
      const m = new RegExp(`/media/${slug}/(\\d+)`).exec($(a).attr('href') || '');
      return m ? parseInt(m[1], 10) : 0;
    }).get().filter(n => n > 0)
  )].sort((a, b) => a - b);
  return { slug, title, poster, episodes: eps, html };
}

function embedsFromEpisode(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('iframe[src]').each((_, f) => {
    const src = $(f).attr('src') || $(f).attr('data-src');
    if (src && /^https?:\/\//.test(src)) out.push({ name: 'Reproductor', url: src });
  });
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (/voe|yourupload|mp4upload|uqload|streamwish|mixdrop|filemoon|vidhide/i.test(href) && /^https?:\/\//.test(href)) {
      out.push({ name: $(a).text().trim().slice(0, 40) || 'Servidor', url: href });
    }
  });
  for (const u of findDirectUrls(html)) out.push({ name: 'Directo', url: u });
  const seen = new Set();
  return out.filter(e => { if (seen.has(e.url)) return false; seen.add(e.url); return true; });
}

async function getStreams(slug, episode) {
  const ep = episode ? Number(episode) : 1;
  const html = await fetchText(`${BASE}/media/${slug}/${ep}`);
  const embeds = embedsFromEpisode(html);
  if (!embeds.length) return [];
  const anime = await getAnime(slug).catch(() => ({ title: slug }));
  return toStremioStreams(embeds, { provider: 'AnimeAV1', title: anime.title, episode: ep });
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

module.exports = { search, getAnime, getStreams, streamsForTitle, BASE };
