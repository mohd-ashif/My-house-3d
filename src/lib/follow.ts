// Follow mode: walk behind another visitor at ~GAP metres, with the same auto-walk as tap-to-walk
// (player.auto + nav.findPath), climbing the stairs when they change floor. A jump in their position
// (they used "Go to room", started a tour, ...) teleports us into the same room.
// Any manual movement ends it (Player.tsx, TouchControls via App); so does them leaving.
import { useSyncExternalStore } from 'react';
import type { World } from './world';
import type { Peer } from './multiplayer';
import { peers, mp } from './multiplayer';
import { player, teleport } from './player';
import { findPath, freeSpot, levelOf } from './nav';
import { groundHeight, roomAt } from './physics';
import { house } from './houseState';

const GAP = 1.5;
const WALK = 1.9, RUN = 4.2;
const TICK_MS = 250;
const REPLAN = 0.75; // re-route once they have moved this far from where the current route ends
const OUT = 0.35;    // stair waypoints sit this far off each end of a flight

export type FollowEnd = 'user' | 'manual' | 'left' | 'tour';
export interface Following { id: string; name: string }

let state: Following | null = null;
const listeners = new Set<() => void>();
const endListeners = new Set<(why: FollowEnd, name: string) => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const set = (s: Following | null) => { state = s; listeners.forEach((f) => f()); };

/** Who we are following, if anyone. */
export const following = () => state;
export function useFollowing() { return useSyncExternalStore(subscribe, following, following); }
/** Called whenever following ends, with why (e.g. 'left': show a notice). */
export function onFollowEnd(fn: (why: FollowEnd, name: string) => void) { endListeners.add(fn); return () => { endListeners.delete(fn); }; }

let world: World;
let timer: ReturnType<typeof setInterval> | undefined;
let route: { auto: NonNullable<typeof player.auto>; tx: number; tz: number; tf: number } | null = null;
let jumps = 0;
let stuck = 0;

export function startFollowing(w: World, id: string) {
  const p = peers.get(id);
  if (!p) return;
  stopFollowing();
  world = w;
  jumps = p.jumps;
  stuck = 0;
  set({ id, name: p.name });
  timer = setInterval(tick, TICK_MS);
  tick();
}

export function stopFollowing(why: FollowEnd = 'user') {
  if (!state) return;
  const name = state.name;  clearInterval(timer);
  halt();
  set(null);
  endListeners.forEach((f) => f(why, name));
}

/** Drop our route (without onDone: nobody else is waiting for it). */
function halt() {
  if (route && player.auto === route.auto) player.auto = null;
  route = null;
}

// ---------- stairs ----------

type StairPoint = { x: number; z: number; y: number };
const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] } as const;

/** Points to walk through to climb every flight, bottom to top: just off each end of each sloped flight. */
function stairPoints(w: World): StairPoint[] {
  const flights = (w.cfg.stairs ?? []).filter((f) => Math.abs(f.y1 - f.y0) > 1e-3)
    .sort((a, b) => Math.min(a.y0, a.y1) - Math.min(b.y0, b.y1));
  const pts: StairPoint[] = [];
  for (const f of flights) {
    const [ux, uz] = DIRS[f.dir];
    const cx = (f.x1 + f.x2) / 2, cz = (f.z1 + f.z2) / 2;
    const reach = (ux ? (f.x2 - f.x1) : (f.z2 - f.z1)) / 2 + OUT;
    const start = { x: cx - ux * reach, z: cz - uz * reach, y: f.y0 }; // dir is the walking-up direction from y0
    const end = { x: cx + ux * reach, z: cz + uz * reach, y: f.y1 };
    pts.push(...(f.y1 > f.y0 ? [start, end] : [end, start]));
  }
  return pts;
}

/** On a flight or the landing between floors (where the per-floor path grids don't reach). */
function onStairs(w: World, x: number, z: number, feet: number) {
  const fl = w.cfg.stairs ?? [];
  if (!fl.length) return false;
  const lo = Math.min(...fl.map((f) => Math.min(f.y0, f.y1))), hi = Math.max(...fl.map((f) => Math.max(f.y0, f.y1)));
  return feet > lo + 0.05 && feet < hi - 0.05 && fl.some((f) => x > f.x1 - 0.05 && x < f.x2 + 0.05 && z > f.z1 - 0.05 && z < f.z2 + 0.05);
}

/**
 * A path from here to them: straight there on one floor, else to the stairs, up or down them, and on from the top/bottom.
 * Heights, not floor levels, decide on the stairs: someone halfway up still counts as the ground floor for levelOf.
 */
