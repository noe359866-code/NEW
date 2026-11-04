import { fetchJSON, normalizeAddonUrl, validateManifest } from './api';
import type {
  CatalogResult,
  InstalledAddon,
  Manifest,
  ManifestCatalog,
  MediaType,
  MetaDetail,
  MetaPreview,
  ShelfConfig,
  Stream,
  TaggedStream,
} from './types';

export const CINEMETA_URL = 'https://v3-cinemeta.strem.io';

export interface GenreOption {
  label: string;
  value: string;
}

/** Cinemeta usa los géneros de IMDb en inglés; mostramos la etiqueta en español. */
export const GENRES: GenreOption[] = [
  { label: 'Acción', value: 'Action' },
  { label: 'Aventura', value: 'Adventure' },
  { label: 'Animación', value: 'Animation' },
  { label: 'Biografía', value: 'Biography' },
  { label: 'Comedia', value: 'Comedy' },
  { label: 'Crimen', value: 'Crime' },
  { label: 'Documental', value: 'Documentary' },
  { label: 'Drama', value: 'Drama' },
  { label: 'Familia', value: 'Family' },
  { label: 'Fantasía', value: 'Fantasy' },
  { label: 'Historia', value: 'History' },
  { label: 'Terror', value: 'Horror' },
  { label: 'Música', value: 'Music' },
  { label: 'Misterio', value: 'Mystery' },
  { label: 'Romance', value: 'Romance' },
  { label: 'Sci-Fi', value: 'Sci-Fi' },
  { label: 'Suspense', value: 'Thriller' },
  { label: 'Guerra', value: 'War' },
  { label: 'Western', value: 'Western' },
];

const GENRE_LABELS = new Map(GENRES.map((genre) => [genre.value.toLowerCase(), genre.label]));

export function genreLabel(value: string): string {
  return GENRE_LABELS.get(value.toLowerCase()) || value;
}

/** Manifest de Cinemeta incluido en la app para arrancar sin red. */
export const CINEMETA_MANIFEST: Manifest = {
  id: 'com.linvo.cinemeta',
  version: '3.0.14',
  name: 'Cinemeta',
  description: 'Catálogo oficial de Stremio con metadatos de IMDb: populares, por género y búsqueda.',
  logo: 'https://www.stremio.com/website/stremio-logo-small.png',
  types: ['movie', 'series'],
  resources: ['catalog', 'meta'],
  catalogs: [
    {
      type: 'movie',
      id: 'top',
      name: 'Películas populares',
      extra: [
        { name: 'genre', options: GENRES.map((genre) => genre.value) },
        { name: 'search' },
        { name: 'skip' },
      ],
      extraSupported: ['genre', 'search', 'skip'],
    },
    {
      type: 'series',
      id: 'top',
      name: 'Series populares',
      extra: [
        { name: 'genre', options: GENRES.map((genre) => genre.value) },
        { name: 'search' },
        { name: 'skip' },
      ],
      extraSupported: ['genre', 'search', 'skip'],
    },
  ],
  behaviorHints: { adult: false },
};

export function builtinAddon(): InstalledAddon {
  return {
    transportUrl: CINEMETA_URL,
    manifest: CINEMETA_MANIFEST,
    enabled: true,
    addedAt: 0,
    builtin: true,
  };
}

export function ensureBuiltin(addons: InstalledAddon[]): InstalledAddon[] {
  const rest = addons.filter((a) => a.transportUrl !== CINEMETA_URL);
  const existing = addons.find((a) => a.transportUrl === CINEMETA_URL);
  return [
    {
      ...builtinAddon(),
      ...existing,
      builtin: true,
      enabled: existing ? existing.enabled : true,
    },
    ...rest,
  ];
}

/* ------------------------------ protocolo ------------------------------ */

function resourceEntry(manifest: Manifest, name: string) {
  return manifest.resources.find((res) => (typeof res === 'string' ? res : res.name) === name);
}

export function supportsResource(
  manifest: Manifest,
  name: string,
  type?: string,
  id?: string,
): boolean {
  const entry = resourceEntry(manifest, name);
  if (!entry) return false;
  if (typeof entry === 'string') return true;
  if (type && entry.types && !entry.types.includes(type)) return false;
  if (id && entry.idPrefixes && !entry.idPrefixes.some((prefix) => id.startsWith(prefix)))
    return false;
  return true;
}

