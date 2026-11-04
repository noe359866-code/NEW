import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AddonsView from './components/AddonsView';
import Detail from './components/Detail';
import GridView from './components/GridView';
import Home from './components/Home';
import LibraryView from './components/LibraryView';
import SearchView from './components/SearchView';
import Streams from './components/Streams';
import {
  BookmarkIcon,
  HomeIcon,
  PuzzleIcon,
  SearchIcon,
  SparkIcon,
} from './components/icons';
import { Toast } from './components/ui';
import { CINEMETA_URL, ensureBuiltin, fetchManifest, type ShelfConfig } from './lib/addons';
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from './lib/settings';
import { useStoredState } from './lib/hooks';
import { KEYS, readJSON } from './lib/storage';
import { normalizeAddonUrl, typeLabel } from './lib/api';
import type {
  InstalledAddon,
  LibraryItem,
  ManifestCatalog,
  MetaPreview,
  RecentItem,
} from './lib/types';

type Tab = 'home' | 'search' | 'library' | 'addons';

type Route =
  | { name: 'detail'; preview: MetaPreview }
  | { name: 'streams'; type: string; id: string; title: string; subtitle?: string }
  | {
      name: 'grid';
      addonUrl: string;
      catalog: ManifestCatalog;
      extra?: Record<string, string | number | undefined>;
      title: string;
      subtitle?: string;
    };

interface ToastState {
  id: number;
  message: string;
  tone?: 'error' | 'ok';
}

const TABS: Array<{ id: Tab; label: string; icon: typeof HomeIcon }> = [
  { id: 'home', label: 'Inicio', icon: HomeIcon },
  { id: 'search', label: 'Buscar', icon: SearchIcon },
  { id: 'library', label: 'Mi lista', icon: BookmarkIcon },
  { id: 'addons', label: 'Addons', icon: PuzzleIcon },
];

let didStartupRefresh = false;

