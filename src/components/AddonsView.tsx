import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'react';
import {
  cacheInfo,
  clearApiCache,
  clearResponseCache,
  clearServiceWorkerCache,
  normalizeAddonUrl,
  splitAddonUrls,
} from '../lib/api';
import { CINEMETA_URL, SUGGESTED_ADDONS, checkAddonsHealth, supportsResource } from '../lib/addons';
import type { AddonHealth } from '../lib/addons';
import type { AppSettings } from '../lib/settings';
import type { InstalledAddon } from '../lib/types';
import {
  CheckIcon,
  ExternalIcon,
  GlobeIcon,
  PlusIcon,
  PuzzleIcon,
  SparkIcon,
  TrashIcon,
  WarningIcon,
} from './icons';
import { EmptyState, Toggle } from './ui';

interface AddonsViewProps {
  addons: InstalledAddon[];
  settings: AppSettings;
  onSettings: (patch: Partial<AppSettings>) => void;
  onCinemetaUrl: (url: string) => void;
  onInstall: (url: string) => Promise<void>;
  onRemove: (url: string) => void;
  onToggle: (url: string, enabled: boolean) => void;
  onRefresh: () => Promise<void>;
  notify: (message: string, tone?: 'error' | 'ok') => void;
}

interface BulkResult {
  url: string;
  ok: boolean;
  message: string;
}

