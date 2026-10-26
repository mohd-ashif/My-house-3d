// Tap-to-walk path finding: a coarse walkability grid per floor level (built lazily from the same
// obstacles and surfaces the physics uses) + A*, then string-pulled to a few straight segments.
import type { World } from './world';
import { groundHeight, surfaceTop, STEP, BODY, RADIUS } from './physics';

const CELL = 0.25;
const MAX_DROP = 0.6; // a cell this far below the floor level is a different level (void, outside the FF)

interface Grid { level: number; x0: number; z0: number; nx: number; nz: number; h: Float32Array; ok: Uint8Array }
const grids = new Map<string, Grid>();

function bounds(w: World) {
  const p = w.cfg.plot;
  let x0 = p?.x1 ?? Infinity, z0 = p?.z1 ?? Infinity, x1 = p?.x2 ?? -Infinity, z1 = p?.z2 ?? -Infinity;
  for (const r of w.cfg.rooms) { x0 = Math.min(x0, r.x1 - 1); z0 = Math.min(z0, r.z1 - 1); x1 = Math.max(x1, r.x2 + 1); z1 = Math.max(z1, r.z2 + 1); }
  return { x0, z0, x1, z1 };
}

function build(w: World, level: number): Grid {
  const b = bounds(w);
  const nx = Math.ceil((b.x1 - b.x0) / CELL), nz = Math.ceil((b.z1 - b.z0) / CELL);
  const h = new Float32Array(nx * nz), ok = new Uint8Array(nx * nz);
  // bucket the blockers by 1 m cells so each grid cell only tests its neighbours
  const B = 1, bx = Math.ceil((b.x1 - b.x0) / B) + 1, bz = Math.ceil((b.z1 - b.z0) / B) + 1;
  type Box = { x1: number; z1: number; x2: number; z2: number; y0: number; y1: number; s?: number };
  const buckets: Box[][] = Array.from({ length: bx * bz }, () => []);
  const put = (o: Box) => {
    for (let i = Math.max(0, Math.floor((o.x1 - b.x0) / B) - 1); i <= Math.min(bx - 1, Math.floor((o.x2 - b.x0) / B) + 1); i++)
      for (let j = Math.max(0, Math.floor((o.z1 - b.z0) / B) - 1); j <= Math.min(bz - 1, Math.floor((o.z2 - b.z0) / B) + 1); j++) buckets[j * bx + i].push(o);
  };
  for (const o of w.obstacles) put(o);
  for (const o of w.extraObstacles ?? []) put(o);
  w.surfaces.forEach((s, i) => put({ x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2, y0: 0, y1: 0, s: i }));
  const r = RADIUS * 0.9;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = b.x0 + (i + 0.5) * CELL, z = b.z0 + (j + 0.5) * CELL, k = j * nx + i;
    const g = groundHeight(w, x, z, level);
    h[k] = g;
    if (level - g > MAX_DROP) continue;
    let blocked = false;
    for (const o of buckets[Math.floor((z - b.z0) / B) * bx + Math.floor((x - b.x0) / B)] ?? []) {
      if (x < o.x1 - r || x > o.x2 + r || z < o.z1 - r || z > o.z2 + r) continue;
      if (o.s !== undefined) {
        const s = w.surfaces[o.s];
        const top = surfaceTop(s, Math.max(s.x1, Math.min(s.x2, x)), Math.max(s.z1, Math.min(s.z2, z)));
        const bottom = s.kind === 'rect' ? s.bottom : top - 0.45;
        if (top > g + STEP && bottom < g + BODY) { blocked = true; break; }
      } else if (o.y0 < g + BODY && o.y1 > g + STEP) { blocked = true; break; }
    }
    ok[k] = blocked ? 0 : 1;
  }
  return { level, x0: b.x0, z0: b.z0, nx, nz, h, ok };
}

/** Forget the walkability grids (the exterior style changed its colliders). */
export function clearNav() { grids.clear(); }

export function gridFor(w: World, level: number): Grid {
  const key = level.toFixed(2);
  let g = grids.get(key);
  if (!g) { g = build(w, level); grids.set(key, g); }
  return g;
}

/** The floor level (from the house's floor list) that a foot height belongs to. */
export function levelOf(w: World, feet: number): number {
  let lv = w.cfg.floors[0]?.y ?? 0;
  for (const f of w.cfg.floors) if (feet >= f.y - 0.6) lv = f.y;
  return lv;
}

