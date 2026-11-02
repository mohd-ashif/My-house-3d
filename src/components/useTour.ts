'use client';
import { useCallback, useEffect, useRef } from 'react';
import tourJson from '@/data/tour.json';
import type { World } from '@/lib/world';
import { player, teleport, stopAuto } from '@/lib/player';
import { groundHeight } from '@/lib/physics';
import { findPath, levelOf } from '@/lib/nav';
import { house, useHouse } from '@/lib/houseState';
import { tourReduce, FRAMING_SECONDS, type TourEvent, type TourState } from '@/lib/tourMachine';

export type { TourPhase, TourState } from '@/lib/tourMachine';
export interface TourStop { title: string; room: string | null; size?: string; text: string; path: [number, number][]; look: [number, number, number] }
interface TourData { speed: number; wait: number; start: { x: number; z: number; yaw: number }; stops: TourStop[] }
export const tour = tourJson as unknown as TourData;

/** "3.54x3.78" -> "3.54 × 3.78 m" */
export function formatDims(dims?: string) {
  if (!dims) return '';
  const v = dims.toLowerCase().split('x').map(Number).map((n) => (n > 20 ? n / 100 : n));
  return v.length === 2 && v.every((n) => !Number.isNaN(n)) ? `${v[0].toFixed(2)} × ${v[1].toFixed(2)} m` : dims;
}

export function stopSize(world: World, s: TourStop) {
  if (s.size) return s.size;
  const r = world.cfg.rooms.find((q) => q.id === s.room);
  return formatDims(r?.dims);
}

/** Put the character at stop `i`'s spot, facing what it shows (no walking): a walk that can't get through, a late joiner. */
export function hopToStop(world: World, i: number) {
  const stop = tour.stops[i];
  if (!stop) return;
  const [x, z] = stop.path[stop.path.length - 1];
  const lv = stop.room ? world.cfg.floors[world.cfg.rooms.find((r) => r.id === stop.room)?.floor ?? 0].y : levelOf(world, player.feet);
  teleport(x, z, groundHeight(world, x, z, lv + 0.1), Math.atan2(-(stop.look[0] - x), -(stop.look[2] - z)));
}

/** Within this distance (m) of a stop's spot, there is no need to walk there. */
const AT_STOP = 1.2;

/** Send a tour event to the shared store (see lib/tourMachine.ts). */
export const tourDispatch = (e: TourEvent) => house.set({ tour: tourReduce(house.get().tour, e, tour.stops.length) });

/**
 * Walks the character from stop to stop (src/data/tour.json), frames each room and shows its caption.
 * The state lives in the shared store; this hook turns its changes into walking and camera moves.
 * With `clock: false` it never advances the tour on its own (arrived -> framing -> caption -> next stop):
 * whoever owns the clock sends those events instead (a group tour's host: lib/groupTour.ts).
 * When the clock comes back mid-tour (this visitor just became the host), it carries on from where things are.
 */
export function useTour(world: World, { clock = true }: { clock?: boolean } = {}) {
  const st = useHouse((s) => s.tour);
  const prev = useRef<TourState>(st);
  const timer = useRef<number | null>(null);
  const myAuto = useRef<typeof player.auto>(null);
  const resumeAt = useRef(0);
  const clockRef = useRef(clock); clockRef.current = clock;
  const prevClock = useRef(clock);

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const schedule = (fn: () => void, s: number) => { clear(); timer.current = window.setTimeout(fn, s * 1000); };

  const walk = (i: number, from: number) => {
    const stop = tour.stops[i];
    if (!stop) return;
    player.lookAt = null;
    const end = stop.path[stop.path.length - 1];
    if (Math.hypot(end[0] - player.x, end[1] - player.z) < AT_STOP) { // already there (hopped in, resumed at the stop)
      if (clockRef.current) tourDispatch({ type: 'arrived', index: i });
      return;
    }
    let path = stop.path.slice(from);
    // after a manual detour, find the way back to the next waypoint on this floor first
    const first = path[0];
    if (first && Math.hypot(first[0] - player.x, first[1] - player.z) > 1.5) {
      const lead = findPath(world, player.x, player.z, player.feet, first[0], first[1]);
      if (lead) path = [...lead.slice(0, -1), ...path];
    }
    const a: NonNullable<typeof player.auto> = {
      path, i: 0, speed: tour.speed, stuck: 0,
      onDone: (ok) => {
        if (myAuto.current !== a) return;
        myAuto.current = null;
        const s = house.get().tour;
        if (s.paused) resumeAt.current = a.i; // stopped by the pause (or by the input that caused it): walk on from here
        if (!s.active || s.paused || s.index !== i) return;
        if (!ok) hopToStop(world, i); // could not get through: hop to the stop so the tour keeps going
        if (clockRef.current) tourDispatch({ type: 'arrived', index: i });
      },
    };
    myAuto.current = a;
    player.auto = a;
  };

  // every state change -> the matching side effects
  useEffect(() => {
    const was = prev.current;
    const tookClock = clock && !prevClock.current;
    prev.current = st;
    prevClock.current = clock;
    clear();
    const mine = () => !!player.auto && player.auto === myAuto.current;
    if (!st.active || st.phase === 'done') {
      if (mine()) stopAuto();
      if (was !== st) player.lookAt = null;
      return;
    }
    if (st.paused) {
      if (mine()) stopAuto(); // onDone notes where to walk on from
      player.lookAt = null;
      return;
    }
    const stop = tour.stops[st.index];
    if (st.phase === 'walking') {
      if (st.leg === was.leg) {
        // just took over the clock, already standing at the stop (a follower's walk doesn't report arriving)
        if (tookClock && !mine()) tourDispatch({ type: 'arrived', index: st.index });
        return;
      }
      const resuming = was.active && was.paused && was.index === st.index;
      if (mine()) { myAuto.current = null; stopAuto(); }
      walk(st.index, resuming ? resumeAt.current : 0);
      resumeAt.current = 0;
      return;
    }
    player.lookAt = stop.look;
    if (!clockRef.current) return;
    if (st.phase === 'framing') schedule(() => tourDispatch({ type: 'framed', index: st.index }), FRAMING_SECONDS);
    else schedule(() => tourDispatch({ type: 'next' }), tour.wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, clock]);

  useEffect(() => () => clear(), []);

  const toStart = useCallback(() => {
    const { x, z, yaw } = tour.start;
    teleport(x, z, groundHeight(world, x, z, 0.6), yaw);
  }, [world]);
  const start = useCallback(() => { toStart(); tourDispatch({ type: 'start' }); }, [toStart]);
  const hop = useCallback((i: number) => hopToStop(world, i), [world]);
  const pause = useCallback(() => tourDispatch({ type: 'pause' }), []);
  const resume = useCallback(() => tourDispatch({ type: 'resume' }), []);
  const next = useCallback(() => tourDispatch({ type: 'next' }), []);
  const exit = useCallback(() => tourDispatch({ type: 'exit' }), []);

  return { state: st, stop: tour.stops[st.index], count: tour.stops.length, start, pause, resume, next, exit, hop, toStart };
}