function routeTo(p: Peer): [number, number][] | null {
  const mine = levelOf(world, player.feet), theirs = levelOf(world, p.f);
  const on = onStairs(world, player.x, player.z, player.feet), theyOn = onStairs(world, p.x, p.z, p.f);
  if (!on && !theyOn && mine === theirs) return findPath(world, player.x, player.z, player.feet, p.x, p.z);
  const from = on ? player.feet : mine, to = theyOn ? p.f : theirs;
  const up = to > from;
  // on a floor: from the flight that starts on this floor; already on the stairs: only the points still ahead
  const slack = on ? -0.05 : 0.05;
  let pts = stairPoints(world).filter((s) => (up
    ? s.y >= from - slack && s.y <= to + 0.05
    : s.y <= from + slack && s.y >= to - 0.05));
  if (!up) pts = pts.reverse();
  if (!pts.length && !(on && theyOn)) return null;
  const pre = on || !pts.length ? [] : findPath(world, player.x, player.z, player.feet, pts[0].x, pts[0].z);
  const last = pts[pts.length - 1];
  // they are on a flight: straight up (or down) it from the last point before them
  const post = theyOn ? [[p.x, p.z] as [number, number]] : findPath(world, last.x, last.z, theirs, p.x, p.z);
  if (!pre || !post) return null;
  return [...pre, ...pts.map((s) => [s.x, s.z] as [number, number]), ...post];
}

/** The path, cut short so it ends `d` metres (along the path) before its end. */
function trimEnd(path: [number, number][], d: number): [number, number][] {
  const pts: [number, number][] = [[player.x, player.z], ...path];
  let left = d;
  while (pts.length > 1) {
    const b = pts[pts.length - 1], a = pts[pts.length - 2];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg > left) { const k = (seg - left) / seg; pts[pts.length - 1] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; break; }
    left -= seg;
    pts.pop();
  }
  return pts.slice(1);
}

/** Teleport into their room: GAP behind them, else the first free spot round them in the same room, else next to them. */
function joinThem(p: Peer) {
  halt();
  stuck = 0;
  const level = levelOf(world, p.f);
  const theirRoom = roomAt(world, p.x, p.z, p.f).room?.id;
  let [x, z] = freeSpot(world, p.x, p.z, level);
  for (let k = 0; k < 8; k++) {
    const a = p.y + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4); // behind, then 45° either side, ...
    const [sx, sz] = freeSpot(world, p.x + Math.sin(a) * GAP, p.z + Math.cos(a) * GAP, level);
    const d = Math.hypot(sx - p.x, sz - p.z);
    if (d > 1 && d < 2.5 && roomAt(world, sx, sz, p.f).room?.id === theirRoom) { [x, z] = [sx, sz]; break; }
  }
  teleport(x, z, groundHeight(world, x, z, p.f + 0.1), Math.atan2(-(p.x - x), -(p.z - z)));
}

function tick() {
  if (!state) return;
  if (mp.status !== 'online') { halt(); return; } // relay hiccup: wait where we are
  const p = peers.get(state.id);
  if (!p) { stopFollowing('left'); return; }
  const tour = house.get().tour;
  if (tour.active && !tour.paused && tour.phase !== 'done') { stopFollowing('tour'); return; }
  if (p.jumps !== jumps) { jumps = p.jumps; joinThem(p); return; }

  const walking = !!route && player.auto === route.auto;
  const dist = Math.hypot(p.x - player.x, p.z - player.z);
  const together = levelOf(world, p.f) === levelOf(world, player.feet)
    && !onStairs(world, player.x, player.z, player.feet) && !onStairs(world, p.x, p.z, p.f);
  if (together && dist < GAP + 0.3) { if (dist < GAP) halt(); return; }
  if (walking) {
    route!.auto.speed = dist > 5 || p.s > 2.5 ? RUN : WALK; // keep up when they run or pull away
    const moved = Math.hypot(p.x - route!.tx, p.z - route!.tz) + Math.abs(p.f - route!.tf);
    if (moved < REPLAN || onStairs(world, player.x, player.z, player.feet)) return; // finish the flight before re-routing
  }
  const full = routeTo(p);
  if (!full) { joinThem(p); return; } // no way to walk there (or the stairs): just go
  const path = trimEnd(full, GAP);
  if (!path.length) return;
  const auto: NonNullable<typeof player.auto> = {
    path, i: 0, stuck: 0, speed: dist > 5 || p.s > 2.5 ? RUN : WALK,
    onDone: (ok) => {
      if (route?.auto !== auto) return;
      route = null;
      if (ok) stuck = 0;
      else if (++stuck >= 3) { const q = state && peers.get(state.id); if (q) joinThem(q); } // keeps getting stuck: hop over
    },
  };
  player.lookAt = null;
  player.auto = auto;
  route = { auto, tx: p.x, tz: p.z, tf: p.f };
}