function extraPath(extra?: Record<string, string | number | undefined>): string {
  if (!extra) return '';
  const pairs = Object.entries(extra)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return pairs.length ? `/${pairs.join('&')}` : '';
}

export function catalogUrl(
  addon: InstalledAddon,
  catalog: ManifestCatalog,
  extra?: Record<string, string | number | undefined>,
): string {
  return `${addon.transportUrl}/catalog/${encodeURIComponent(catalog.type)}/${encodeURIComponent(
    catalog.id,
  )}${extraPath(extra)}.json`;
}

export async function loadCatalog(
  addon: InstalledAddon,
  catalog: ManifestCatalog,
  extra?: Record<string, string | number | undefined>,
): Promise<MetaPreview[]> {
  const data = await fetchJSON<CatalogResult>(catalogUrl(addon, catalog, extra));
  const metas = Array.isArray(data?.metas) ? data.metas : [];
  return metas
    .filter((meta) => meta && meta.id && meta.name)
    .map((meta) => ({ ...meta, type: meta.type || catalog.type }));
}

export function catalogSupports(catalog: ManifestCatalog, prop: string): boolean {
  if (catalog.extra?.some((item) => item.name === prop)) return true;
  if (catalog.extraSupported?.includes(prop)) return true;
  return false;
}

export function needsUnknownExtra(catalog: ManifestCatalog): boolean {
  const required = catalog.extraRequired?.filter((name) => name !== 'skip') || [];
  if (required.length) return true;
  return Boolean(catalog.extra?.some((item) => item.isRequired && item.name !== 'skip'));
}

export function shelvesFor(addons: InstalledAddon[], limit = 10): ShelfConfig[] {
  const shelves: ShelfConfig[] = [];
  for (const addon of addons) {
    if (!addon.enabled) continue;
    for (const catalog of addon.manifest.catalogs || []) {
      if (catalog.type !== 'movie' && catalog.type !== 'series') continue;
      if (needsUnknownExtra(catalog)) continue;
      const hasGenre = catalogSupports(catalog, 'genre');
      const searchOnly = catalogSupports(catalog, 'search') && !hasGenre;
      if (searchOnly) continue;
      shelves.push({
        key: `${addon.transportUrl}|${catalog.type}|${catalog.id}`,
        addon,
        catalog,
        title: catalog.name || (catalog.type === 'movie' ? 'Películas' : 'Series'),
        subtitle: addon.builtin ? undefined : addon.manifest.name,
      });
    }
  }
  shelves.sort((a, b) => {
    if (a.addon.builtin !== b.addon.builtin) return a.addon.builtin ? -1 : 1;
    if (a.catalog.type !== b.catalog.type) return a.catalog.type === 'movie' ? -1 : 1;
    return 0;
  });
  return shelves.slice(0, limit);
}