function nearestOk(g: Grid, x: number, z: number, maxR = 6): number {
  const ci = Math.floor((x - g.x0) / CELL), cj = Math.floor((z - g.z0) / CELL);
  for (let rad = 0; rad <= maxR; rad++) {
    let best = -1, bd = Infinity;
    for (let j = cj - rad; j <= cj + rad; j++) for (let i = ci - rad; i <= ci + rad; i++) {
      if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) continue;
      const k = j * g.nx + i;
      if (!g.ok[k]) continue;
      const d = (i - ci) ** 2 + (j - cj) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function lineClear(g: Grid, a: number, b: number): boolean {
  const ax = a % g.nx, az = Math.floor(a / g.nx), bx = b % g.nx, bz = Math.floor(b / g.nx);
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
  let prev = g.h[a];
  for (let s = 1; s <= n; s++) {
    const i = Math.round(ax + ((bx - ax) * s) / n), j = Math.round(az + ((bz - az) * s) / n), k = j * g.nx + i;
    if (!g.ok[k] || Math.abs(g.h[k] - prev) > STEP) return false;
    prev = g.h[k];
  }
  return true;
}

/** Nearest free floor spot to (x,z) on a level (teleport targets that would land inside a bed or table). */
export function freeSpot(w: World, x: number, z: number, level: number): [number, number] {
  const g = gridFor(w, level);
  const k = nearestOk(g, x, z, 12);
  if (k < 0) return [x, z];
  return [g.x0 + ((k % g.nx) + 0.5) * CELL, g.z0 + (Math.floor(k / g.nx) + 0.5) * CELL];
}

/** Path from (x,z) to (tx,tz) on the floor level of `feet`; null when there is no way there. */
export function findPath(w: World, x: number, z: number, feet: number, tx: number, tz: number): [number, number][] | null {
  const g = gridFor(w, levelOf(w, feet));
  const s = nearestOk(g, x, z), t = nearestOk(g, tx, tz, 4);
  if (s < 0 || t < 0) return null;
  const N = g.nx * g.nz;
  const cost = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const tx_ = t % g.nx, tz_ = Math.floor(t / g.nx);
  const heur = (k: number) => Math.hypot((k % g.nx) - tx_, Math.floor(k / g.nx) - tz_);
  // binary heap of [f, k]
  const heap: number[] = [];
  const push = (f: number, k: number) => {
    heap.push(f, k); let c = heap.length / 2 - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p * 2] <= heap[c * 2]) break; [heap[p * 2], heap[c * 2]] = [heap[c * 2], heap[p * 2]]; [heap[p * 2 + 1], heap[c * 2 + 1]] = [heap[c * 2 + 1], heap[p * 2 + 1]]; c = p; }
  };
  const pop = () => {
    const k = heap[1]; const lf = heap.pop()!, lf0 = heap.pop()!;
    if (heap.length) {
      heap[0] = lf0; heap[1] = lf; let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1; let m = c;
        if (l * 2 < heap.length && heap[l * 2] < heap[m * 2]) m = l;
        if (r * 2 < heap.length && heap[r * 2] < heap[m * 2]) m = r;
        if (m === c) break;
        [heap[m * 2], heap[c * 2]] = [heap[c * 2], heap[m * 2]]; [heap[m * 2 + 1], heap[c * 2 + 1]] = [heap[c * 2 + 1], heap[m * 2 + 1]]; c = m;
      }
    }
    return k;
  };
  cost[s] = 0; push(heur(s), s);
  let found = false;
  while (heap.length) {
    const k = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === t) { found = true; break; }
    const i = k % g.nx, j = Math.floor(k / g.nx);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.nz) continue;
      const n = nj * g.nx + ni;
      if (!g.ok[n] || closed[n] || Math.abs(g.h[n] - g.h[k]) > STEP) continue;
      if (di && dj && (!g.ok[j * g.nx + ni] || !g.ok[nj * g.nx + i])) continue; // no corner cutting
      const c = cost[k] + (di && dj ? Math.SQRT2 : 1);
      if (c < cost[n]) { cost[n] = c; from[n] = k; push(c + heur(n), n); }
    }
  }
  if (!found) return null;
  const cells: number[] = [];
  for (let k = t; k !== -1; k = from[k]) cells.push(k);
  cells.reverse();
  // string-pull: keep only the corners we can't see past
  const keep = [cells[0]];
  let a = 0;
  while (a < cells.length - 1) {
    let b = cells.length - 1;
    while (b > a + 1 && !lineClear(g, cells[a], cells[b])) b--;
    keep.push(cells[b]); a = b;
  }
  // ends on the free cell nearest the tap (the tap itself may be against a bed or a wall)
  return keep.slice(1).map((k) => [g.x0 + ((k % g.nx) + 0.5) * CELL, g.z0 + (Math.floor(k / g.nx) + 0.5) * CELL] as [number, number]);
}
