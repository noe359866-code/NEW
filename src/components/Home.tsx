import { useEffect, useMemo, useState } from 'react';
import { backdropFor, cleanStreamTitle, logoFor, posterFor, typeLabel } from '../lib/api';
import { GENRES, loadCatalog, shelvesFor, type ShelfConfig } from '../lib/addons';
import type { InstalledAddon, LibraryItem, MetaPreview, RecentItem } from '../lib/types';
import { CheckIcon, ChevronRight, PlusIcon, StarIcon, TvIcon, FilmIcon, SparkIcon } from './icons';
import { Chip, EmptyState, ErrorState, Poster, SectionHeader, SkeletonRail } from './ui';

interface HomeProps {
  addons: InstalledAddon[];
  library: LibraryItem[];
  recent: RecentItem[];
  onOpenDetail: (meta: MetaPreview) => void;
  onSeeAll: (shelf: ShelfConfig) => void;
  onGenre: (genre: string) => void;
  onAmbient: (url?: string) => void;
  onOpenAddons: () => void;
  onOpenLibrary: () => void;
  onToggleLibrary: (meta: MetaPreview) => void;
}

const LOADING = Symbol('loading');
const FAILED = Symbol('failed');
type ShelfState = MetaPreview[] | typeof LOADING | typeof FAILED;

