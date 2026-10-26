// Inline SVG icons (no icon font, no network). All 24x24, stroke = currentColor.
import type { ReactNode } from 'react';

const S = ({ children, size = 22 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const IconMenu = () => <S><path d="M4 7h16M4 12h16M4 17h16" /></S>;
export const IconClose = () => <S><path d="M6 6l12 12M18 6L6 18" /></S>;
export const IconFullscreen = ({ on }: { on: boolean }) => on
  ? <S><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></S>
  : <S><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></S>;
export const IconPlay = () => <S><path d="M7 5l12 7-12 7z" fill="currentColor" /></S>;
export const IconPause = () => <S><path d="M8 5v14M16 5v14" /></S>;
export const IconNext = () => <S><path d="M9 6l6 6-6 6" /></S>;
export const IconRun = () => (
  <S><circle cx="14" cy="4.5" r="2" /><path d="M8 21l3-6 3 2 1 5M6 12l3-4 4 1 2 4 3 1M11 15l-2-3" /></S>
);
export const IconCamera = () => <S><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></S>;
export const IconSun = () => <S><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></S>;
export const IconMoon = () => <S><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></S>;
export const IconGauge = () => <S><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></S>;
export const IconGyro = () => <S><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M3 9c-1 2-1 4 0 6M21 9c1 2 1 4 0 6" /></S>;
export const IconSound = ({ on }: { on: boolean }) => (
  <S><path d="M4 9h4l5-4v14l-5-4H4z" />{on ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}</S>
);
export const IconWalk = () => <S><circle cx="13" cy="4.5" r="2" /><path d="M10 21l2-6 3 3v3M9 11l3-3 3 3 3 1M12 15l-1-4" /></S>;
export const IconRestart = () => <S><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /></S>;
export const IconHome = () => <S><path d="M3 11l9-7 9 7v9H3z" /><path d="M10 20v-6h4v6" /></S>;
export const IconMap = () => <S><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></S>;
export const IconBob = () => <S><path d="M3 12c3-5 6 5 9 0s6 5 9 0" /></S>;

/** Room-type icon picked from the room name. */
export function RoomIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (/bed/.test(n)) return <S><path d="M3 18v-7h18v7M3 14h18M6 11V8h5v3" /></S>;
  if (/toilet|bath|dress|walk/.test(n)) return /toilet|bath/.test(n)
    ? <S><path d="M5 12h14v2a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5zM7 12V6a2 2 0 0 1 4 0" /></S>
    : <S><path d="M12 4a2 2 0 0 1 1 3.7L4 14h16l-7.5-6" /><path d="M4 14v1h16v-1" /></S>;
  if (/kitchen|work/.test(n)) return <S><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="9" cy="9" r="2" /><circle cx="15" cy="9" r="2" /><path d="M7 15h10" /></S>;
  if (/dining/.test(n)) return <S><path d="M4 10h16M6 10v9M18 10v9M8 5v5M12 5v5M16 5v5" /></S>;
  if (/living|sit/.test(n)) return <S><path d="M4 12V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12h18v5H3zM5 17v2M19 17v2" /></S>;
  if (/stair/.test(n)) return <S><path d="M4 20h4v-4h4v-4h4V8h4" /></S>;
  if (/court|terrace|balcony|garden/.test(n)) return <S><path d="M12 21v-8M12 13c-4 0-6-3-6-6 3 0 6 2 6 6zM12 13c4 0 6-3 6-6-3 0-6 2-6 6z" /></S>;
  if (/passage/.test(n)) return <S><path d="M4 20L9 4M20 20L15 4M12 6v2M12 11v2M12 16v3" /></S>;
  return <IconHome />;
}

/** Finger used by the onboarding animations. */
export const Finger = () => (
  <svg width="44" height="54" viewBox="0 0 44 54" aria-hidden="true">
    <path d="M17 6a4 4 0 0 1 8 0v18l9 2a5 5 0 0 1 4 6l-3 14a6 6 0 0 1-6 5H18a6 6 0 0 1-5-3L5 34a4 4 0 0 1 6-5l6 6z"
      fill="#f5f0e6" stroke="#1b1b1b" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export const Phone = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4">
    <rect x="12" y="4" width="16" height="32" rx="3" />
    <path d="M18 31h4" />
  </svg>
);

/** House silhouette for the loading screen. */
export const HouseSilhouette = () => (
  <svg width="180" height="96" viewBox="0 0 180 96" aria-hidden="true" fill="currentColor">
    <path d="M6 92V52h34V30h-8l-2-6h70l-2 6h-8v14h52l-2-6h40l-2 6h-6v48z" opacity=".85" />
    <rect x="62" y="56" width="20" height="36" fill="#0d1117" />
    <rect x="46" y="36" width="22" height="12" fill="#0d1117" opacity=".7" />
    <rect x="128" y="52" width="26" height="14" fill="#0d1117" opacity=".7" />
  </svg>
);
