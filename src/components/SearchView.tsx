import { useEffect, useMemo, useState } from 'react';
import { searchAll, searchableCatalogs } from '../lib/addons';
import { useAsync } from '../lib/hooks';
import { useStoredState } from '../lib/hooks';
import { KEYS } from '../lib/storage';
import type { InstalledAddon, MetaPreview } from '../lib/types';
import { CloseIcon, SearchIcon, SparkIcon } from './icons';
import MetaGrid from './MetaGrid';
import { Chip, EmptyState, ErrorState, GridSkeleton } from './ui';

export default function SearchView({
  addons,
  onOpenDetail,
  notify,
}: {
  addons: InstalledAddon[];
  onOpenDetail: (meta: MetaPreview) => void;
  notify: (message: string, tone?: 'error' | 'ok') => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [recent, setRecent] = useStoredState<string[]>(KEYS.recent, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 450);
    return () => clearTimeout(timer);
  }, [query]);

  const catalogs = useMemo(() => searchableCatalogs(addons), [addons]);
  const { data, error, loading, reload } = useAsync(
    async () => (debounced.length >= 2 ? searchAll(addons, debounced) : []),
    [addons, debounced],
  );

  const commit = (value: string) => {
    const clean = value.trim();
    if (clean.length < 2) {
      notify('Escribe al menos 2 letras', 'error');
      return;
    }
    setQuery(clean);
    setDebounced(clean);
    setRecent((prev) => [clean, ...prev.filter((item) => item !== clean)].slice(0, 8));
  };

  return (
    <div className="screen screen--tab search">
      <div className="search-head">
        <h1>Buscar</h1>
        <p className="muted small">
          {catalogs.length} {catalogs.length === 1 ? 'catálogo' : 'catálogos'} con búsqueda activa
        </p>
      </div>

      <form
        className="search-field"
        onSubmit={(event) => {
          event.preventDefault();
          commit(query);
        }}
      >
        <SearchIcon width={17} height={17} className="search-field-icon" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Películas, series, personas…"
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="search"
          spellCheck={false}
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            onClick={() => {
              setQuery('');
              setDebounced('');
            }}
            aria-label="Limpiar"
          >
            <CloseIcon width={14} height={14} />
          </button>
        ) : null}
      </form>

      {!debounced && recent.length ? (
        <div className="search-recent">
          <span className="muted small">Recientes</span>
          <div className="rail rail--chips">
            {recent.map((item) => (
              <Chip key={item} onClick={() => commit(item)}>
                {item}
              </Chip>
            ))}
          </div>
          <button type="button" className="link-btn" onClick={() => setRecent([])}>
            Borrar historial
          </button>
        </div>
      ) : null}

      {loading ? <GridSkeleton count={9} /> : null}

      {!loading && error ? <ErrorState message={error} onRetry={reload} /> : null}

      {!loading && !error && debounced.length >= 2 && !data?.length ? (
        <EmptyState
          icon={<SearchIcon width={24} height={24} />}
          title={`Sin resultados para “${debounced}”`}
          message="Prueba con el título original en inglés o añade más addons con catálogos."
        />
      ) : null}

      {!debounced ? (
        <div className="search-hints">
          <EmptyState
            icon={<SparkIcon width={24} height={24} />}
            title="Busca en todos tus addons a la vez"
            message="Cinemeta responde con resultados de IMDb. Si añades catálogos de terceros, también aparecerán aquí."
          />
        </div>
      ) : null}

      {data?.length ? (
        <>
          <div className="search-count muted small">
            {data.length} resultados
          </div>
          <MetaGrid items={data} onOpen={onOpenDetail} showType />
        </>
      ) : null}
    </div>
  );
}
