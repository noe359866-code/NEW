import type { Manifest, MetaPreview, Stream } from './types';

const TIMEOUT_MS = 14000;
const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_TTL = 1000 * 60 * 10;

export class HttpError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(status === 404 ? 'No encontrado' : `Error ${status}`);
    this.status = status;
    this.name = 'HttpError';
    void url;
  }
}

export async function fetchJSON<T>(url: string, opts: { cache?: boolean } = {}): Promise<T> {
  const useCache = opts.cache !== false;
  if (useCache) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data as T;
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
    if (useCache) cache.set(url, { at: Date.now(), data });
    return data;
  } catch (err) {
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
