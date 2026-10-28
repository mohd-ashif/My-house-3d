// Exterior design styles. Each one dresses the same plan (house.json) differently.
import modernTropical from '@/data/styles/modern-tropical.json';
import concreteGable from '@/data/styles/concrete-gable.json';
import keralaTile from '@/data/styles/kerala-tile.json';
import teakGable from '@/data/styles/teak-gable.json';
import teakGableGarden from '@/data/styles/teak-gable-garden.json';
import type { StyleDef } from './types';
import { storage } from './device';

export const STYLES: StyleDef[] = [modernTropical, concreteGable, keralaTile, teakGable, teakGableGarden] as unknown as StyleDef[];
export const DEFAULT_STYLE = STYLES[0].id;
const KEY = 'house-style';

export const styleById = (id: string) => STYLES.find((s) => s.id === id) ?? STYLES[0];

/** ?style=… wins, then the last choice, then the default. */
export function initialStyle(): string {
  if (typeof window === 'undefined') return DEFAULT_STYLE;
  const q = new URLSearchParams(window.location.search).get('style');
  if (q && STYLES.some((s) => s.id === q)) return q;
  const saved = storage.get(KEY);
  return saved && STYLES.some((s) => s.id === saved) ? saved : DEFAULT_STYLE;
}

export function rememberStyle(id: string) {
  storage.set(KEY, id);
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('style', id);
    window.history.replaceState(null, '', u.toString()); // the link always opens this design
  } catch { /* ignore */ }
}

export const nextStyle = (id: string) => STYLES[(STYLES.findIndex((s) => s.id === id) + 1) % STYLES.length].id;
