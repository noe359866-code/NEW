import { useState } from 'react';
import type { LibraryItem, MetaPreview } from '../lib/types';
import { BookmarkIcon } from './icons';
import MetaGrid from './MetaGrid';
import { EmptyState } from './ui';

export default function LibraryView({
  library,
  onOpenDetail,
  onRemove,
  onGoHome,
}: {
  library: LibraryItem[];
  onOpenDetail: (meta: MetaPreview) => void;
  onRemove: (meta: MetaPreview) => void;
  onGoHome: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="screen screen--tab">
      <div className="search-head library-head">
        <div>
          <h1>Mi lista</h1>
          <p className="muted small">
            {library.length
              ? `${library.length} ${library.length === 1 ? 'título guardado' : 'títulos guardados'}`
              : 'Guardado solo en este dispositivo'}
          </p>
        </div>
        {library.length ? (
          <button type="button" className="link-btn" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Listo' : 'Editar'}
          </button>
        ) : null}
      </div>

      {!library.length ? (
        <EmptyState
          icon={<BookmarkIcon width={26} height={26} />}
          title="Tu lista está vacía"
          message="Abre cualquier título y toca el marcador para verlo aquí después."
          action={{ label: 'Explorar', onClick: onGoHome }}
        />
      ) : (
        <MetaGrid
          items={library as MetaPreview[]}
          onOpen={onOpenDetail}
          showType
          onRemove={editing ? onRemove : undefined}
        />
      )}
    </div>
  );
}
