import { useEffect, useMemo, useRef, useState } from 'react';
import {
  backdropFor,
  cleanStreamTitle,
  logoFor,
  plainText,
  posterFor,
  typeLabel,
} from '../lib/api';
import { genreLabel, loadMeta } from '../lib/addons';
import { useAsync } from '../lib/hooks';
import type { InstalledAddon, LibraryItem, MetaPreview, Video } from '../lib/types';
import {
  BookmarkIcon,
  CheckIcon,
  ChevronLeft,
  PlayIcon,
  PlusIcon,
  StarIcon,
} from './icons';
import { Chip, ErrorState, Poster, Spinner } from './ui';

interface DetailProps {
  addons: InstalledAddon[];
  preview: MetaPreview;
  library: LibraryItem[];
  onBack: () => void;
  onPlay: (metaId: string, label: string) => void;
  onToggleLibrary: (meta: MetaPreview) => void;
  onAmbient: (url?: string) => void;
  onOpenGridByGenre?: (genre: string) => void;
}

export default function Detail({
  addons,
  preview,
  library,
  onBack,
  onPlay,
  onToggleLibrary,
  onAmbient,
  onOpenGridByGenre,
}: DetailProps) {
  const { data: meta, error, loading, reload } = useAsync(
    () => loadMeta(addons, preview.type, preview.id),
    [preview.type, preview.id, addons],
  );

  const detail: MetaPreview = meta || preview;
  const logo = logoFor(detail);
  const [logoBroken, setLogoBroken] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const episodesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onAmbient(backdropFor(detail));
  }, [detail.id, detail.background, onAmbient, detail]);

  useEffect(() => {
    setLogoBroken(false);
    setDescOpen(false);
    setSeason(null);
  }, [preview.id]);

  const seasons = useMemo(() => {
    const videos = (meta?.videos || []).filter(
      (video) => typeof video.season === 'number' && (video.season as number) > 0,
    );
    const map = new Map<number, Video[]>();
    for (const video of videos) {
      const key = video.season as number;
      const list = map.get(key) || [];
      list.push(video);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([number, items]) => ({
        number,
        items: items.sort((a, b) => (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0)),
      }))
      .sort((a, b) => a.number - b.number);
  }, [meta]);

  const activeSeason = season ?? seasons[0]?.number ?? 1;
  const activeEpisodes = seasons.find((s) => s.number === activeSeason)?.items || [];
  const inLibrary = library.some((item) => item.id === detail.id && item.type === detail.type);

  const description = cleanStreamTitle(meta?.description || preview.description);
  const director = meta?.director?.filter(Boolean).join(', ');
  const cast = meta?.cast?.filter(Boolean).slice(0, 8) || [];
  const trailerId = meta?.trailerStreams?.[0]?.ytId;

  const handlePlay = () => {
    if (seasons.length) {
      episodesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    onPlay(detail.id, '');
  };

  const playEpisode = (video: Video) => {
    const label = `T${video.season} E${video.episode ?? video.number}${
      video.name ? ` · ${video.name}` : ''
    }`;
    onPlay(video.id, label);
  };

  return (
    <div className="detail">
      <div
        className="detail-hero"
        style={{ backgroundImage: `url(${backdropFor(detail) || posterFor(detail) || ''})` }}
      >
        <div className="detail-hero-scrim" />
        <div className="detail-topbar">
          <button type="button" className="glass-btn" onClick={onBack} aria-label="Volver">
            <ChevronLeft width={19} height={19} />
            <span>Atrás</span>
          </button>
          <button
            type="button"
            className={`glass-btn glass-btn--icon ${inLibrary ? 'is-on' : ''}`}
            onClick={() => onToggleLibrary(detail)}
            aria-label={inLibrary ? 'Quitar de mi lista' : 'Añadir a mi lista'}
          >
            {inLibrary ? <CheckIcon width={18} height={18} /> : <PlusIcon width={18} height={18} />}
          </button>
        </div>
      </div>

      <div className="detail-body">
        {loading && !meta ? <Spinner label="Cargando detalles…" /> : null}

        <div className="detail-head">
          <div className="detail-poster">
            <Poster meta={detail} size="large" />
          </div>
          <div className="detail-headings">
            <span className="eyebrow">{typeLabel(detail.type)}</span>
            {logo && !logoBroken ? (
              <img
                className="detail-logo"
                src={logo}
                alt={detail.name}
                referrerPolicy="no-referrer"
                onError={() => setLogoBroken(true)}
              />
            ) : (
              <h1 className="detail-title">{detail.name}</h1>
            )}
            <div className="detail-chips">
              {detail.releaseInfo ? <span>{detail.releaseInfo}</span> : null}
              {meta?.runtime ? <span>{meta.runtime}</span> : null}
              {detail.imdbRating ? (
                <span className="rating">
                  <StarIcon width={11} height={11} /> {detail.imdbRating}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="detail-actions">
          <button type="button" className="btn btn--light btn--wide" onClick={handlePlay}>
            <PlayIcon width={15} height={15} />
            {seasons.length ? 'Ver episodios' : 'Reproducir'}
          </button>
          {trailerId ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() =>
                window.open(`https://www.youtube.com/watch?v=${trailerId}`, '_blank', 'noopener')
              }
            >
              Tráiler
            </button>
          ) : null}
          <button
            type="button"
            className={`btn btn--ghost btn--icon ${inLibrary ? 'is-on' : ''}`}
            onClick={() => onToggleLibrary(detail)}
            aria-label={inLibrary ? 'Quitar de mi lista' : 'Añadir a mi lista'}
          >
            {inLibrary ? <CheckIcon width={17} height={17} /> : <BookmarkIcon width={17} height={17} />}
          </button>
        </div>

        {detail.genres?.length ? (
          <div className="rail rail--chips detail-genres">
            {detail.genres.map((genre) => (
              <Chip key={genre} onClick={() => onOpenGridByGenre?.(genre)}>
                {genreLabel(genre)}
              </Chip>
            ))}
          </div>
        ) : null}

        {description ? (
          <div className="detail-desc-block">
            <p className={`detail-desc ${descOpen ? 'is-open' : ''}`}>{description}</p>
            {description.length > 190 ? (
              <button type="button" className="link-btn" onClick={() => setDescOpen((v) => !v)}>
                {descOpen ? 'Menos' : 'Más'}
              </button>
            ) : null}
          </div>
        ) : null}

        {error && !meta ? (
          <ErrorState message={error} onRetry={reload} />
        ) : null}

        {director || cast.length ? (
          <div className="facts">
            {director ? (
              <div className="fact">
                <span className="fact-label">Dirección</span>
                <span className="fact-value">{director}</span>
              </div>
            ) : null}
            {cast.length ? (
              <div className="fact">
                <span className="fact-label">Reparto</span>
                <span className="fact-value">{cast.join(' · ')}</span>
              </div>
            ) : null}
            {meta?.country ? (
              <div className="fact">
                <span className="fact-label">País</span>
                <span className="fact-value">{meta.country}</span>
              </div>
            ) : null}
            {meta?.awards ? (
              <div className="fact">
                <span className="fact-label">Premios</span>
                <span className="fact-value">{plainText(meta.awards)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {seasons.length ? (
          <div className="episodes" ref={episodesRef}>
            <div className="episodes-head">
              <h2>Episodios</h2>
              <span>
                {seasons.length} {seasons.length === 1 ? 'temporada' : 'temporadas'}
              </span>
            </div>
            {seasons.length > 1 ? (
              <div className="rail rail--chips">
                {seasons.map((item) => (
                  <Chip
                    key={item.number}
                    active={item.number === activeSeason}
                    onClick={() => setSeason(item.number)}
                  >
                    T{item.number}
                  </Chip>
                ))}
              </div>
            ) : null}
            <div className="episode-list">
              {activeEpisodes.map((video) => (
                <button
                  type="button"
                  key={video.id}
                  className="episode"
                  onClick={() => playEpisode(video)}
                >
                  <div className="episode-thumb">
                    {video.thumbnail ? (
                      <img
                        src={video.thumbnail}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span>{video.episode ?? video.number}</span>
                    )}
                    <div className="episode-play">
                      <PlayIcon width={13} height={13} />
                    </div>
                  </div>
                  <div className="episode-text">
                    <div className="episode-title">
                      <span className="episode-num">{video.episode ?? video.number}</span>
                      {video.name || 'Episodio'}
                    </div>
                    {video.overview ? <p>{plainText(video.overview)}</p> : null}
                    {video.released ? (
                      <span className="episode-date">
                        {new Date(video.released).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
              {!activeEpisodes.length ? (
                <p className="muted">No hay episodios listados para esta temporada.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="detail-footnote">
          Metadatos de {addons.filter((a) => a.enabled).map((a) => a.manifest.name).join(' · ')}
        </p>
      </div>
    </div>
  );
}
