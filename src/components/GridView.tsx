import { useEffect, useState } from 'react';
import { catalogSupports, loadCatalog } from '../lib/addons';
import { useAsync } from '../lib/hooks';
import type { InstalledAddon, ManifestCatalog, MetaPreview } from '../lib/types';
import MetaGrid from './MetaGrid';
import { EmptyState, ErrorState, GridSkeleton, ScreenHeader } from './ui';

export default function GridView({
  addon,
  catalog,
  extra,
  title,
  subtitle,
  onBack,
  onOpenDetail,
}: {
  addon: InstalledAddon;
  catalog: ManifestCatalog;
  extra?: Record<string, string | number | undefined>;
  title: string;
  subtitle?: string;
  onBack: () => void;
  onOpenDetail: (meta: MetaPreview) => void;
}) {
  const canPaginate = catalogSupports(catalog, 'skip');
  const [items, setItems] = useState<MetaPreview[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => loadCatalog(addon, catalog, extra),
    [addon.transportUrl, catalog.type, catalog.id, JSON.stringify(extra)],
  );

  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await loadCatalog(addon, catalog, { ...extra, skip: items.length });
      const seen = new Set(items.map((item) => item.id));
      setItems((prev) => [...prev, ...next.filter((item) => !seen.has(item.id))]);
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : 'No se pudo cargar más');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="screen">
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />

      {loading ? <GridSkeleton count={12} /> : null}
      {error && !loading ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && !items.length ? (
        <EmptyState title="Nada por aquí" message="Este catálogo no devolvió resultados." />
      ) : null}

      {items.length ? <MetaGrid items={items} onOpen={onOpenDetail} showType /> : null}

      {canPaginate && items.length ? (
        <div className="load-more">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void loadMore()}
            disabled={loadingMore}
          >
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </button>
          {moreError ? <span className="muted small">{moreError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
