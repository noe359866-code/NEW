import { KEYS, readJSON, writeJSON } from './storage';
import type { Manifest, MetaPreview, Stream } from './types';

const TIMEOUT_MS = 14000;
const CACHE_TTL = 1000 * 60 * 10;
const PERSIST_TTL = 1000 * 60 * 60 * 24 * 7;
const PERSIST_LIMIT = 80;
const PERSIST_MAX_CHARS = 250_000;

interface CacheEntry {
  at: number;
  data: unknown;
}

interface LocalSettings {
  offlineOnly?: boolean;
  persistCache?: boolean;
  cinemetaUrl?: string;
}

const cache = new Map<string, CacheEntry>();

function localSettings(): LocalSettings {
  return readJSON<LocalSettings>(KEYS.settings, {});
}

/** Modo "solo datos guardados": ni una petición a servidores externos. */
export function isOfflineMode(): boolean {
  if (localSettings().offlineOnly === true) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function readPersisted(url: string): CacheEntry | undefined {
  if (localSettings().persistCache === false) return undefined;
  const store = readJSON<Record<string, CacheEntry>>(KEYS.responseCache, {});
  const hit = store[url];
  if (!hit) return undefined;
  if (Date.now() - hit.at > PERSIST_TTL) return undefined;
  return hit;
}

function writePersisted(url: string, entry: CacheEntry): void {
  if (localSettings().persistCache === false) return;
  try {
    if (JSON.stringify(entry.data).length > PERSIST_MAX_CHARS) return;
    const store = readJSON<Record<string, CacheEntry>>(KEYS.responseCache, {});
    store[url] = entry;
    const fresh = Object.entries(store)
      .filter(([, value]) => Date.now() - value.at <= PERSIST_TTL)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, PERSIST_LIMIT);
    writeJSON(KEYS.responseCache, Object.fromEntries(fresh));
  } catch {
    /* sin espacio: seguimos en memoria */
  }
}

export function cacheInfo(): { count: number; kb: number } {
  const store = readJSON<Record<string, CacheEntry>>(KEYS.responseCache, {});
  const count = Object.keys(store).length;
  return { count, kb: Math.round(JSON.stringify(store).length / 1024) };
}

export function clearResponseCache(): number {
  cache.clear();
  const { count } = cacheInfo();
  writeJSON(KEYS.responseCache, {});
  return count;
}

export async function clearServiceWorkerCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(status === 404 ? 'No encontrado' : `Error ${status}`);
    this.status = status;
    this.name = 'HttpError';
    void url;
  }
}

