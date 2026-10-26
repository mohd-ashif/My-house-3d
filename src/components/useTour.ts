'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import tourJson from '@/data/tour.json';
import type { World } from '@/lib/world';
import { player, teleport, stopAuto } from '@/lib/player';
import { groundHeight } from '@/lib/physics';
import { findPath, levelOf } from '@/lib/nav';

export interface TourStop { title: string; room: string | null; size?: string; text: string; path: [number, number][]; look: [number, number, number] }
interface TourData { speed: number; wait: number; start: { x: number; z: number; yaw: number }; stops: TourStop[] }
export const tour = tourJson as unknown as TourData;

export type TourPhase = 'walking' | 'framing' | 'caption' | 'done';
export interface TourState { active: boolean; index: number; phase: TourPhase; paused: boolean }

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

/** Walks the character from stop to stop (src/data/tour.json), frames each room and shows its caption. */
export function useTour(world: World) {
  const [st, setSt] = useState<TourState>({ active: false, index: 0, phase: 'walking', paused: false });
  const ref = useRef(st); ref.current = st;
  const timer = useRef<number | null>(null);
  const myAuto = useRef<typeof player.auto>(null);
  const resumeAt = useRef(0);

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const walk = useCallback((i: number, from = 0) => {
    const stop = tour.stops[i];
    if (!stop) return;
    player.lookAt = null;
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
        if (ref.current.paused || !ref.current.active || myAuto.current !== a) return;
        resumeAt.current = 0;
        if (!ok) {
          // could not get through: hop to the stop so the tour keeps going
          const [x, z] = stop.path[stop.path.length - 1];
          const lv = stop.room ? world.cfg.floors[world.cfg.rooms.find((r) => r.id === stop.room)?.floor ?? 0].y : levelOf(world, player.feet);
          teleport(x, z, groundHeight(world, x, z, lv + 0.1));
        }
        arrive(i);
      },
    };
    myAuto.current = a;
    player.auto = a;
    setSt((s) => ({ ...s, index: i, phase: 'walking' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);

  const schedule = (fn: () => void, s: number) => { clear(); timer.current = window.setTimeout(fn, s * 1000); };

  const next = useCallback(() => {
    clear();
    const i = ref.current.index + 1;
    if (i >= tour.stops.length) { player.lookAt = null; setSt((s) => ({ ...s, phase: 'done', paused: false })); return; }
    setSt((s) => ({ ...s, paused: false }));
    ref.current = { ...ref.current, paused: false };
    walk(i);
  }, [walk]);

  const showCaption = useCallback(() => {
    setSt((s) => ({ ...s, phase: 'caption' }));
    if (!ref.current.paused) schedule(() => next(), tour.wait);
  }, [next]);

  const arrive = (i: number) => {
    player.lookAt = tour.stops[i].look;
    setSt((s) => ({ ...s, index: i, phase: 'framing' }));
    schedule(() => showCaption(), 1.1);
  };

  const start = useCallback(() => {
    clear();
    const { x, z, yaw } = tour.start;
    teleport(x, z, groundHeight(world, x, z, 0.6), yaw);
    ref.current = { active: true, index: 0, phase: 'walking', paused: false };
    setSt(ref.current);
    walk(0);
  }, [walk, world]);

  const pause = useCallback(() => {
    const s = ref.current;
    if (!s.active || s.paused || s.phase === 'done') return;
    clear();
    ref.current = { ...s, paused: true };
    setSt(ref.current);
    if (s.phase === 'walking' && player.auto && player.auto === myAuto.current) { resumeAt.current = player.auto.i; stopAuto(); }
    player.lookAt = null;
  }, []);

  const resume = useCallback(() => {
    const s = ref.current;
    if (!s.active || !s.paused) return;
    ref.current = { ...s, paused: false };
    setSt(ref.current);
    if (s.phase === 'walking') walk(s.index, resumeAt.current);
    else if (s.phase === 'caption' || s.phase === 'framing') { player.lookAt = tour.stops[s.index].look; showCaption(); }
  }, [walk, showCaption]);

  const exit = useCallback(() => {
    clear();
    if (player.auto === myAuto.current) { myAuto.current = null; stopAuto(); }
    player.lookAt = null;
    ref.current = { active: false, index: 0, phase: 'walking', paused: false };
    setSt(ref.current);
  }, []);

  useEffect(() => () => clear(), []);

  return { state: st, stop: tour.stops[st.index], count: tour.stops.length, start, pause, resume, next, exit };
}
