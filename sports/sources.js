'use strict';

const { safeUrl, mediaUrl } = require('./http');
const { attr, text, sourceFromEmbed, resolvePages } = require('./extract');

const TV_BASE = 'https://www.tvenvivo.org';
const DADDY_BASE = 'https://thedaddy.li';
const ONDEMAND_BASE = 'https://ondemand.st';
const PREFIX = 'nebula-sport:';
const SOURCE_IDS = ['tvenvivo', 'ondemand', 'thedaddy'];

function isSportsName(name) {
  const n = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\b(?:sports?|deportes?|deportiva|espn\d*|tudn|tyc\s*sports?|dazn|eurosport|supersport|sportnet|sportsnet|sportklub|sporting|teledeporte|futbol|football|soccer|goltv|gol\s*peru|laliga|la\s+liga|liga\s+1|liga\s+de\s+campeones|champions\s+league|premier\s+sports?|directv\s*sports?|racing|cricket|tennis|tenis|golf|nba|nfl|mlb|nhl|ufc|wwe|f1|formula\s*1|tsn\s*\d*|fox\s+deportes|fight\s+network|big\s+ten|btn|sec\s+network|acc\s+network|alkass|calcio|barca\s*tv|real\s+madrid\s*tv)\b/i.test(n);
}

function sourceId(source, id) { return PREFIX + source + ':' + id; }

function parseTvHome(html) {
  const out = [];
  const re = /<a\b[^>]*>[\s\S]{0,2500}?<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const block = m[0];
    const open = block.slice(0, block.indexOf('>') + 1);
    const url = safeUrl(attr(open, 'href'), TV_BASE + '/', { page: true });
    if (!url) continue;
    const parsed = new URL(url);
    if (!/^(?:www\.)?tvenvivo\.org$/i.test(parsed.hostname)) continue;
    const path = /^\/([a-z0-9-]+)-en-vivo-online\.php\/?$/i.exec(parsed.pathname);
    if (!path) continue;
    const image = /<img\b[^>]*>/i.exec(block);
    const name = ((image && attr(image[0], 'alt')) || attr(open, 'title') || text(block))
      .replace(/\s+en\s+vivo(?:\s+online)?\s*$/i, '').replace(/^en\s+vivo\s*\d+\s*/i, '').trim();
    if (!isSportsName(name)) continue;
    const poster = image ? safeUrl(attr(image[0], 'src') || attr(image[0], 'data-src'), TV_BASE + '/') : null;
    out.push({ id: sourceId('tvenvivo', path[1]), source: 'tvenvivo', key: path[1], name, page: url, poster });
  }
  return out.filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
}

function parseDaddyList(html) {
  const out = [];
  const re = /<a\b[^>]*>[\s\S]{0,2500}?<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const block = m[0];
    const open = block.slice(0, block.indexOf('>') + 1);
    const url = safeUrl(attr(open, 'href'), DADDY_BASE + '/', { page: true });
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.hostname !== 'thedaddy.li' || parsed.pathname !== '/watch.php') continue;
    const id = parsed.searchParams.get('id');
    if (!/^\d{1,8}$/.test(id || '')) continue;
    const title = /<[^>]*\bclass=["'][^"']*\bcard__title\b[^"']*["'][^>]*>([\s\S]*?)<\//i.exec(block);
    const name = text(title ? title[1] : attr(open, 'data-title') || attr(open, 'title') || block).replace(/\s*ID:\s*\d+\s*$/i, '').trim();
    if (!isSportsName(name)) continue;
    out.push({ id: sourceId('thedaddy', id), source: 'thedaddy', key: id, name, page: url, poster: null });
  }
  return out.filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
}

const SPORT_CATEGORIES = new Set([
  'football', 'soccer', 'basketball', 'american-football', 'baseball', 'cricket', 'ice-hockey',
  'hockey', 'afl', 'motor-sports', 'motorsports', 'rugby', 'tennis', 'golf', 'darts', 'fight',
  'boxing', 'mma', 'volleyball', 'handball', 'cycling', 'snooker', 'sports'
]);

function parseOnDemand(payload) {
  const groups = payload && Array.isArray(payload.streams) ? payload.streams : [];
  const out = [];
  for (const group of groups) {
    if (!Array.isArray(group.streams)) continue;
    for (const item of group.streams) {
      if (!item || !/^[a-z0-9._-]{1,100}$/i.test(String(item.id || '')) || typeof item.name !== 'string') continue;
      const category = String(item.category_name || group.category || '').toLowerCase();
      const groupCategory = String(group.category || '').toLowerCase();
      const is247 = Number(item.always_live) === 1 || category === '24/7-streams' || groupCategory === '24/7-streams';
      const isLive = is247 || String(item.status || '').toLowerCase() === 'live';
      if (!isLive) continue;
      // Las categorías de deportes son explícitas; 24/7 también tiene ocio y
      // requiere una señal cuyo nombre sea claramente deportivo.
      if (is247 ? !isSportsName(item.name) : !(SPORT_CATEGORIES.has(category) || SPORT_CATEGORIES.has(groupCategory))) continue;
      const rawSources = Array.isArray(item.sources) ? item.sources : [];
      const sources = rawSources.filter(source => source && typeof source.embed === 'string').slice(0, 16)
        .map(source => ({ name: String(source.name || 'Servidor').slice(0, 100), embed: source.embed, hd: source.hd }));
      if (!sources.length && item.embed) sources.push({ name: 'Servidor', embed: item.embed });
      if (!sources.length) continue;
      out.push({ id: sourceId('ondemand', item.id), source: 'ondemand', key: item.id,
        name: item.name.trim().slice(0, 160), poster: safeUrl(item.poster || ''),
        league: String(item.league || '').slice(0, 100), sources });
    }
  }
  return out.filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
}

