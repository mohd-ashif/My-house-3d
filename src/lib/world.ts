import type { Flight, HouseConfig, MaterialName, Room } from './types';
import { expandFurniture } from './furniture';

/** A rendered box. (x,z) = center on plan, y = bottom. */
export interface Piece {
  x: number; z: number; w: number; d: number; y: number; h: number;
  material: MaterialName;
  uv?: 'floor' | 'wall';
}
export interface Obstacle { x1: number; z1: number; x2: number; z2: number; y0: number; y1: number }
export interface RectSurface { kind: 'rect'; x1: number; z1: number; x2: number; z2: number; top: number; bottom: number }
export interface StairSurface { kind: 'stair'; x1: number; z1: number; x2: number; z2: number; dir: Flight['dir']; y0: number; y1: number; n: number }
export type Surface = RectSurface | StairSurface;
export interface DoorInst { axis: 'x' | 'z'; a: number; b: number; c: number; y: number; h: number; type: 'door' | 'sliding'; main: boolean; floor: number; frame?: 'black' | 'teak' }
export interface GlassInst { axis: 'x' | 'z'; a: number; b: number; c: number; y0: number; y1: number; t: number; frame?: 'black' | 'teak' }

export interface World {
  cfg: HouseConfig;
  pieces: Piece[];
  obstacles: Obstacle[];
  surfaces: Surface[];
  doors: DoorInst[];
  glass: GlassInst[];
  warnings: string[];
  center: [number, number];
  radius: number;
}

type Line = { floor: number; axis: 'x' | 'z'; c: number; ivs: [number, number][]; cuts: number[] };

const EPS = 1e-6;

function union(ivs: [number, number][]): [number, number][] {
  const s = [...ivs].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + EPS) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

function subtract(ivs: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [s, e] of ivs) {
    if (e <= a + EPS || s >= b - EPS) { out.push([s, e]); continue; }
    if (s < a - EPS) out.push([s, a]);
    if (e > b + EPS) out.push([b, e]);
  }
  return out;
}

export function linePiece(axis: 'x' | 'z', a: number, b: number, c: number, y: number, h: number, t: number, material: MaterialName): Piece {
  const len = b - a;
  return axis === 'x'
    ? { x: (a + b) / 2, z: c, w: len, d: t, y, h, material, uv: 'wall' }
    : { x: c, z: (a + b) / 2, w: t, d: len, y, h, material, uv: 'wall' };
}

const toObstacle = (p: Piece, colH?: number): Obstacle => ({
  x1: p.x - p.w / 2, x2: p.x + p.w / 2, z1: p.z - p.d / 2, z2: p.z + p.d / 2,
  y0: p.y, y1: p.y + Math.max(p.h, colH ?? 0),
});

export function defaultFloorMaterial(r: Room): MaterialName {
  const n = r.name.toLowerCase();
  if ((r.kind ?? 'room') === 'outdoor') return /court|garden|lawn/.test(n) ? 'grass' : 'paving';
  if (/toilet|bath|wc|wash|powder/.test(n)) return 'bathTile';
  if (/bed|dressing|walk|study/.test(n)) return 'wood';
  if (/kitchen|work|utility|store/.test(n)) return 'tile';
  if (/stair/.test(n)) return 'granite';
  return 'marble';
}

