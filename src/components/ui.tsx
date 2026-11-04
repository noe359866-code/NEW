import { useState, type ReactNode } from 'react';
import { posterFor } from '../lib/api';
import type { MetaPreview } from '../lib/types';
import { ChevronLeft, WarningIcon } from './icons';

export function Poster({
  meta,
  size = 'medium',
  className = '',
  shape,
}: {
  meta: Pick<MetaPreview, 'id' | 'name' | 'poster' | 'posterShape'>;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  shape?: 'poster' | 'landscape';
}) {
  const [broken, setBroken] = useState(false);
  const src = posterFor(meta as MetaPreview, size);
  const isLandscape = shape === 'landscape' || meta.posterShape === 'landscape';
  const initials = meta.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <div className={`poster ${isLandscape ? 'poster--landscape' : ''} ${className}`}>
      {src && !broken ? (
        <img
          src={src}
          alt={meta.name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="poster-fallback">
          <span>{initials || '✦'}</span>
        </div>
      )}
      <div className="poster-sheen" aria-hidden="true" />
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  onMore,
}: {
  title: string;
  subtitle?: string;
  onMore?: () => void;
}) {
  return (
    <div className="section-head">
      <div className="section-titles">
        <h2>{title}</h2>
        {subtitle ? <span className="section-sub">{subtitle}</span> : null}
      </div>
      {onMore ? (
        <button type="button" className="section-more" onClick={onMore}>
          Ver todo
          <ChevronLeft style={{ transform: 'rotate(180deg)' }} width={14} height={14} />
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonRail({ count = 5 }: { count?: number }) {
  return (
    <div className="rail rail--skeleton" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="skel-card" key={index}>
          <div className="skel skel-poster" />
          <div className="skel skel-line" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="skel skel-poster" key={index} />
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <div className="spinner" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="empty">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action ? (
        <button type="button" className="btn btn--light" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty empty--error">
      <div className="empty-icon">
        <WarningIcon width={26} height={26} />
      </div>
      <h3>Algo no salió bien</h3>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn--light" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="screen-header">
      <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver">
        <ChevronLeft width={20} height={20} />
      </button>
      <div className="screen-header-text">
        <h1>{title}</h1>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <div className="screen-header-right">{right}</div>
    </div>
  );
}

export function Chip({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`chip ${active ? 'chip--active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

export function Toast({ message, tone }: { message: string; tone?: 'error' | 'ok' }) {
  return (
    <div className={`toast ${tone === 'error' ? 'toast--error' : ''}`} role="status">
      {message}
    </div>
  );
}