async function collect(source, get) {
  if (source === 'tvenvivo') {
    const page = await get(TV_BASE + '/');
    return parseTvHome(page.text);
  }
  if (source === 'thedaddy') {
    const page = await get(DADDY_BASE + '/24-7-channels.php');
    return parseDaddyList(page.text);
  }
  if (source === 'ondemand') {
    const page = await get(ONDEMAND_BASE + '/papi/api/streams', { referer: ONDEMAND_BASE + '/' });
    return parseOnDemand(JSON.parse(page.text));
  }
  return [];
}

async function resolveEntry(entry, get) {
  if (entry.source === 'ondemand') {
    const direct = [];
    const seeds = [];
    for (const source of entry.sources || []) {
      const result = sourceFromEmbed(source.embed);
      if (result) direct.push({ ...result, name: source.name });
      else {
        const embed = safeUrl(source.embed, ONDEMAND_BASE + '/', { page: true });
        if (embed && /(?:^|\.)(?:damitv\.st|ondemand\.st|ondemand\.to)$/i.test(new URL(embed).hostname)) {
          seeds.push({ url: embed, referer: ONDEMAND_BASE + '/', name: source.name });
        }
      }
    }
    // Solo se visita el player si el parámetro de la API no expone el medio.
    if (!direct.length && seeds.length) direct.push(...await resolvePages(seeds.slice(0, 3), get));
    return direct.filter((item, index, list) => mediaUrl(item.url) && list.findIndex(x => x.url === item.url) === index).slice(0, 8);
  }
  if (entry.source === 'tvenvivo') {
    // El identificador canal= no coincide siempre con el slug de la ficha.
    // Seguir solo las opciones publicadas en esa ficha, sin inventar URLs.
    return resolvePages([{ url: entry.page, referer: TV_BASE + '/' }], get, { maxPages: 10, maxDepth: 3 });
  }
  if (entry.source === 'thedaddy' && /^\d{1,8}$/.test(entry.key)) {
    const seeds = [{ url: entry.page, referer: DADDY_BASE + '/' }];
    for (const path of ['stream', 'cast', 'player', 'plus']) {
      seeds.push({ url: `${DADDY_BASE}/${path}/stream-${entry.key}.php`, referer: entry.page });
    }
    return resolvePages(seeds, get, { maxPages: 10, maxDepth: 3 });
  }
  return [];
}

class SportsCatalog {
  constructor({ get, now = () => Date.now(), ttl = 60000 } = {}) {
    this.get = get;
    this.now = now;
    this.ttl = ttl;
    this.cache = new Map();
    this.pending = new Map();
  }
  async one(source, { force = false } = {}) {
    if (!SOURCE_IDS.includes(source)) return [];
    const old = this.cache.get(source);
    if (!force && old && old.until > this.now()) return old.items;
    if (this.pending.has(source)) return this.pending.get(source);
    const job = collect(source, this.get).then(items => {
      this.cache.set(source, { items, until: this.now() + this.ttl });
      return items;
    }).catch(() => {
      // Si falla una fuente no se eliminan las otras; se conserva su catálogo
      // anterior durante un intervalo corto para no martillar el origen.
      const items = old ? old.items : [];
      this.cache.set(source, { items, until: this.now() + Math.min(this.ttl, 15000) });
      return items;
    }).finally(() => this.pending.delete(source));
    this.pending.set(source, job);
    return job;
  }
  async all(source) {
    const sources = SOURCE_IDS.includes(source) ? [source] : SOURCE_IDS;
    const lists = await Promise.all(sources.map(id => this.one(id)));
    return lists.flat();
  }
  async find(id, { force = false } = {}) {
    const match = /^nebula-sport:(tvenvivo|ondemand|thedaddy):([a-z0-9._-]{1,100})$/i.exec(String(id || ''));
    if (!match) return null;
    const list = await this.one(match[1].toLowerCase(), { force });
    return list.find(entry => entry.id === id) || null;
  }
}

module.exports = { PREFIX, SOURCE_IDS, isSportsName, parseTvHome, parseDaddyList, parseOnDemand, collect, resolveEntry, SportsCatalog };