export async function fetchJSON<T>(
  url: string,
  opts: { cache?: boolean; persist?: boolean } = {},
): Promise<T> {
  const useCache = opts.cache !== false;
  const persist = opts.persist !== false && useCache;

  if (useCache) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data as T;
  }

  const stored = persist ? readPersisted(url) : undefined;

  if (isOfflineMode()) {
    const fallback = stored || (useCache ? cache.get(url) : undefined);
    if (fallback) return fallback.data as T;
    throw new Error(
      'Modo solo-local: no hay datos guardados para esto. Desactívalo en Addons → Datos o conéctate para llenar la caché.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new HttpError(res.status, url);
    const data = (await res.json()) as T;
    const entry: CacheEntry = { at: Date.now(), data };
    if (useCache) cache.set(url, entry);
    if (persist) writePersisted(url, entry);
    return data;
  } catch (err) {
    // Sin red (o servidor caído): tiramos de la última copia guardada.
    if (stored) return stored.data as T;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('La conexión tardó demasiado. Revisa tu red e inténtalo de nuevo.');
    }
    if (err instanceof TypeError) {
      throw new Error('No se pudo conectar. Puede que el addon esté caído o bloquee CORS.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function clearApiCache(): void {
  cache.clear();
}

/* ------------------------------ imágenes ------------------------------ */

export function posterFor(meta: MetaPreview, size: 'small' | 'medium' | 'large' = 'medium'): string | undefined {
  if (meta.poster) return meta.poster;
  if (meta.id.startsWith('tt')) return `https://images.metahub.space/poster/${size}/${meta.id}/img`;
  return undefined;
}

export function backdropFor(meta: { id?: string; background?: string }): string | undefined {
  if (meta.background) return meta.background;
  if (meta.id?.startsWith('tt')) return `https://images.metahub.space/background/medium/${meta.id}/img`;
  return undefined;
}

export function logoFor(meta: { id: string; logo?: string }): string | undefined {
  if (meta.logo) return meta.logo;
  if (meta.id.startsWith('tt')) return `https://images.metahub.space/logo/medium/${meta.id}/img`;
  return undefined;
}

/* ------------------------------ streams ------------------------------ */

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
];

export function magnetFor(stream: Stream): string | null {
  if (stream.url?.startsWith('magnet:')) return stream.url;
  if (!stream.infoHash) return null;
  const name = stream.behaviorHints?.filename || stream.title || stream.description || 'video';
  const parts = [`dn=${encodeURIComponent(name.replace(/\n/g, ' '))}`];
  for (const tracker of TRACKERS) parts.push(`tr=${encodeURIComponent(tracker)}`);
  return `magnet:?xt=urn:btih:${stream.infoHash}&${parts.join('&')}`;
}

export function streamHref(stream: Stream): string | null {
  if (stream.externalUrl) return stream.externalUrl;
  if (stream.url) return stream.url;
  if (stream.ytId) return `https://www.youtube.com/watch?v=${stream.ytId}`;
  return magnetFor(stream);
}

export function streamQuality(stream: Stream): string | null {
  const text = `${stream.name || ''} ${stream.title || ''} ${
    stream.behaviorHints?.filename || ''
  }`.toLowerCase();
  if (/(^|[^0-9])(2160p|4k|uhd)([^0-9]|$)/.test(text)) return '4K';
  if (/1080p|fullhd|fhd/.test(text)) return '1080p';
  if (/720p/.test(text)) return '720p';
  if (/480p|360p/.test(text)) return 'SD';
  if (/cam\b|hdcam|\bts\b|telesync/.test(text)) return 'CAM';
  return null;
}

export function streamSeeders(stream: Stream): number | null {
  const text = `${stream.title || ''} ${stream.description || ''} ${stream.name || ''}`;
  const match =
    text.match(/👤\s*(\d+)/) ||
    text.match(/seeders?\s*[:=]?\s*(\d+)/i) ||
    text.match(/[🌱⚡]\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

export function streamAddonBadge(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${hash} 64% 62%)`;
}

/* ------------------------------ formato ------------------------------ */

export function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function cleanStreamTitle(title?: string): string {
  if (!title) return '';
  return title
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function plainText(text?: string): string {
  if (!text) return '';
  return text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

export function normalizeAddonUrl(input: string): string {
  let value = input.trim();
  if (!value) throw new Error('Escribe la URL del addon.');

  // Enlaces compartidos desde Stremio: stremio://host/manifest.json
  if (/^stremio:\/\//i.test(value)) {
    try {
      value = decodeURIComponent(value.replace(/^stremio:\/\//i, ''));
    } catch {
      value = value.replace(/^stremio:\/\//i, '');
    }
    value = value.replace(/^addon\//i, '');
  }

  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  value = value.replace(/\/manifest\.json\/?$/i, '');
  value = value.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Esa URL no es válida.');
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Solo se admiten enlaces http(s).');
  return value;
}

/** Acepta una lista pegada (una URL por línea, o separadas por comas/espacios). */
export function splitAddonUrls(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function validateManifest(manifest: unknown): Manifest {
  const m = manifest as Manifest;
  if (!m || typeof m !== 'object') throw new Error('El addon no devolvió un manifest válido.');
  if (!m.name || !m.version || !Array.isArray(m.resources)) {
    throw new Error('Manifest incompleto: faltan name, version o resources.');
  }
  if (!Array.isArray(m.catalogs)) m.catalogs = [];
  return m;
}

export function typeLabel(type: string): string {
  if (type === 'movie') return 'Película';
  if (type === 'series') return 'Serie';
  if (type === 'channel') return 'Canal';
  return 'Título';
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
