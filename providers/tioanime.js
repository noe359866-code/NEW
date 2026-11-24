'use strict';
// TioAnime: /directorio?q= -> /anime/<slug> -> var episodes -> /ver/<slug>-<n> -> var videos -> embeds
const cheerio = require('cheerio');
const { fetchText } = require('../lib/http');
const { bestTitleScore, normalize } = require('../lib/text');
const { toStremioStreams } = require('../lib/streams');

const BASE = 'https://tioanime.com';

function parseArrayLiteral(html, marker) {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const start = html.indexOf('[', idx);
  if (start < 0) return null;
  let depth = 0, quoted = false, esc = false;
  for (let i = start; i < html.length && i < start + 200000; i++) {
    const c = html[i];
    if (quoted) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return html.slice(start, i + 1); }
  }
  return null;
}

function episodeNumbers(html) {
  const lit = parseArrayLiteral(html, 'var episodes');
  if (!lit) return [];
  const nums = [...lit.matchAll(/\d{1,4}/g)].map(m => parseInt(m[0], 10)).filter(n => n > 0);
  return [...new Set(nums)].sort((a, b) => a - b);
}

function videoEmbeds(html) {
  const lit = parseArrayLiteral(html, 'var videos');
  if (!lit) return [];
  let data;
  try { data = JSON.parse(lit); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const pair of data.slice(0, 20)) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const name = String(pair[0] || '').trim();
    let url = String(pair[1] || '').trim();
    if (!url || !name) continue;
    if (!/^https?:\/\//i.test(url)) url = BASE + '/' + url.replace(/^\/+/, '');
    out.push({ name, url });
  }
  return out;
}

function cards(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('article.anime, article').each((_, el) => {
    const a = $(el).find('a[href*="/anime/"]').first();
    const href = a.attr('href');
    if (!href) return;
    const slug = href.replace(/^.*\/anime\//, '').replace(/\/.*$/, '').trim();
    if (!slug) return;
    const title = $(el).find('h3, h2, .title').first().text().trim() || a.text().trim();
    const img = $(el).find('img').first().attr('src');
    if (!title) return;
    out.push({ slug, title, poster: img ? (img.startsWith('http') ? img : BASE + img) : undefined });
  });
  // Fallback: enlaces directos a /anime/
  if (!out.length) {
    $('a[href*="/anime/"]').each((_, a) => {
      const href = $(a).attr('href');
      const slug = href.replace(/^.*\/anime\//, '').replace(/\/.*$/, '').trim();
      const title = $(a).text().trim();
      if (slug && title) out.push({ slug, title });
    });
  }
  const seen = new Set();
  return out.filter(c => { const k = c.slug; if (seen.has(k)) return false; seen.add(k); return true; });
}

async function search(query) {
  const url = `${BASE}/directorio?q=${encodeURIComponent(query)}&year=1950,${new Date().getFullYear() + 1}&status=2&sort=recent`;
  const html = await fetchText(url);
  return cards(html);
}

async function getAnime(slug) {
  const html = await fetchText(`${BASE}/anime/${slug}`);
  const $ = cheerio.load(html);
  const title = $('h1').first().text().trim() || slug;
  const poster = $('meta[property="og:image"]').attr('content') || $('article img').first().attr('src');
  const eps = episodeNumbers(html);
  return { slug, title, poster, episodes: eps, html };
}

async function getStreams(slug, episode) {
  const ep = episode ? Number(episode) : 1;
  const html = await fetchText(`${BASE}/ver/${slug}-${ep}`);
  const embeds = videoEmbeds(html);
  if (!embeds.length) return [];
  const anime = await getAnime(slug).catch(() => ({ title: slug }));
  return toStremioStreams(embeds, { provider: 'TioAnime', title: anime.title, episode: ep });
}

// Busca por titulo (romaji de AniList) y devuelve streams del mejor candidato
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