export default function App() {
  const [settings, setSettings] = useStoredState<AppSettings>(KEYS.settings, loadSettings());
  const cinemetaUrl = settings.cinemetaUrl || DEFAULT_SETTINGS.cinemetaUrl;
  const cinemetaUrlRef = useRef(cinemetaUrl);
  cinemetaUrlRef.current = cinemetaUrl;

  const withBuiltin = useCallback(
    (list: InstalledAddon[]) => ensureBuiltin(list, cinemetaUrlRef.current),
    [],
  );

  const [storedAddons, setStoredAddons] = useStoredState<InstalledAddon[]>(KEYS.addons, []);
  const addons = useMemo(
    () => ensureBuiltin(storedAddons, cinemetaUrl),
    [storedAddons, cinemetaUrl],
  );
  const addonsRef = useRef(addons);
  addonsRef.current = addons;

  const [library, setLibrary] = useStoredState<LibraryItem[]>(KEYS.library, []);
  const [recent, setRecent] = useStoredState<RecentItem[]>(KEYS.recentlyOpened, []);
  const [tab, setTab] = useStoredState<Tab>(KEYS.lastTab, 'home');
  const [stack, setStack] = useState<Route[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const [ambient, setAmbient] = useState<string | undefined>();
  const [toast, setToast] = useState<ToastState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const notify = useCallback((message: string, tone?: 'error' | 'ok') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  // Persistimos Cinemeta como addon integrado la primera vez.
  useEffect(() => {
    if (!storedAddons.some((addon) => addon.transportUrl === cinemetaUrl)) {
      setStoredAddons(() => addons);
    }
  }, [storedAddons, addons, setStoredAddons, cinemetaUrl]);

  // Guardamos los ajustes por defecto para que el resto del código los lea sin ambigüedad.
  useEffect(() => {
    if (readJSON(KEYS.settings, null) === null) setSettings(() => loadSettings());
  }, [setSettings]);

  // Refresco silencioso de manifests al abrir (catálogos nuevos, versiones…).
  useEffect(() => {
    if (didStartupRefresh) return;
    didStartupRefresh = true;
    const current = addonsRef.current;
    void Promise.allSettled(
      current.map(async (addon) => {
        const fresh = await fetchManifest(addon.transportUrl);
        return { url: addon.transportUrl, manifest: fresh.manifest };
      }),
    ).then((results) => {
      const updates = new Map<string, InstalledAddon['manifest']>();
      for (const result of results) {
        if (result.status === 'fulfilled') updates.set(result.value.url, result.value.manifest);
      }
      if (!updates.size) return;
      setStoredAddons((prev) =>
        withBuiltin(
          prev.map((addon) =>
            updates.has(addon.transportUrl)
              ? { ...addon, manifest: updates.get(addon.transportUrl)! }
              : addon,
          ),
        ),
      );
    });
  }, [setStoredAddons]);

  // Enlaces profundos: ?addon=https://…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepAddon = params.get('addon');
    if (!deepAddon) return;
    const install = async () => {
      try {
        const addon = await fetchManifest(deepAddon);
        setStoredAddons((prev) =>
          withBuiltin(
            prev.some((item) => item.transportUrl === addon.transportUrl)
              ? prev
              : [...prev, addon],
          ),
        );
        notify(`${addon.manifest.name} instalado`, 'ok');
      } catch (err) {
        notify(err instanceof Error ? err.message : 'No se pudo instalar el addon', 'error');
      } finally {
        const url = new URL(window.location.href);
        url.searchParams.delete('addon');
        window.history.replaceState({}, '', url.toString());
        setTab('addons');
      }
    };
    void install();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Historial del navegador ↔ pila de pantallas.
  const push = useCallback((route: Route) => {
    setStack((prev) => [...prev, route]);
    window.history.pushState({ nebula: stackRef.current.length + 1 }, '');
  }, []);

  const pop = useCallback(() => {
    if (!stackRef.current.length) return;
    window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setStack((prev) => prev.slice(0, Math.max(0, prev.length - 1)));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [tab, stack.length]);

  /* ----------------------------- acciones ----------------------------- */

  const installAddon = useCallback(
    async (url: string) => {
      const addon = await fetchManifest(url);
      if (addonsRef.current.some((item) => item.transportUrl === addon.transportUrl)) {
        throw new Error('Ese addon ya está instalado.');
      }
      setStoredAddons((prev) => withBuiltin([...prev, addon]));
    },
    [setStoredAddons, withBuiltin],
  );

  const removeAddon = useCallback(
    (url: string) => {
      setStoredAddons((prev) => withBuiltin(prev.filter((addon) => addon.transportUrl !== url)));
    },
    [setStoredAddons, withBuiltin],
  );

  const toggleAddon = useCallback(
    (url: string, enabled: boolean) => {
      setStoredAddons((prev) =>
        prev.map((addon) => (addon.transportUrl === url ? { ...addon, enabled } : addon)),
      );
    },
    [setStoredAddons],
  );

  const refreshAddons = useCallback(async () => {
    const results = await Promise.allSettled(
      addonsRef.current.map(async (addon) => ({
        url: addon.transportUrl,
        manifest: (await fetchManifest(addon.transportUrl)).manifest,
      })),
    );
    const updates = new Map<string, InstalledAddon['manifest']>();
    for (const result of results) {
      if (result.status === 'fulfilled') updates.set(result.value.url, result.value.manifest);
    }
    setStoredAddons((prev) =>
      withBuiltin(
        prev.map((addon) =>
          updates.has(addon.transportUrl)
            ? { ...addon, manifest: updates.get(addon.transportUrl)! }
            : addon,
        ),
      ),
    );
    if (updates.size !== addonsRef.current.length) {
      throw new Error('Algún addon no respondió');
    }
  }, [setStoredAddons, withBuiltin]);

  const toggleLibrary = useCallback(
    (meta: MetaPreview) => {
      setLibrary((prev) => {
        const exists = prev.some((item) => item.id === meta.id && item.type === meta.type);
        if (exists) {
          notify('Quitado de Mi lista', 'ok');
          return prev.filter((item) => !(item.id === meta.id && item.type === meta.type));
        }
        notify('Añadido a Mi lista', 'ok');
        return [
          {
            id: meta.id,
            type: meta.type,
            name: meta.name,
            poster: meta.poster,
            logo: meta.logo,
            addedAt: Date.now(),
          },
          ...prev,
        ];
      });
    },
    [notify, setLibrary],
  );

  const openDetail = useCallback(
    (meta: MetaPreview) => {
      push({ name: 'detail', preview: { ...meta, type: meta.type || 'movie' } });
    },
    [push],
  );

  const openStreams = useCallback(
    (meta: MetaPreview, metaId: string, label: string) => {
      push({
        name: 'streams',
        type: meta.type,
        id: metaId,
        title: meta.name,
        subtitle: [typeLabel(meta.type), label].filter(Boolean).join(' · '),
      });
      // "Continuar viendo": guardamos lo último que se abrió, sin duplicados.
      setRecent((prev) =>
        [
          {
            id: meta.id,
            type: meta.type,
            name: meta.name,
            poster: meta.poster,
            logo: meta.logo,
            hint: label || typeLabel(meta.type),
            addedAt: Date.now(),
            openedAt: Date.now(),
          },
          ...prev.filter((item) => !(item.id === meta.id && item.type === meta.type)),
        ].slice(0, 12),
      );
    },
    [push, setRecent],
  );

  const openShelf = useCallback(
    (shelf: ShelfConfig) => {
      push({
        name: 'grid',
        addonUrl: shelf.addon.transportUrl,
        catalog: shelf.catalog,
        title: shelf.title,
        subtitle: shelf.subtitle || shelf.addon.manifest.name,
      });
    },
    [push],
  );

  const openGenre = useCallback(
    (genre: string) => {
      const cinemeta = addonsRef.current.find((addon) => addon.builtin);
      const catalog = cinemeta?.manifest.catalogs.find(
        (item) => item.type === 'movie' && item.id === 'top',
      );
      if (!cinemeta || !catalog) return;
      push({
        name: 'grid',
        addonUrl: cinemeta.transportUrl,
        catalog,
        extra: { genre },
        title: genre,
        subtitle: 'Películas por género',
      });
    },
    [push],
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
    },
    [setSettings],
  );

  const changeCinemetaUrl = useCallback(
    async (raw: string) => {
      let next = raw.trim() || CINEMETA_URL;
      try {
        next = normalizeAddonUrl(next);
      } catch {
        /* dejamos el texto tal cual para que el usuario lo corrija */
      }
      if (next === cinemetaUrlRef.current) {
        notify('Ese servidor ya está en uso', 'ok');
        return;
      }

      setSettings((prev) => ({ ...prev, cinemetaUrl: next }));
      setStoredAddons((prev) => {
        const wasEnabled = prev.find((addon) => addon.builtin)?.enabled ?? true;
        return ensureBuiltin(
          prev.filter((addon) => !addon.builtin && addon.transportUrl !== next),
          next,
        ).map((addon) => (addon.builtin ? { ...addon, enabled: wasEnabled } : addon));
      });

      // Validamos el servidor de inmediato para no dejar al usuario a ciegas.
      try {
        const fresh = await fetchManifest(next);
        setStoredAddons((prev) =>
          prev.map((addon) =>
            addon.builtin && addon.transportUrl === next
              ? { ...addon, manifest: fresh.manifest }
              : addon,
          ),
        );
        notify('Cinemeta conectado', 'ok');
      } catch (err) {
        notify(
          `Se guardó, pero no responde: ${err instanceof Error ? err.message : 'error de red'}`,
          'error',
        );
      }
    },
    [notify, setSettings, setStoredAddons],
  );

  const changeTab = useCallback(
    (next: Tab) => {
      setTab(next);
      setStack([]);
      setAmbient(undefined);
    },
    [setTab],
  );

  /* ----------------------------- render ----------------------------- */

  const current = stack[stack.length - 1];

  const renderScreen = () => {
    if (current?.name === 'detail') {
      return (
        <Detail
          addons={addons}
          preview={current.preview}
          library={library}
          onBack={pop}
          onPlay={(metaId, label) => openStreams(current.preview, metaId, label)}
          onToggleLibrary={toggleLibrary}
          onAmbient={setAmbient}
          onOpenGridByGenre={openGenre}
        />
      );
    }

    if (current?.name === 'streams') {
      return (
        <Streams
          addons={addons}
          type={current.type}
          id={current.id}
          title={current.title}
          subtitle={current.subtitle}
          onBack={pop}
          onOpenAddons={() => {
            setStack([]);
            setTab('addons');
          }}
          notify={notify}
        />
      );
    }

    if (current?.name === 'grid') {
      const addon =
        addons.find((item) => item.transportUrl === current.addonUrl) ||
        addons.find((item) => item.builtin) ||
        addons[0];
      if (!addon) return null;
      return (
        <GridView
          addon={addon}
          catalog={current.catalog}
          extra={current.extra}
          title={current.title}
          subtitle={current.subtitle}
          onBack={pop}
          onOpenDetail={openDetail}
        />
      );
    }

    if (tab === 'search') {
      return <SearchView addons={addons} onOpenDetail={openDetail} notify={notify} />;
    }

    if (tab === 'library') {
      return (
        <LibraryView
          library={library}
          onOpenDetail={openDetail}
          onRemove={(meta) => {
            setLibrary((prev) =>
              prev.filter((item) => !(item.id === meta.id && item.type === meta.type)),
            );
            notify('Eliminado de Mi lista', 'ok');
          }}
          onGoHome={() => changeTab('home')}
        />
      );
    }

    if (tab === 'addons') {
      return (
        <AddonsView
          addons={addons}
          settings={settings}
          onSettings={updateSettings}
          onCinemetaUrl={changeCinemetaUrl}
          onInstall={installAddon}
          onRemove={removeAddon}
          onToggle={toggleAddon}
          onRefresh={refreshAddons}
          notify={notify}
        />
      );
    }

    return (
      <Home
        addons={addons}
        library={library}
        recent={recent}
        onOpenDetail={openDetail}
        onSeeAll={openShelf}
        onGenre={openGenre}
        onAmbient={setAmbient}
        onOpenAddons={() => changeTab('addons')}
        onOpenLibrary={() => changeTab('library')}
      />
    );
  };

  return (
    <div className="frame">
      <div className="ambient" key={ambient || 'none'} aria-hidden="true">
        {ambient ? <div className="ambient-img" style={{ backgroundImage: `url(${ambient})` }} /> : null}
        <div className="ambient-wash" />
      </div>

      {!stack.length ? (
        <header className="topbar">
          <div className="topbar-brand">
            <span className="brand-glyph">
              <SparkIcon width={16} height={16} />
            </span>
            <span className="brand-name">Nébula</span>
          </div>
          <nav className="tabs" aria-label="Secciones">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`tab ${tab === id ? 'is-active' : ''}`}
                onClick={() => changeTab(id)}
                aria-current={tab === id ? 'page' : undefined}
              >
                <Icon width={15} height={15} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </header>
      ) : null}

      <main
        className={`app-scroll ${!stack.length ? 'has-topbar' : ''} ${
          current?.name === 'detail' ? 'is-detail' : ''
        }`}
        ref={scrollRef}
      >
        {renderScreen()}
      </main>

      {toast ? <Toast key={toast.id} message={toast.message} tone={toast.tone} /> : null}

      <div className="home-indicator" aria-hidden="true" />
    </div>
  );
}