export default function AddonsView({
  addons,
  settings,
  onSettings,
  onCinemetaUrl,
  onInstall,
  onRemove,
  onToggle,
  onRefresh,
  notify,
}: AddonsViewProps) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkResult[] | null>(null);
  const [health, setHealth] = useState<Record<string, AddonHealth>>({});
  const [cinemeta, setCinemeta] = useState(settings.cinemetaUrl);
  const [cache, setCache] = useState(() => cacheInfo());

  useEffect(() => {
    setCinemeta(settings.cinemetaUrl);
  }, [settings.cinemetaUrl]);

  const wipeCache = async () => {
    const count = clearResponseCache();
    await clearServiceWorkerCache();
    setCache(cacheInfo());
    notify(count ? `${count} respuestas guardadas borradas` : 'No había datos guardados', 'ok');
  };

  const installedUrls = new Set(addons.map((addon) => addon.transportUrl));
  const enabledCount = addons.filter((addon) => addon.enabled).length;

  const installOne = async (rawUrl: string): Promise<BulkResult> => {
    try {
      const url = normalizeAddonUrl(rawUrl);
      if (installedUrls.has(url)) {
        return { url, ok: false, message: 'Ya estaba instalado' };
      }
      await onInstall(url);
      return { url, ok: true, message: 'Instalado' };
    } catch (err) {
      return {
        url: rawUrl,
        ok: false,
        message: err instanceof Error ? err.message : 'No se pudo instalar',
      };
    }
  };

  const install = async (rawInput: string, source: 'manual' | 'suggested') => {
    const urls = splitAddonUrls(rawInput);
    if (!urls.length) {
      setError('Escribe al menos una URL.');
      return;
    }
    setError(null);
    setBusy(true);
    setBulk(null);

    if (urls.length === 1 && source === 'suggested') {
      const [result] = [await installOne(urls[0])];
      setBusy(false);
      if (result.ok) notify('Addon añadido a tu lista', 'ok');
      else notify(result.message, 'error');
      return;
    }

    const results: BulkResult[] = [];
    for (const url of urls) {
      results.push(await installOne(url));
    }
    setBusy(false);

    if (results.length === 1) {
      const [result] = results;
      if (result.ok) {
        setInput('');
        notify('Addon instalado', 'ok');
      } else {
        setError(result.message);
        notify(result.message, 'error');
      }
      return;
    }

    setBulk(results);
    const okCount = results.filter((result) => result.ok).length;
    if (okCount) setInput('');
    notify(
      `${okCount} de ${results.length} addons instalados`,
      okCount ? 'ok' : 'error',
    );
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      clearApiCache();
      setHealth({});
      notify('Manifests actualizados', 'ok');
    } catch {
      notify('Algunos addons no respondieron', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const checkHealth = async () => {
    setChecking(true);
    try {
      const result = await checkAddonsHealth(addons);
      setHealth(result);
      const down = Object.values(result).filter((item) => item.status === 'error').length;
      if (down) notify(`${down} addon${down === 1 ? '' : 's'} sin respuesta`, 'error');
      else notify('Todos los addons responden', 'ok');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="screen screen--tab addons">
      <div className="search-head">
        <h1>Addons</h1>
        <p className="muted small">
          {enabledCount} de {addons.length} activos · protocolo Stremio
        </p>
      </div>

      <section className="addon-add">
        <label htmlFor="addon-url">Instalar addons</label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void install(input, 'manual');
          }}
        >
          <textarea
            id="addon-url"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={'https://…/manifest.json\nUna URL por línea'}
            rows={2}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="url"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void install(input, 'manual');
              }
            }}
          />
          <button type="submit" className="btn btn--light" disabled={busy || !input.trim()}>
            {busy ? 'Añadiendo…' : input.trim().split(/\s+/).filter(Boolean).length > 1 ? 'Instalar todo' : 'Instalar'}
          </button>
        </form>
        {error ? <p className="form-error">{error}</p> : null}
        <p className="hint">
          Acepta el manifest, la URL de configuración del addon y enlaces <code>stremio://</code>.
          Puedes pegar varias URLs a la vez (una por línea) para instalarlas todas.
        </p>
        {bulk ? (
          <ul className="bulk-results">
            {bulk.map((result) => (
              <li key={result.url} className={result.ok ? 'is-ok' : 'is-bad'}>
                {result.ok ? <CheckIcon width={13} height={13} /> : <WarningIcon width={13} height={13} />}
                <span className="bulk-url">{result.url.replace(/^https?:\/\//, '')}</span>
                <span className="bulk-msg">{result.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="addon-section">
        <div className="addon-section-head">
          <h2>Instalados</h2>
          <div className="section-actions">
            <button type="button" className="link-btn" onClick={() => void checkHealth()} disabled={checking}>
              {checking ? 'Comprobando…' : 'Salud'}
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>

        <ul className="addon-list">
          {addons.map((addon) => {
            const hasCatalog = (addon.manifest.catalogs || []).length > 0;
            const hasStream = supportsResource(addon.manifest, 'stream');
            const status = health[addon.transportUrl];
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
                  <p className="addon-desc">{addon.manifest.description || 'Sin descripción.'}</p>
                  <div className="addon-tags">
                    <span>v{addon.manifest.version}</span>
                    {hasCatalog ? <span>catálogos</span> : null}
                    {hasStream ? <span>streams</span> : null}
                    {addon.manifest.types?.length ? (
                      <span>{addon.manifest.types.slice(0, 3).join(' · ')}</span>
                    ) : null}
                    {status ? (
                      <span
                        className={`health-pill health-pill--${status.status}`}
                        title={status.error || `${status.ms} ms`}
                      >
                        <i className="health-dot" />
                        {status.status === 'error' ? 'caído' : `${status.ms} ms`}
                      </span>
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

      <section className="addon-section">
        <div className="addon-section-head">
          <h2>Datos y privacidad</h2>
        </div>
        <div className="panel">
          <div className="panel-row">
            <div className="panel-text">
              <div className="panel-title">Solo datos guardados</div>
              <p className="panel-desc">
                Evita las consultas a addons: solo verás catálogos y metadatos que
                ya estén en este dispositivo. Las imágenes y enlaces aún pueden usar la red.
              </p>
            </div>
            <Toggle
              checked={settings.offlineOnly}
              onChange={(value) => onSettings({ offlineOnly: value })}
              label="Modo solo datos guardados"
            />
          </div>

          <div className="panel-row">
            <div className="panel-text">
              <div className="panel-title">Caché local</div>
              <p className="panel-desc">
                {cache.count} respuestas · {cache.kb} KB · se guardan 7 días y sirven sin conexión.
              </p>
            </div>
            <button type="button" className="link-btn" onClick={() => void wipeCache()}>
              Borrar
            </button>
          </div>

          <div className="panel-row panel-row--stack">
            <div className="panel-text">
              <div className="panel-title">Servidor de Cinemeta</div>
              <p className="panel-desc">
                Público por defecto. Puedes usar tu propia instancia con una dirección pública.
              </p>
            </div>
            <form
              className="panel-form"
              onSubmit={(event) => {
                event.preventDefault();
                onCinemetaUrl(cinemeta);
              }}
            >
              <input
                value={cinemeta}
                onChange={(event) => setCinemeta(event.target.value)}
                placeholder={CINEMETA_URL}
                inputMode="url"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="btn btn--ghost btn--mini">
                Aplicar
              </button>
            </form>
          </div>

          <p className="hint">
            {Capacitor.isNativePlatform()
              ? 'En Android, la app consulta los addons directamente con HTTP nativo, sin depender de CORS. Evita instalar addons o enlaces de origen desconocido.'
              : 'El servidor interno consulta los addons por ti, incluso si no permiten CORS. Por seguridad, solo acepta direcciones públicas.'}
            {' '}Las imágenes y fuentes siguen cargándose desde sus proveedores.
          </p>
        </div>
      </section>

      <section className="addon-section addon-section--about">
        <h2>Acerca de</h2>
        <p className="muted small">
          Nébula es un cliente móvil del protocolo de addons de Stremio con estética inspirada en
          Apple TV. No incluye contenido propio: todo proviene de los addons que activas.
        </p>
        <p className="muted small">Hecho con cariño para tu bolsillo · v1.2.0</p>
      </section>
    </div>
  );
}
