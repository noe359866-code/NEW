import { useEffect, useMemo, useState } from 'react';
import { backdropFor, cleanStreamTitle, logoFor, posterFor, typeLabel } from '../lib/api';
import { GENRES, loadCatalog, shelvesFor, type ShelfConfig } from '../lib/addons';
import type { InstalledAddon, LibraryItem, MetaPreview } from '../lib/types';
import { PlayIcon, PlusIcon, StarIcon, TvIcon, FilmIcon, SparkIcon } from './icons';
import { Chip, EmptyState, ErrorState, Poster, SectionHeader, SkeletonRail } from './ui';

interface HomeProps {
  addons: InstalledAddon[];
  library: LibraryItem[];
  onOpenDetail: (meta: MetaPreview) => void;
  onSeeAll: (shelf: ShelfConfig) => void;
  onGenre: (genre: string) => void;
  onAmbient: (url?: string) => void;
  onOpenAddons: () => void;
  onOpenLibrary: () => void;
}

const LOADING = Symbol('loading');
const FAILED = Symbol('failed');
type ShelfState = MetaPreview[] | typeof LOADING | typeof FAILED;

export default function Home({
  addons,
  library,
  onOpenDetail,
  onSeeAll,
  onGenre,
  onAmbient,
  onOpenAddons,
  onOpenLibrary,
}: HomeProps) {
  const shelves = useMemo(() => shelvesFor(addons, 8), [addons]);
  const [data, setData] = useState<Record<string, ShelfState>>({});
  const [nonce, setNonce] = useState(0);
  const [heroDismissed, setHeroDismissed] = useState<string | null>(null);

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
    if (hero && heroDismissed !== hero.id) onAmbient(backdropFor(hero));
  }, [hero, heroDismissed, onAmbient]);

  const everythingFailed =
    shelves.length > 0 && Object.keys(data).length === shelves.length &&
    Object.values(data).every((value) => value === FAILED);

  const cinemetaOn = addons.some((a) => a.builtin && a.enabled);

  return (
    <div className="home">
      {hero && heroDismissed !== hero.id ? (
        <Hero
          meta={hero}
          onPlay={() => onOpenDetail(hero)}
          onInfo={() => onOpenDetail(hero)}
        />
      ) : (
        <div className="hero hero--empty">
          <div className="hero-inner">
            <div className="brand-mark">
              <SparkIcon width={20} height={20} />
              <span>NÉBULA</span>
            </div>
            <h1>Tu cine, en la palma de la mano.</h1>
            <p>Cinemeta activado. Añade tus addons de Stremio y explora miles de títulos.</p>
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
  onPlay,
  onInfo,
}: {
  meta: MetaPreview;
  onPlay: () => void;
  onInfo: () => void;
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
          <span>NÉBULA</span>
        </div>
        {logo && !logoBroken ? (
          <img
            className="hero-logo"
            src={logo}
            alt={meta.name}
            referrerPolicy="no-referrer"
            onError={() => setLogoBroken(true)}
          />
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
          <button type="button" className="btn btn--light" onClick={onPlay}>
            <PlayIcon width={16} height={16} /> Reproducir
          </button>
          <button type="button" className="btn btn--ghost" onClick={onInfo}>
            <PlusIcon width={16} height={16} /> Más info
          </button>
        </div>
      </div>
    </section>
  );
}