export default function Home({
  addons,
  library,
  recent,
  onOpenDetail,
  onSeeAll,
  onGenre,
  onAmbient,
  onOpenAddons,
  onOpenLibrary,
  onToggleLibrary,
}: HomeProps) {
  const shelves = useMemo(() => shelvesFor(addons, 8), [addons]);
  const [data, setData] = useState<Record<string, ShelfState>>({});
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setData({});
    if (!shelves.length) return () => { alive = false; };
    for (const shelf of shelves) {
      loadCatalog(shelf.addon, shelf.catalog)
        .then((items) => {
          if (alive) setData((prev) => ({ ...prev, [shelf.key]: items }));
        })
        .catch(() => {
          if (alive) setData((prev) => ({ ...prev, [shelf.key]: FAILED }));
        });
    }
    return () => {
      alive = false;
    };
  }, [shelves, nonce]);

  const heroShelf = shelves.find((s) => s.catalog.type === 'movie') || shelves[0];
  const heroItems = heroShelf ? data[heroShelf.key] : undefined;
  const hero = useMemo(() => {
    if (!heroShelf || !Array.isArray(heroItems) || !heroItems.length) return undefined;
    const list = heroItems.filter((item) => backdropFor(item));
    if (!list.length) return undefined;
    const day = Math.floor(Date.now() / 86400000);
    return list[day % Math.min(list.length, 6)];
  }, [heroItems, heroShelf]);

  useEffect(() => {
    onAmbient(hero ? backdropFor(hero) : undefined);
  }, [hero, onAmbient]);

  const everythingFailed =
    shelves.length > 0 && Object.keys(data).length === shelves.length &&
    Object.values(data).every((value) => value === FAILED);

  const cinemetaOn = addons.some((a) => a.builtin && a.enabled);
  const heroLoading = Boolean(heroShelf && !heroItems);

  return (
    <div className="home">
      {hero ? (
        <Hero
          meta={hero}
          onInfo={() => onOpenDetail(hero)}
          inLibrary={library.some((item) => item.id === hero.id && item.type === hero.type)}
          onToggleLibrary={() => onToggleLibrary(hero)}
        />
      ) : heroLoading ? (
        <div className="hero hero--loading" role="status" aria-label="Cargando destacado">
          <div className="hero-inner" aria-hidden="true">
            <div className="skel hero-skel-label" />
            <div className="skel hero-skel-title" />
            <div className="skel hero-skel-copy" />
          </div>
        </div>
      ) : (
        <div className="hero hero--empty">
          <div className="hero-inner">
            <div className="brand-mark">
              <SparkIcon width={20} height={20} />
              <span>NÉBULA</span>
            </div>
            <h1>Tu cine, en la palma de la mano.</h1>
            <p>{cinemetaOn
              ? 'Explora tus catálogos y descubre algo nuevo para ver.'
              : 'Activa Cinemeta o añade tus addons de Stremio para empezar a explorar.'}</p>
            <div className="hero-actions">
              <button type="button" className="btn btn--light" onClick={onOpenAddons}>
                Gestionar addons
              </button>
              <button type="button" className="btn btn--ghost" onClick={onOpenLibrary}>
                Mi lista
              </button>
            </div>
          </div>
        </div>
      )}

      {cinemetaOn ? (
        <div className="genre-strip">
          <div className="genre-strip-head">
            <span>Explorar por género</span>
          </div>
          <div className="rail rail--chips">
            {GENRES.slice(0, 12).map((genre) => (
              <Chip key={genre.value} onClick={() => onGenre(genre.value)}>
                {genre.label}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {!cinemetaOn ? (
        <div className="notice">
          Cinemeta está desactivado: no habrá catálogos ni metadatos.
          <button type="button" onClick={onOpenAddons}>
            Reactivar
          </button>
        </div>
      ) : null}

      {everythingFailed ? (
        <ErrorState
          message="No pudimos cargar los catálogos. Revisa tu conexión o desactiva addons que no respondan."
          onRetry={() => setNonce((n) => n + 1)}
        />
      ) : null}

      {recent.length > 0 ? (
        <section className="shelf">
          <SectionHeader title="Abiertos recientemente" subtitle="Retoma tu exploración" />
          <div className="rail">
            {recent.slice(0, 12).map((item) => (
              <button
                type="button"
                key={`${item.type}:${item.id}`}
                className="card"
                onClick={() => onOpenDetail({ ...item } as MetaPreview)}
              >
                <Poster meta={item} />
                <span className="card-title">{item.name}</span>
                <span className="card-sub">{item.hint || typeLabel(item.type)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {library.length > 0 ? (
        <section className="shelf">
          <SectionHeader title="Mi lista" subtitle="Guardado en este dispositivo" onMore={onOpenLibrary} />
          <div className="rail">
            {library.slice(0, 12).map((item) => (
              <button
                type="button"
                key={`${item.type}:${item.id}`}
                className="card"
                onClick={() => onOpenDetail({ ...item, poster: item.poster, logo: item.logo } as MetaPreview)}
              >
                <Poster meta={item} />
                <span className="card-title">{item.name}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {shelves.map((shelf) => {
        const state = data[shelf.key];
        if (state === FAILED) {
          return (
            <section className="shelf" key={shelf.key}>
              <SectionHeader
                title={shelf.title}
                subtitle={shelf.subtitle}
                onMore={() => onSeeAll(shelf)}
              />
              <div className="shelf-error">
                Este catálogo no respondió.
                <button type="button" onClick={() => setNonce((n) => n + 1)}>
                  Reintentar
                </button>
              </div>
            </section>
          );
        }
        return (
          <section className="shelf" key={shelf.key}>
            <SectionHeader
              title={shelf.title}
              subtitle={shelf.subtitle}
              onMore={() => onSeeAll(shelf)}
            />
            {!state || state === LOADING ? (
              <SkeletonRail />
            ) : (
              <div className="rail">
                {(state as MetaPreview[]).slice(0, 18).map((item, index) => (
                  <button
                    type="button"
                    key={`${shelf.key}:${item.id}:${index}`}
                    className="card"
                    onClick={() => onOpenDetail({ ...item, type: item.type || shelf.catalog.type })}
                  >
                    <Poster meta={item} />
                    <span className="card-title">{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {!shelves.length ? (
        <EmptyState
          icon={<SparkIcon width={26} height={26} />}
          title="Sin catálogos todavía"
          message="Activa Cinemeta o instala un addon con catálogos para llenar esta pantalla."
          action={{ label: 'Ir a addons', onClick: onOpenAddons }}
        />
      ) : null}

      <footer className="home-footer">
        <div className="footer-badges">
          <span>
            <FilmIcon width={13} height={13} /> Películas
          </span>
          <span>
            <TvIcon width={13} height={13} /> Series
          </span>
          <span>
            <SparkIcon width={13} height={13} /> Cinemeta
          </span>
        </div>
        <p>
          Nébula no aloja contenido. Los enlaces provienen de los addons que tú instalas.
        </p>
      </footer>
    </div>
  );
}

function Hero({
  meta,
  onInfo,
  inLibrary,
  onToggleLibrary,
}: {
  meta: MetaPreview;
  onInfo: () => void;
  inLibrary: boolean;
  onToggleLibrary: () => void;
}) {
  const logo = logoFor(meta);
  const [logoBroken, setLogoBroken] = useState(false);
  useEffect(() => {
    setLogoBroken(false);
  }, [meta.id]);

  const description = cleanStreamTitle(meta.description);

  return (
    <section className="hero">
      <div
        className="hero-bg"
        style={{ backgroundImage: `url(${backdropFor(meta) || posterFor(meta) || ''})` }}
        aria-hidden="true"
      />
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-inner">
        <div className="brand-mark brand-mark--top">
          <SparkIcon width={18} height={18} />
          <span>DESTACADO EN NÉBULA</span>
        </div>
        {logo && !logoBroken ? (
          <h1 className="hero-logo-heading">
            <img
              className="hero-logo"
              src={logo}
              alt={meta.name}
              referrerPolicy="no-referrer"
              onError={() => setLogoBroken(true)}
            />
          </h1>
        ) : (
          <h1 className="hero-title">{meta.name}</h1>
        )}
        <div className="hero-meta">
          {meta.imdbRating ? (
            <span className="hero-rating">
              <StarIcon width={12} height={12} /> {meta.imdbRating}
            </span>
          ) : null}
          {meta.releaseInfo ? <span>{meta.releaseInfo}</span> : null}
          <span>{typeLabel(meta.type)}</span>
          {meta.genres?.[0] ? <span>{meta.genres[0]}</span> : null}
        </div>
        {description ? <p className="hero-desc">{description}</p> : null}
        <div className="hero-actions">
          <button type="button" className="btn btn--light" onClick={onInfo}>
            Ver detalles <ChevronRight width={15} height={15} />
          </button>
          <button type="button" className="btn btn--ghost" onClick={onToggleLibrary} aria-pressed={inLibrary}
            aria-label={inLibrary ? 'Quitar de Mi lista' : 'Añadir a Mi lista'}>
            {inLibrary ? <CheckIcon width={16} height={16} /> : <PlusIcon width={16} height={16} />}
            {inLibrary ? 'En mi lista' : 'Mi lista'}
          </button>
        </div>
      </div>
    </section>
  );
}