export function buildWorld(cfg: HouseConfig): World {
  const T = cfg.wallThickness ?? 0.2;
  const S = cfg.slabThickness ?? 0.15;
  const pieces: Piece[] = [];
  const obstacles: Obstacle[] = [];
  const surfaces: Surface[] = [];
  const doors: DoorInst[] = [];
  const glass: GlassInst[] = [];
  const warnings: string[] = [];
  const nF = cfg.floors.length;
  const fy = (f: number) => cfg.floors[f]?.y ?? 0;
  const ceil = (f: number) => fy(f) + (cfg.floors[f]?.height ?? 3) - S; // underside of the slab above
  const wallBase = (f: number) => (f === 0 ? 0 : fy(f) - S);
  const solid = (p: Piece) => { pieces.push(p); obstacles.push(toObstacle(p)); };

  // ---------- floors, plinth, ceilings, roofs ----------
  for (const r of cfg.rooms) {
    const kind = r.kind ?? 'room';
    const w = r.x2 - r.x1, d = r.z2 - r.z1;
    if (w <= 0 || d <= 0) { warnings.push(`Room ${r.id}: x2/z2 must be larger than x1/z1`); continue; }
    const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    if (kind !== 'void') {
      const top = fy(r.floor);
      const bottom = r.floor === 0 ? 0 : top - S;
      const finish = 0.02;
      if (top - bottom > finish + 0.01) {
        pieces.push({ x: cx, z: cz, w, d, y: bottom, h: top - bottom - finish, material: r.floor === 0 ? 'concrete' : 'paint', uv: 'floor' });
      }
      pieces.push({ x: cx, z: cz, w, d, y: top - finish, h: finish, material: r.floorMaterial ?? defaultFloorMaterial(r), uv: 'floor' });
      surfaces.push({ kind: 'rect', x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2, top, bottom });
    }
    const roof = r.roof ?? (kind === 'void' || (kind === 'room' && r.floor === nF - 1));
    if (roof) pieces.push({ x: cx, z: cz, w, d, y: ceil(r.floor), h: S, material: 'paint', uv: 'floor' });
  }

  // ---------- walls from room edges ----------
  const lines = new Map<string, Line>();
  const addEdge = (floor: number, axis: 'x' | 'z', c: number, a: number, b: number) => {
    const k = `${floor}|${axis}|${Math.round(c * 100)}`;
    let L = lines.get(k);
    if (!L) { L = { floor, axis, c, ivs: [], cuts: [] }; lines.set(k, L); }
    L.ivs.push([Math.min(a, b), Math.max(a, b)]);
  };
  for (const r of cfg.rooms) {
    const kind = r.kind ?? 'room';
    if (!(r.walls ?? kind === 'room')) continue;
    const open = new Set(r.openSides ?? []);
    if (!open.has('top')) addEdge(r.floor, 'x', r.z1, r.x1, r.x2);
    if (!open.has('bottom')) addEdge(r.floor, 'x', r.z2, r.x1, r.x2);
    if (!open.has('left')) addEdge(r.floor, 'z', r.x1, r.z1, r.z2);
    if (!open.has('right')) addEdge(r.floor, 'z', r.x2, r.z1, r.z2);
  }
  lines.forEach((L) => { L.ivs = union(L.ivs); });

  // ---------- openings ----------
  for (const o of cfg.openings ?? []) {
    const axis: 'x' | 'z' | null = Math.abs(o.z1 - o.z2) < EPS ? 'x' : Math.abs(o.x1 - o.x2) < EPS ? 'z' : null;
    if (!axis) { warnings.push(`Opening ${o.type} (${o.x1},${o.z1})-(${o.x2},${o.z2}) is not horizontal or vertical`); continue; }
    const c = axis === 'x' ? o.z1 : o.x1;
    const a = axis === 'x' ? Math.min(o.x1, o.x2) : Math.min(o.z1, o.z2);
    const b = axis === 'x' ? Math.max(o.x1, o.x2) : Math.max(o.z1, o.z2);
    let best: Line | undefined; let bestD = 0.12;
    lines.forEach((L) => {
      if (L.floor !== o.floor || L.axis !== axis) return;
      const dc = Math.abs(L.c - c);
      if (dc < bestD && L.ivs.some(([s, e]) => e > a + EPS && s < b - EPS)) { best = L; bestD = dc; }
    });
    if (!best) { warnings.push(`Opening ${o.type} on floor ${o.floor} at (${o.x1},${o.z1})-(${o.x2},${o.z2}) does not sit on any wall`); continue; }
    const L: Line = best;
    L.ivs = subtract(L.ivs, a, b);
    L.cuts.push(a, b);
    const y = fy(o.floor);
    const top = ceil(o.floor);
    const fill = (y0: number, y1: number) => { if (y1 - y0 > 0.01) solid(linePiece(axis, a, b, L.c, y0, y1 - y0, T, 'paint')); };
    if (o.floor === 0 && y > 0.01) pieces.push(linePiece(axis, a, b, L.c, 0, y, T, 'concrete'));
    switch (o.type) {
      case 'door': {
        const head = o.head ?? 2.1;
        fill(y + head, top);
        doors.push({ axis, a, b, c: L.c, y, h: head, type: 'door', main: !!o.main, floor: o.floor });
        break;
      }
      case 'sliding': {
        const head = o.head ?? 2.4;
        fill(y + head, top);
        doors.push({ axis, a, b, c: L.c, y, h: head, type: 'sliding', main: !!o.main, floor: o.floor, frame: o.frame });
        break;
      }
      case 'window':
      case 'ventilator': {
        const sill = o.sill ?? (o.type === 'window' ? 0.9 : 1.8);
        const head = o.head ?? (o.type === 'window' ? 2.1 : 2.3);
        fill(o.floor === 0 ? y : wallBase(o.floor), y + sill);
        fill(y + head, top);
        glass.push({ axis, a, b, c: L.c, y0: y + sill, y1: y + head, t: T, frame: o.frame });
        obstacles.push(toObstacle(linePiece(axis, a, b, L.c, y + sill, head - sill, T, 'glass')));
        break;
      }
      case 'opening':
        if (o.head != null) fill(y + o.head, top);
        break;
    }
  }

  lines.forEach((L) => {
    for (const [s, e] of L.ivs) {
      if (e - s < 0.02) continue;
      const s2 = L.cuts.some((x) => Math.abs(x - s) < 1e-4) ? s : s - T / 2;
      const e2 = L.cuts.some((x) => Math.abs(x - e) < 1e-4) ? e : e + T / 2;
      const base = wallBase(L.floor);
      solid(linePiece(L.axis, s2, e2, L.c, base, ceil(L.floor) - base, T, 'paint'));
    }
  });

  // ---------- extra walls (half walls, railings, parapets, compound) ----------
  for (const w of cfg.walls ?? []) {
    const f = w.floor ?? 0;
    const axis: 'x' | 'z' | null = Math.abs(w.z1 - w.z2) < EPS ? 'x' : Math.abs(w.x1 - w.x2) < EPS ? 'z' : null;
    if (!axis) { warnings.push(`Extra wall (${w.x1},${w.z1})-(${w.x2},${w.z2}) is not horizontal or vertical`); continue; }
    const y = w.y ?? fy(f);
    const h = w.height ?? ceil(f) - y;
    const material = w.material ?? 'paint';
    const t = w.thickness ?? (material === 'glass' ? 0.04 : 0.15);
    const a = axis === 'x' ? Math.min(w.x1, w.x2) : Math.min(w.z1, w.z2);
    const b = axis === 'x' ? Math.max(w.x1, w.x2) : Math.max(w.z1, w.z2);
    const c = axis === 'x' ? w.z1 : w.x1;
    const p = linePiece(axis, a, b, c, y, h, t, material);
    if (material === 'glass') {
      glass.push({ axis, a, b, c, y0: y, y1: y + h, t });
      obstacles.push(toObstacle({ ...p, w: Math.max(p.w, 0.1), d: Math.max(p.d, 0.1) }));
    } else solid(p);
  }

  // ---------- stairs ----------
  for (const fl of cfg.stairs ?? []) {
    const rise = fl.y1 - fl.y0;
    const mat = fl.material ?? 'granite';
    if (Math.abs(rise) < 1e-3) {
      pieces.push({ x: (fl.x1 + fl.x2) / 2, z: (fl.z1 + fl.z2) / 2, w: fl.x2 - fl.x1, d: fl.z2 - fl.z1, y: fl.y0 - 0.15, h: 0.15, material: mat, uv: 'floor' });
      surfaces.push({ kind: 'rect', x1: fl.x1, z1: fl.z1, x2: fl.x2, z2: fl.z2, top: fl.y0, bottom: fl.y0 - 0.15 });
      continue;
    }
    const n = Math.max(1, Math.round(Math.abs(rise) / 0.17));
    surfaces.push({ kind: 'stair', x1: fl.x1, z1: fl.z1, x2: fl.x2, z2: fl.z2, dir: fl.dir, y0: fl.y0, y1: fl.y1, n });
    const step = Math.abs(rise) / n;
    for (let i = 0; i < n; i++) {
      const [x1, z1, x2, z2] = subRect(fl, i / n, (i + 1) / n);
      const topY = fl.y0 + (rise * (i + 1)) / n;
      pieces.push({ x: (x1 + x2) / 2, z: (z1 + z2) / 2, w: x2 - x1, d: z2 - z1, y: topY - step - 0.12, h: step + 0.12, material: mat, uv: 'floor' });
    }
  }

  // ---------- boxes + furniture ----------
  for (const b of [...(cfg.boxes ?? []), ...expandFurniture(cfg)]) {
    const p: Piece = { x: b.x, z: b.z, w: b.w, d: b.d, y: b.y, h: b.h, material: b.material };
    pieces.push(p);
    if (b.walkable) surfaces.push({ kind: 'rect', x1: b.x - b.w / 2, z1: b.z - b.d / 2, x2: b.x + b.w / 2, z2: b.z + b.d / 2, top: b.y + b.h, bottom: b.y });
    else if (b.collide !== false) obstacles.push(toObstacle(p, b.colH));
  }

  // ---------- plot / compound wall ----------
  if (cfg.plot) {
    const { x1, z1, x2, z2 } = cfg.plot;
    const h = cfg.plot.wallHeight ?? 1.5;
    const mat = cfg.plot.material ?? 'paintGrey';
    const add = (axis: 'x' | 'z', a: number, b: number, c: number) => { if (b - a > 0.05) solid(linePiece(axis, a, b, c, 0, h, 0.2, mat)); };
    add('x', x1, x2, z1);
    add('z', z1, z2, x1);
    add('z', z1, z2, x2);
    let ivs: [number, number][] = [[x1, x2]];
    for (const g of cfg.plot.gates ?? []) ivs = subtract(ivs, g.x1, g.x2);
    for (const [s, e] of ivs) add('x', s, e, z2);
    for (const g of cfg.plot.gates ?? []) {
      for (const gx of [g.x1, g.x2]) solid({ x: gx, z: z2, w: 0.35, d: 0.35, y: 0, h: h + 0.25, material: 'stone' });
    }
  }

  // ---------- plant colliders ----------
  for (const p of cfg.plants ?? []) {
    const y = p.y ?? 0;
    const s = p.scale ?? 1;
    if (p.type === 'palm') obstacles.push({ x1: p.x - 0.18, x2: p.x + 0.18, z1: p.z - 0.18, z2: p.z + 0.18, y0: y, y1: y + 6 });
    if (p.type === 'tree') obstacles.push({ x1: p.x - 0.22 * s, x2: p.x + 0.22 * s, z1: p.z - 0.22 * s, z2: p.z + 0.22 * s, y0: y, y1: y + 4 });
    if (p.type === 'hedge') obstacles.push({ x1: p.x - (p.w ?? 1) / 2, x2: p.x + (p.w ?? 1) / 2, z1: p.z - (p.d ?? 0.6) / 2, z2: p.z + (p.d ?? 0.6) / 2, y0: y, y1: y + 1 });
    if (p.type === 'potted') obstacles.push({ x1: p.x - 0.2, x2: p.x + 0.2, z1: p.z - 0.2, z2: p.z + 0.2, y0: y, y1: y + 1 });
  }

  // ---------- bounds ----------
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of cfg.rooms) { minX = Math.min(minX, r.x1); maxX = Math.max(maxX, r.x2); minZ = Math.min(minZ, r.z1); maxZ = Math.max(maxZ, r.z2); }
  const center: [number, number] = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;

  return { cfg, pieces, obstacles, surfaces, doors, glass, warnings, center, radius };
}

export function subRect(fl: { x1: number; z1: number; x2: number; z2: number; dir: Flight['dir'] }, t0: number, t1: number): [number, number, number, number] {
  const { x1, z1, x2, z2 } = fl;
  const W = x2 - x1, D = z2 - z1;
  switch (fl.dir) {
    case '+x': return [x1 + W * t0, z1, x1 + W * t1, z2];
    case '-x': return [x2 - W * t1, z1, x2 - W * t0, z2];
    case '+z': return [x1, z1 + D * t0, x2, z1 + D * t1];
    default: return [x1, z2 - D * t1, x2, z2 - D * t0];
  }
}
