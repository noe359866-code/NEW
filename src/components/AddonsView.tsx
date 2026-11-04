import { useState } from 'react';
import { clearApiCache, normalizeAddonUrl } from '../lib/api';
import { SUGGESTED_ADDONS, supportsResource } from '../lib/addons';
import type { InstalledAddon } from '../lib/types';
import {
  CheckIcon,
  ExternalIcon,
  GlobeIcon,
  PlusIcon,
  PuzzleIcon,
  SparkIcon,
  TrashIcon,
} from './icons';
import { EmptyState, Toggle } from './ui';

interface AddonsViewProps {
  addons: InstalledAddon[];
  onInstall: (url: string) => Promise<void>;
  onRemove: (url: string) => void;
  onToggle: (url: string, enabled: boolean) => void;
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'error' | 'ok') => void;
}

export default function AddonsView({
  addons,
  onInstall,
  onRemove,
  onToggle,
  onRefresh,
  notify,
}: AddonsViewProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const installedUrls = new Set(addons.map((addon) => addon.transportUrl));

  const install = async (rawUrl: string, source: 'manual' | 'suggested') => {
    setError(null);
    setBusy(true);
    try {
      const url = normalizeAddonUrl(rawUrl);
      if (installedUrls.has(url)) {
        notify('Ese addon ya está instalado', 'error');
        return;
      }
      await onInstall(url);
      setInput('');
      notify(source === 'manual' ? 'Addon instalado' : 'Addon añadido a tu lista', 'ok');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo instalar el addon';
      setError(message);
      if (source === 'manual') notify(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      clearApiCache();
      notify('Manifests actualizados', 'ok');
    } catch {
      notify('Algunos addons no respondieron', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const enabledCount = addons.filter((addon) => addon.enabled).length;

  return (
    <div className="screen screen--tab addons">
      <div className="search-head">
        <h1>Addons</h1>
        <p className="muted small">
          {enabledCount} de {addons.length} activos · protocolo Stremio
        </p>
      </div>

      <section className="addon-add">
        <label htmlFor="addon-url">Instalar desde URL</label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void install(input, 'manual');
          }}
        >
          <input
            id="addon-url"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="https://…/manifest.json"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="url"
          />
          <button type="submit" className="btn btn--light" disabled={busy || !input.trim()}>
            {busy ? 'Añadiendo…' : 'Instalar'}
          </button>
        </form>
        {error ? <p className="form-error">{error}</p> : null}
        <p className="hint">
          Pega el enlace del manifest o la URL de configuración del addon. También puedes abrir
          Nébula con <code>?addon=URL</code>.
        </p>
      </section>

      <section className="addon-section">
        <div className="addon-section-head">
          <h2>Instalados</h2>
          <button
            type="button"
            className="link-btn"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        <ul className="addon-list">
          {addons.map((addon) => {
            const hasCatalog = (addon.manifest.catalogs || []).length > 0;
            const hasStream = supportsResource(addon.manifest, 'stream');
            return (
              <li key={addon.transportUrl} className={`addon-row ${addon.enabled ? '' : 'is-off'}`}>
                <div className="addon-badge">
                  {addon.builtin ? (
                    <SparkIcon width={18} height={18} />
                  ) : (
                    <PuzzleIcon width={18} height={18} />
                  )}
                </div>
                <div className="addon-info">
                  <div className="addon-name">
                    {addon.manifest.name}
                    {addon.builtin ? <span className="tag">Integrado</span> : null}
                  </div>
                  <p className="addon-desc">
                    {addon.manifest.description || 'Sin descripción.'}
                  </p>
                  <div className="addon-tags">
                    <span>v{addon.manifest.version}</span>
                    {hasCatalog ? <span>catálogos</span> : null}
                    {hasStream ? <span>streams</span> : null}
                    {addon.manifest.types?.length ? (
                      <span>{addon.manifest.types.slice(0, 3).join(' · ')}</span>
                    ) : null}
                  </div>
                  <div className="addon-links">
                    <a
                      href={addon.transportUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="addon-link"
                    >
                      <GlobeIcon width={12} height={12} /> Sitio
                    </a>
                    <a
                      href={`${addon.transportUrl}/manifest.json`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="addon-link"
                    >
                      <ExternalIcon width={12} height={12} /> Manifest
                    </a>
                  </div>
                </div>
                <div className="addon-controls">
                  <Toggle
                    checked={addon.enabled}
                    onChange={(value) => onToggle(addon.transportUrl, value)}
                    label={`Activar ${addon.manifest.name}`}
                  />
                  {!addon.builtin ? (
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      onClick={() => {
                        onRemove(addon.transportUrl);
                        notify('Addon eliminado', 'ok');
                      }}
                      aria-label={`Eliminar ${addon.manifest.name}`}
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {!addons.length ? (
          <EmptyState
            icon={<PuzzleIcon width={24} height={24} />}
            title="No hay addons"
            message="Instala alguno de los sugeridos para empezar."
          />
        ) : null}
      </section>

      <section className="addon-section">
        <div className="addon-section-head">
          <h2>Sugeridos</h2>
          <span className="muted small">Se instalan con un toque</span>
        </div>
        <ul className="suggestion-list">
          {SUGGESTED_ADDONS.map((suggestion) => {
            const url = suggestion.url.replace(/\/manifest\.json$/, '');
            const installed = installedUrls.has(url);
            return (
              <li key={suggestion.name} className="suggestion">
                <div className="suggestion-head">
                  <div>
                    <div className="addon-name">{suggestion.name}</div>
                    <span className="tag tag--ghost">{suggestion.tag}</span>
                  </div>
                  <button
                    type="button"
                    className={`btn btn--mini ${installed ? 'btn--ghost' : 'btn--light'}`}
                    disabled={installed || busy}
                    onClick={() => void install(url, 'suggested')}
                  >
                    {installed ? (
                      <>
                        <CheckIcon width={14} height={14} /> Instalado
                      </>
                    ) : (
                      <>
                        <PlusIcon width={14} height={14} /> Instalar
                      </>
                    )}
                  </button>
                </div>
                <p>{suggestion.description}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="addon-section addon-section--about">
        <h2>Acerca de</h2>
        <p className="muted small">
          Nébula es un cliente móvil del protocolo de addons de Stremio con estética inspirada en
          Apple TV. No incluye contenido propio: todo proviene de los addons que activas.
        </p>
        <p className="muted small">Hecho con cariño para tu bolsillo · v1.0.0</p>
      </section>
    </div>
  );
}