export async function loadMeta(
  addons: InstalledAddon[],
  type: MediaType,
  id: string,
): Promise<MetaDetail> {
  const candidates = addons.filter(
    (addon) => addon.enabled && supportsResource(addon.manifest, 'meta', type, id),
  );
  let lastError: Error | null = null;
  for (const addon of candidates) {
    try {
      const data = await fetchJSON<{ meta?: MetaDetail }>(
        `${addon.transportUrl}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`,
      );
      if (data?.meta && data.meta.name) {
        return { ...data.meta, type: data.meta.type || type, id: data.meta.id || id };
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new Error('Ningún addon tiene metadatos para este título.');
}

export async function loadStreams(
  addons: InstalledAddon[],
  type: MediaType,
  id: string,
): Promise<TaggedStream[]> {
  const candidates = addons.filter(
    (addon) => addon.enabled && supportsResource(addon.manifest, 'stream', type, id),
  );
  const results = await Promise.allSettled(
    candidates.map(async (addon) => {
      const data = await fetchJSON<{ streams?: Stream[] }>(
        `${addon.transportUrl}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`,
         { cache: false },
      );
      const streams = Array.isArray(data?.streams) ? data.streams : [];
      return streams
        .filter((stream) => stream && (stream.url || stream.infoHash || stream.externalUrl || stream.ytId))
        .map<TaggedStream>((stream) => ({
          ...stream,
          addonName: stream.name?.split('\n')[0].trim() || addon.manifest.name,
          addonUrl: addon.transportUrl,
        }));
    }),
  );

  const merged: TaggedStream[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') merged.push(...result.value);
  }
  return merged;
}

export function searchableCatalogs(addons: InstalledAddon[]): Array<{
  addon: InstalledAddon;
  catalog: ManifestCatalog;
}> {
  const out: Array<{ addon: InstalledAddon; catalog: ManifestCatalog }> = [];
  for (const addon of addons) {
    if (!addon.enabled) continue;
    for (const catalog of addon.manifest.catalogs || []) {
      if (!catalogSupports(catalog, 'search')) continue;
      out.push({ addon, catalog });
    }
  }
  return out;
}

export async function searchAll(
  addons: InstalledAddon[],
  query: string,
): Promise<MetaPreview[]> {
  const targets = searchableCatalogs(addons);
  const results = await Promise.allSettled(
    targets.map(({ addon, catalog }) => loadCatalog(addon, catalog, { search: query })),
  );
  const seen = new Set<string>();
  const merged: MetaPreview[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const meta of result.value) {
      const key = `${meta.type}:${meta.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(meta);
    }
  }
  merged.sort((a, b) => {
    const ra = Number(a.imdbRating || 0);
    const rb = Number(b.imdbRating || 0);
    return rb - ra;
  });
  return merged;
}

export async function fetchManifest(url: string): Promise<InstalledAddon> {
  const transportUrl = normalizeAddonUrl(url);
  const manifest = validateManifest(await fetchJSON<unknown>(`${transportUrl}/manifest.json`, { cache: false }));
  if (manifest.behaviorHints?.configurationRequired) {
    throw new Error('Este addon necesita configuración previa en su web.');
  }
  return { transportUrl, manifest, enabled: true, addedAt: Date.now() };
}

export interface AddonHealth {
  status: 'ok' | 'slow' | 'error';
  ms: number;
  checkedAt: number;
  error?: string;
}

/** Mide la latencia real del manifest y clasifica el estado del addon. */
export async function pingAddon(transportUrl: string): Promise<AddonHealth> {
  const started = performance.now();
  try {
    const manifest = validateManifest(
      await fetchJSON<unknown>(`${transportUrl}/manifest.json`, { cache: false }),
    );
    const ms = Math.round(performance.now() - started);
    if (!manifest.name) throw new Error('Manifest inválido');
    return { status: ms > 2200 ? 'slow' : 'ok', ms, checkedAt: Date.now() };
  } catch (err) {
    return {
      status: 'error',
      ms: Math.round(performance.now() - started),
      checkedAt: Date.now(),
      error: err instanceof Error ? err.message : 'Sin respuesta',
    };
  }
}

export async function checkAddonsHealth(
  addons: InstalledAddon[],
): Promise<Record<string, AddonHealth>> {
  const entries = await Promise.all(
    addons.map(async (addon) => [addon.transportUrl, await pingAddon(addon.transportUrl)] as const),
  );
  return Object.fromEntries(entries);
}

export interface SuggestedAddon {
  name: string;
  description: string;
  url: string;
  tag: string;
}

export const SUGGESTED_ADDONS: SuggestedAddon[] = [
  {
    name: 'Torrentio',
    description: 'Fuentes P2P de alta calidad (4K, 1080p) con muchos seeders.',
    url: 'https://torrentio.strem.fun/manifest.json',
    tag: 'Streams · P2P',
  },
  {
    name: 'OpenSubtitles v3',
    description: 'Subtítulos en decenas de idiomas para películas y series.',
    url: 'https://opensubtitles-v3.strem.io/manifest.json',
    tag: 'Subtítulos',
  },
  {
    name: 'WatchHub',
    description: 'Enlaces legales a plataformas de streaming y alquiler.',
    url: 'https://watchhub.strem.io/manifest.json',
    tag: 'Streams · Legal',
  },
  {
    name: 'Cinemeta',
    description: 'Metadatos y catálogos de IMDb. Ya viene activado en Nébula.',
    url: 'https://v3-cinemeta.strem.io/manifest.json',
    tag: 'Metadatos · Integrado',
  },
];

export type { ShelfConfig } from './types';
