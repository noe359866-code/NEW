export type MediaType = 'movie' | 'series' | string;

export interface ExtraProp {
  name: string;
  options?: string[];
  isRequired?: boolean;
}

export interface ManifestCatalog {
  type: string;
  id: string;
  name?: string;
  extra?: ExtraProp[];
  extraSupported?: string[];
  extraRequired?: string[];
  genres?: string[];
}

export interface ManifestResource {
  name: string;
  types?: string[];
  idPrefixes?: string[];
}

export interface Manifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  logo?: string;
  background?: string;
  types: string[];
  resources: Array<string | ManifestResource>;
  catalogs: ManifestCatalog[];
  behaviorHints?: {
    adult?: boolean;
    p2p?: boolean;
    configurable?: boolean;
    configurationRequired?: boolean;
  };
}

export interface InstalledAddon {
  /** URL base, sin /manifest.json */
  transportUrl: string;
  manifest: Manifest;
  enabled: boolean;
  addedAt: number;
  builtin?: boolean;
}

export interface MetaPreview {
  id: string;
  type: string;
  name: string;
  poster?: string;
  posterShape?: 'poster' | 'square' | 'landscape' | string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genres?: string[];
  runtime?: string;
}

export interface Video {
  id: string;
  title?: string;
  name?: string;
  season?: number;
  episode?: number;
  number?: number;
  released?: string;
  thumbnail?: string;
  overview?: string;
  rating?: string;
}

export interface MetaDetail extends MetaPreview {
  cast?: string[];
  director?: string[];
  writer?: string[];
  country?: string;
  awards?: string;
  videos?: Video[];
  trailerStreams?: { title?: string; ytId: string }[];
  trailers?: { source: string; type: string }[];
  imdb_id?: string;
  slug?: string;
  website?: string;
}

export interface StreamBehaviorHints {
  bingeGroup?: string;
  filename?: string;
  videoHash?: string;
  videoSize?: number;
  notWebReady?: boolean;
  [key: string]: unknown;
}

export interface Stream {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  ytId?: string;
  infoHash?: string;
  fileIdx?: number;
  externalUrl?: string;
  behaviorHints?: StreamBehaviorHints;
}

export interface TaggedStream extends Stream {
  addonName: string;
  addonUrl: string;
}

export interface LibraryItem {
  id: string;
  type: string;
  name: string;
  poster?: string;
  logo?: string;
  addedAt: number;
}

export interface RecentItem extends LibraryItem {
  hint?: string;
  openedAt: number;
}

export interface CatalogResult {
  metas: MetaPreview[];
  cacheMaxAge?: number;
}

export interface SearchGroup {
  addon: string;
  catalog: string;
  items: MetaPreview[];
}

export interface ShelfConfig {
  key: string;
  addon: InstalledAddon;
  catalog: ManifestCatalog;
  title: string;
  subtitle?: string;
  extra?: Record<string, string | number | undefined>;
}
