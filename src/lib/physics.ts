import type { Surface, World } from './world';

export const STEP = 0.4;     // highest step you can walk up without jumping
export const BODY = 1.7;     // body height used for collisions
export const RADIUS = 0.25;  // body radius

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function inside(s: { x1: number; z1: number; x2: number; z2: number }, x: number, z: number, m = 0) {
  return x >= s.x1 - m && x <= s.x2 + m && z >= s.z1 - m && z <= s.z2 + m;
}

export function surfaceTop(s: Surface, x: number, z: number): number {
  if (s.kind === 'rect') return s.top;
  const { x1, x2, z1, z2 } = s;
  let t: number;
  switch (s.dir) {
    case '+x': t = (x - x1) / (x2 - x1); break;
    case '-x': t = (x2 - x) / (x2 - x1); break;
    case '+z': t = (z - z1) / (z2 - z1); break;
    default: t = (z2 - z) / (z2 - z1);
  }
  t = clamp(t, 0, 0.9999);
  const i = Math.floor(t * s.n);
  return s.y0 + ((s.y1 - s.y0) * (i + 1)) / s.n;
}

/** Highest walkable surface under (x,z) that is reachable from the current feet height. */
export function groundHeight(w: World, x: number, z: number, feet: number): number {
  let best = 0;
  for (const s of w.surfaces) {
    if (!inside(s, x, z)) continue;
    const t = surfaceTop(s, x, z);
    if (t <= feet + STEP + 1e-4 && t > best) best = t;
  }
  return best;
}

function pushOut(x: number, z: number, x1: number, z1: number, x2: number, z2: number, r: number): [number, number] | null {
  const cx = clamp(x, x1, x2), cz = clamp(z, z1, z2);
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    return [x + dx * k, z + dz * k];
  }
  const l = x - x1, rr = x2 - x, t = z - z1, b = z2 - z;
  const m = Math.min(l, rr, t, b);
  if (m === l) return [x1 - r, z];
  if (m === rr) return [x2 + r, z];
  if (m === t) return [x, z1 - r];
  return [x, z2 + r];
}

/** Push a circle (the player) out of walls, furniture and too-high floors. */
export function resolve(w: World, x: number, z: number, feet: number, r = RADIUS): [number, number] {
  for (let it = 0; it < 4; it++) {
    let moved = false;
    for (const o of w.obstacles) {
      if (o.y0 < feet + BODY && o.y1 > feet + STEP) {
        const p = pushOut(x, z, o.x1, o.z1, o.x2, o.z2, r);
        if (p) { x = p[0]; z = p[1]; moved = true; }
      }
    }
    for (const s of w.surfaces) {
      if (!inside(s, x, z, r)) continue;
      let top: number, bottom: number;
      if (s.kind === 'rect') { top = s.top; bottom = s.bottom; }
      else { top = surfaceTop(s, clamp(x, s.x1, s.x2), clamp(z, s.z1, s.z2)); bottom = top - 0.45; }
      if (top > feet + STEP && bottom < feet + BODY) {
        const p = pushOut(x, z, s.x1, s.z1, s.x2, s.z2, r);
        if (p) { x = p[0]; z = p[1]; moved = true; }
      }
    }
    if (!moved) break;
  }
  return [x, z];
}

/** True when a point is inside solid geometry (used to keep the 3rd-person camera out of walls). */
export function pointBlocked(w: World, x: number, y: number, z: number, m = 0.12): boolean {
  for (const p of w.pieces) {
    if (p.material === 'none' || p.material === 'glass') continue;
    if (y < p.y - m || y > p.y + p.h + m) continue;
    if (x < p.x - p.w / 2 - m || x > p.x + p.w / 2 + m) continue;
    if (z < p.z - p.d / 2 - m || z > p.z + p.d / 2 + m) continue;
    return true;
  }
  return false;
}

/** Which room is the player standing in? */
export function roomAt(w: World, x: number, z: number, feet: number) {
  let floor = 0;
  w.cfg.floors.forEach((f, i) => { if (feet >= f.y - 0.6) floor = i; });
  for (const r of w.cfg.rooms) {
    if (r.floor !== floor || (r.kind ?? 'room') === 'void') continue;
    if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return { room: r, floor };
  }
  for (const r of w.cfg.rooms) {
    if (r.floor !== floor) continue;
    if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return { room: r, floor };
  }
  return { room: null, floor };
}
