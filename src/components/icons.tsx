import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function PlayIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8.5 5.4c0-1.2 1.3-1.9 2.3-1.3l8.8 5.6a1.5 1.5 0 0 1 0 2.6l-8.8 5.6c-1 .6-2.3-.1-2.3-1.3V5.4Z" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="m14.5 5-7 7 7 7" />
    </svg>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="m9.5 5 7 7-7 7" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2.8c.4 4.3 1.9 5.8 6.2 6.2-4.3.4-5.8 1.9-6.2 6.2-.4-4.3-1.9-5.8-6.2-6.2C10.1 8.6 11.6 7.1 12 2.8Z" />
      <path d="M17.6 14.4c.2 2.4 1.1 3.3 3.5 3.5-2.4.2-3.3 1.1-3.5 3.5-.2-2.4-1.1-3.3-3.5-3.5 2.4-.2 3.3-1.1 3.5-3.5Z" opacity=".7" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" />
    </svg>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 4h6v6M20 4L11 13" />
      <path d="M18 14.5V18a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 4 18V9a2.5 2.5 0 0 1 2.5-2.5H10" />
    </svg>
  );
}

export function FilmIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M8 4v16M16 4v16M3 9.5h5M3 14.5h5M16 9.5h5M16 14.5h5" />
    </svg>
  );
}

export function TvIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="4.5" width="19" height="12.5" rx="2.5" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function BookmarkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 4h11A1.5 1.5 0 0 1 19 5.5V20l-7-4.2L5 20V5.5A1.5 1.5 0 0 1 6.5 4Z" />
    </svg>
  );
}

export function PuzzleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 4.5a1.8 1.8 0 1 1 3.6 0V6h2.4A1.5 1.5 0 0 1 17 7.5v2.4h1.5a1.8 1.8 0 1 1 0 3.6H17v2.4a1.5 1.5 0 0 1-1.5 1.5h-2.4v1.5a1.8 1.8 0 1 1-3.6 0V17.4H7A1.5 1.5 0 0 1 5.5 16v-2.4H4a1.8 1.8 0 1 1 0-3.6h1.5V7.5A1.5 1.5 0 0 1 7 6h2.5V4.5Z" />
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />
      <path d="M9.5 20.5v-6h5v6" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.2 1 5.8L12 17l-5.2 2.8 1-5.8L3.5 9.8l5.9-.9L12 3.6Z" />
    </svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4.5 21 20H3L12 4.5Z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </svg>
  );
}

export function ArrowUpRight(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.5 3.6 5.4 3.6 8.5S14.4 18.5 12 20.5c-2.4-2-3.6-5.4-3.6-8.5S9.6 6 12 3.5Z" />
    </svg>
  );
}
