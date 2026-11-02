// The house's shared, visible state: exterior design, day/night and the guided tour.
// One small store outside React (like lib/player.ts), so it can later be fed from the network:
// components read it with useHouse(), and every change goes through house.set().
import { useSyncExternalStore } from 'react';
import { initialStyle } from './styles';
import { TOUR_IDLE, type TourState } from './tourMachine';

export interface HouseState {
  styleId: string;
  night: boolean;
  tour: TourState;
}

let state: HouseState = { styleId: initialStyle(), night: false, tour: TOUR_IDLE };
const listeners = new Set<() => void>();

export const house = {
  get: () => state,
  /** Shallow-merge `patch`; listeners only hear about real changes. */
  set(patch: Partial<HouseState>) {
    if ((Object.keys(patch) as (keyof HouseState)[]).every((k) => Object.is(patch[k], state[k]))) return;
    state = { ...state, ...patch };
    listeners.forEach((f) => f());
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

/** Re-renders when the selected slice changes (return a primitive or a stored object, not a new one). */
export function useHouse<T>(select: (s: HouseState) => T): T {
  const get = () => select(state);
  return useSyncExternalStore(house.subscribe, get, get);
}

export const setStyle = (styleId: string) => house.set({ styleId });
export const toggleNight = () => house.set({ night: !state.night });
