import { useMemo, useState } from 'react';
import {
  cleanStreamTitle,
  formatBytes,
  magnetFor,
  streamAddonBadge,
  streamHref,
  streamQuality,
  streamSeeders,
} from '../lib/api';
import { loadStreams } from '../lib/addons';
import { useAsync } from '../lib/hooks';
import type { InstalledAddon, TaggedStream } from '../lib/types';
import {
  CopyIcon,
  ExternalIcon,
  FilmIcon,
  SearchIcon,
  WarningIcon,
} from './icons';
import { EmptyState, ErrorState, ScreenHeader, Spinner } from './ui';

interface StreamsProps {
  addons: InstalledAddon[];
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
  onOpenAddons: () => void;
  notify: (message: string, tone?: 'error' | 'ok') => void;
}

const QUALITY_ORDER: Record<string, number> = { '4K': 5, '1080p': 4, '720p': 3, SD: 2, CAM: 1 };

export default function Streams({
  addons,
  type,
  id,
  title,
  subtitle,
  onBack,
  onOpenAddons,
  notify,
}: StreamsProps) {
  const { data, error, loading, reload } = useAsync(
    () => loadStreams(addons, type, id),
    [addons, type, id],
  );
  const [filter, setFilter] = useState<'all' | '4K' | '1080p' | '720p'>('all');

  const streamAddons = addons.filter((addon) => addon.enabled).length;

  const streams = useMemo(() => {
    const list = [...(data || [])];
    list.sort((a, b) => {
      const qa = QUALITY_ORDER[streamQuality(a) || ''] || 0;
      const qb = QUALITY_ORDER[streamQuality(b) || ''] || 0;
      if (qa !== qb) return qb - qa;
      return (streamSeeders(b) || 0) - (streamSeeders(a) || 0);
    });
    return list;
  }, [data]);

  const visible = streams.filter((stream) => {
    if (filter === 'all') return true;
    return streamQuality(stream) === filter;
  });

  const copy = async (value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      notify('Enlace copiado', 'ok');
    } catch {
      notify('No se pudo copiar al portapapeles', 'error');
    }
  };

  const openStream = (stream: TaggedStream) => {
    const href = streamHref(stream);
    if (!href) {
      notify('Esta fuente no tiene enlace reproducible', 'error');
      return;
    }
    if (href.startsWith('magnet:')) {
      void copy(href);
      notify('Magnet copiado: ábrelo en tu cliente Torrent', 'ok');
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="screen">
      <ScreenHeader title={title} subtitle={subtitle || 'Fuentes disponibles'} onBack={onBack} />

      <div className="streams-toolbar">
        <span className="muted small">
          {streams.length
            ? `${streams.length} ${streams.length === 1 ? 'fuente' : 'fuentes'} en ${streamAddons} addons`
            : 'Buscando fuentes…'}
        </span>
        {streams.length > 0 ? (
          <div className="rail rail--chips rail--inline">
            {['all', '4K', '1080p', '720p'].map((key) => (
              <button
                type="button"
                key={key}
                className={`chip chip--sm ${filter === key ? 'chip--active' : ''}`}
                onClick={() => setFilter(key as typeof filter)}
              >
                {key === 'all' ? 'Todas' : key}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? <Spinner label="Consultando addons…" /> : null}

      {error && !loading ? (
        <ErrorState message={error} onRetry={reload} />
      ) : null}

      {!loading && !error && !streams.length ? (
        <EmptyState
          icon={<SearchIcon width={26} height={26} />}
          title="Sin fuentes para este título"
          message="Cinemeta solo aporta metadatos. Instala un addon de streaming (por ejemplo Torrentio) y vuelve a intentarlo."
          action={{ label: 'Instalar addon', onClick: onOpenAddons }}
        />
      ) : null}

      <div className="stream-list">
        {visible.map((stream, index) => {
          const quality = streamQuality(stream);
          const seeders = streamSeeders(stream);
          const filename = stream.behaviorHints?.filename;
          const size = formatBytes(stream.behaviorHints?.videoSize);
          const details = cleanStreamTitle(stream.title || filename || stream.description);
          return (
            <div className="stream-row" key={`${stream.addonUrl}-${index}`}>
              <button type="button" className="stream-main" onClick={() => openStream(stream)}>
                <span className={`quality ${quality ? `quality--${quality.toLowerCase()}` : ''}`}>
                  {quality || 'HD'}
                </span>
                <span className="stream-body">
                  <span className="stream-head">
                    <span
                      className="addon-pill"
                      style={{ color: streamAddonBadge(stream.addonName) }}
                    >
                      {stream.addonName}
                    </span>
                    {seeders != null ? (
                      <span className="seeders">👤 {seeders}</span>
                    ) : null}
                    {size ? <span className="size">{size}</span> : null}
                    {stream.behaviorHints?.notWebReady ? (
                      <span className="warn" title="Requiere cliente externo">
                        <WarningIcon width={12} height={12} /> externo
                      </span>
                    ) : null}
                  </span>
                  <span className="stream-title">{details || 'Fuente sin descripción'}</span>
                  {stream.description ? (
                    <span className="stream-sub">{cleanStreamTitle(stream.description)}</span>
                  ) : null}
                </span>
                <ExternalIcon width={16} height={16} className="stream-go" />
              </button>
              <div className="stream-tools">
                {magnetFor(stream) ? (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    onClick={() => void copy(magnetFor(stream))}
                    aria-label="Copiar magnet"
                  >
                    <CopyIcon width={15} height={15} />
                  </button>
                ) : null}
                {stream.url?.startsWith('http') ? (
                  <button
                    type="button"
                    className="icon-btn icon-btn--sm"
                    onClick={() => void copy(stream.url || null)}
                    aria-label="Copiar enlace"
                  >
                    <FilmIcon width={15} height={15} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {streams.length > 0 ? (
        <p className="stream-footnote">
          Nébula no aloja ni distribuye contenido. Respeta las leyes de tu país y usa servicios
          legales cuando corresponda.
        </p>
      ) : null}
    </div>
  );
}
