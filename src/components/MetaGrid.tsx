import { typeLabel } from '../lib/api';
import type { MetaPreview } from '../lib/types';
import { Poster } from './ui';

export default function MetaGrid({
  items,
  onOpen,
  showType,
  onRemove,
}: {
  items: MetaPreview[];
  onOpen: (meta: MetaPreview) => void;
  showType?: boolean;
  onRemove?: (meta: MetaPreview) => void;
}) {
  return (
    <div className="grid">
      {items.map((meta, index) => (
        <div className="grid-cell" key={`${meta.type}:${meta.id}:${index}`}>
          <button type="button" className="card card--grid" onClick={() => onOpen(meta)}>
            <Poster meta={meta} />
            <span className="card-title">{meta.name}</span>
            <span className="card-sub">
              {[
                meta.releaseInfo,
                showType ? typeLabel(meta.type) : null,
                meta.imdbRating ? `★ ${meta.imdbRating}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
          {onRemove ? (
            <button
              type="button"
              className="grid-remove"
              onClick={() => onRemove(meta)}
              aria-label={`Quitar ${meta.name}`}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
