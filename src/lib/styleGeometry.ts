// Turns an exterior style (src/data/styles/*.json) into merged, world-space geometry.
// Nothing here touches the plan: skins come from world.skins, everything else is new façade.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ElementDef, MaterialName, RoofDef, Role, StyleDef, WallZone } from './types';
import type { Obstacle, Piece, World } from './world';
import { texSize } from './materials';

/** Material used for a role when a style does not set it. */
export const ROLE_DEFAULT: Record<Role, MaterialName> = {
  wallMain: 'paint', wallAccent1: 'exposedConcrete', wallAccent2: 'laterite', plinth: 'paint', fascia: 'paint',
  soffit: 'timberSoffit', windowFrame: 'teak', doorMain: 'teak', railing: 'blackMetal', compoundWall: 'paint', paving: 'paverGrass',
};
export const roleMaterial = (s: StyleDef, r: Role): MaterialName => s.materials[r] ?? ROLE_DEFAULT[r];

export interface StyleGeometry {
  /** merged geometry per material */
  byMaterial: Map<MaterialName, THREE.BufferGeometry>;
  /** creeper curtains (geometry with a 'sway' attribute, 0 at the top to 1 at the tip) */
  creepers: THREE.BufferGeometry | null;
  obstacles: Obstacle[];
}

type Acc = Map<MaterialName, THREE.BufferGeometry[]>;
const push = (acc: Acc, m: MaterialName, g: THREE.BufferGeometry) => { const l = acc.get(m) ?? []; l.push(g); acc.set(m, l); };

/** Box from its centre/size, texture tiled by the material's real-world size. */
function boxGeo(x: number, y: number, z: number, w: number, h: number, d: number, m: MaterialName, floorUv = false) {
  const g = new THREE.BoxGeometry(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3));
  const size = texSize(m);
  if (size) {
    const rx = floorUv ? w / size : Math.max(w, d) / size, ry = floorUv ? d / size : h / size;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
  }
  g.translate(x, y, z);
  return g;
}

// ---------------------------------------------------------------- skins + wall zones
function zoned(skin: Piece, zones: WallZone[]): Piece[] {
  let parts: Piece[] = [skin];
  for (const z of zones) {
    if (z.face !== skin.face || (z.floor !== undefined && z.floor !== skin.floor)) continue;
    const next: Piece[] = [];
    for (const p of parts) {
      const alongX = p.w >= p.d;
      const a0 = (alongX ? p.x - p.w / 2 : p.z - p.d / 2), a1 = a0 + (alongX ? p.w : p.d);
      const lo = Math.max(a0, Math.min(z.from, z.to)), hi = Math.min(a1, Math.max(z.from, z.to));
      const y0 = Math.max(p.y, z.y0 ?? -Infinity), y1 = Math.min(p.y + p.h, z.y1 ?? Infinity);
      if (hi - lo < 1e-3 || y1 - y0 < 1e-3) { next.push(p); continue; }
      const seg = (s0: number, s1: number, b0: number, b1: number, role?: Role): Piece | null => {
        if (s1 - s0 < 1e-3 || b1 - b0 < 1e-3) return null;
        return alongX
          ? { ...p, x: (s0 + s1) / 2, w: s1 - s0, y: b0, h: b1 - b0, role: role ?? p.role }
          : { ...p, z: (s0 + s1) / 2, d: s1 - s0, y: b0, h: b1 - b0, role: role ?? p.role };
      };
      [seg(a0, lo, p.y, p.y + p.h), seg(hi, a1, p.y, p.y + p.h),               // outside the zone along the wall
        seg(lo, hi, p.y, y0), seg(lo, hi, y1, p.y + p.h),                       // above / below it
        seg(lo, hi, y0, y1, z.role)].forEach((q) => { if (q) next.push(q); });
    }
    parts = next;
  }
  return parts;
}

// ---------------------------------------------------------------- roofs
/** A slab of thickness t lying on the segment (u0,y0)-(u1,y1) in the cross-section, extruded from w0 to w1. */
function slopedSlab(axis: 'x' | 'z', u0: number, y0: number, u1: number, y1: number, w0: number, w1: number, t: number, m: MaterialName, offset = 0) {
  const len = Math.hypot(u1 - u0, y1 - y0), ang = Math.atan2(y1 - y0, u1 - u0);
  const size = texSize(m);
  const g = new THREE.BoxGeometry(len, t, w1 - w0);
  if (size) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / size), uv.getY(i) * ((w1 - w0) / size));
  }
  // centre of the slab sits t/2 (plus offset) above the line
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  g.rotateZ(ang);
  const cu = (u0 + u1) / 2 + nx * (t / 2 + offset), cy = (y0 + y1) / 2 + ny * (t / 2 + offset);
  if (axis === 'z') g.translate(cu, cy, (w0 + w1) / 2);
  else { g.rotateY(-Math.PI / 2); g.translate((w0 + w1) / 2, cy, cu); }
  return g;
}

function triangle(pts: [number, number][], axis: 'x' | 'z', w: number, depth: number) {
  const shape = new THREE.Shape(pts.map(([u, y]) => new THREE.Vector2(u, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  // ridge along x: turn the section so u runs along z (a rotation, not a mirror, so normals stay right)
  if (axis === 'x') { g.rotateY(-Math.PI / 2); g.translate(w, 0, 0); } else g.translate(0, 0, w);
  return g;
}

function buildRoof(acc: Acc, r: RoofDef) {
  const t = r.thickness ?? 0.2, o = r.overhang ?? 0.6, of = r.overhangFront ?? o;
  const soffit = r.soffitMaterial;
  if (r.type === 'flat') {
    const layers = Math.max(1, r.fasciaLayers ?? 1);
    for (let i = 0; i < layers; i++) {
      const g = o + i * 0.18, gf = of + i * 0.18, th = layers > 1 ? 0.14 : t;
      const y = r.baseY + i * (th + 0.1);
      const m = i === 0 ? r.material : (r.fasciaMaterial ?? r.material);
      const x1 = r.rect.x1 - g, x2 = r.rect.x2 + g, z1 = r.rect.z1 - g, z2 = r.rect.z2 + gf;
      push(acc, m, boxGeo((x1 + x2) / 2, y + th / 2, (z1 + z2) / 2, x2 - x1, th, z2 - z1, m, true));
      if (i < layers - 1) push(acc, r.fasciaMaterial ?? r.material, boxGeo((x1 + x2) / 2, y + th + 0.05, (z1 + z2) / 2, x2 - x1 - 0.5, 0.1, z2 - z1 - 0.5, r.material));
    }
    if (soffit) {
      const x1 = r.rect.x1 - o, x2 = r.rect.x2 + o, z1 = r.rect.z1 - o, z2 = r.rect.z2 + of;
      push(acc, soffit, boxGeo((x1 + x2) / 2, r.baseY - 0.012, (z1 + z2) / 2, x2 - x1 - 0.02, 0.02, z2 - z1 - 0.02, soffit, true));
    }
    return;
  }
  // gable / skillion: the cross-section runs across the ridge
  const axis = r.ridgeAxis ?? 'z';                  // ridge along z => slopes fall towards -x / +x
  const u1 = axis === 'z' ? r.rect.x1 : r.rect.z1, u2 = axis === 'z' ? r.rect.x2 : r.rect.z2;
  const w1 = (axis === 'z' ? r.rect.z1 : r.rect.x1) - o;
  const w2 = (axis === 'z' ? r.rect.z2 + of : r.rect.x2 + o);
  const tan = Math.tan(((r.pitchDeg ?? 30) * Math.PI) / 180);
  const planes: { a: [number, number]; b: [number, number] }[] = [];
  let ridgeU = 0, ridgeY = 0;
  if (r.type === 'gable') {
    ridgeU = (u1 + u2) / 2 + (r.ridgeOffset ?? 0) * (u2 - u1);
    ridgeY = r.baseY + (ridgeU - u1) * tan;
    const tanR = (ridgeY - r.baseY) / Math.max(0.1, u2 - ridgeU);
    planes.push({ a: [u1 - o, r.baseY - o * tan], b: [ridgeU, ridgeY] });
    planes.push({ a: [ridgeU, ridgeY], b: [u2 + o, r.baseY - o * tanR] });
  } else {
    const lowFirst = r.lowSide === '-x' || r.lowSide === '-z';
    const rise = (u2 - u1) * tan;
    planes.push(lowFirst
      ? { a: [u1 - o, r.baseY - o * tan], b: [u2 + o, r.baseY + rise + o * tan] }
      : { a: [u1 - o, r.baseY + rise + o * tan], b: [u2 + o, r.baseY - o * tan] });
    ridgeU = lowFirst ? u2 : u1; ridgeY = r.baseY + rise;
  }
  for (const pl of planes) {
    push(acc, r.material, slopedSlab(axis, pl.a[0], pl.a[1], pl.b[0], pl.b[1], w1, w2, t, r.material));
    if (soffit) push(acc, soffit, slopedSlab(axis, pl.a[0], pl.a[1], pl.b[0], pl.b[1], w1 + 0.01, w2 - 0.01, 0.02, soffit, -0.022));
    if (r.bargeMaterial) for (const w of [w1, w2]) push(acc, r.bargeMaterial, slopedSlab(axis, pl.a[0], pl.a[1] - 0.05, pl.b[0], pl.b[1] - 0.05, w - 0.03, w + 0.03, t + 0.12, r.bargeMaterial));
    if (r.rafters) {
      const rm = r.rafterMaterial ?? 'darkWood';
      const n = Math.max(2, Math.round((w2 - w1) / 0.6));
      for (let i = 0; i <= n; i++) {
        const w = w1 + 0.06 + ((w2 - w1 - 0.12) * i) / n;
        push(acc, rm, slopedSlab(axis, pl.a[0], pl.a[1], pl.b[0], pl.b[1], w - 0.04, w + 0.04, 0.14, rm, -0.15));
      }
      // edge purlins along the eave and mid-slope
      for (const f of [0.03, 0.5]) {
        const u = pl.a[0] + (pl.b[0] - pl.a[0]) * f, y = pl.a[1] + (pl.b[1] - pl.a[1]) * f - 0.16;
        push(acc, rm, axis === 'z' ? boxGeo(u, y, (w1 + w2) / 2, 0.1, 0.12, w2 - w1, rm) : boxGeo((w1 + w2) / 2, y, u, w2 - w1, 0.12, 0.1, rm));
      }
    }
  }
  // gable ends: triangles at both ends, on the wall line
  if (r.type === 'gable' && r.gableInfill && r.gableInfill !== 'open') {
    const tri: [number, number][] = [[u1, r.baseY], [ridgeU, ridgeY - 0.02], [u2, r.baseY]];
    const ends = axis === 'z' ? [r.rect.z1, r.rect.z2] : [r.rect.x1, r.rect.x2];
    const heightAt = (u: number) => (u <= ridgeU ? r.baseY + (u - u1) / (ridgeU - u1) * (ridgeY - r.baseY) : r.baseY + (u2 - u) / (u2 - ridgeU) * (ridgeY - r.baseY));
    for (const e of ends) {
      if (r.gableInfill === 'glass') {
        push(acc, 'glass', triangle(tri, axis, e, 0.03));
        const fm = r.infillMaterial ?? 'blackMetal';
        const n = Math.max(2, Math.round((u2 - u1) / 0.9));
        for (let i = 1; i < n; i++) {
          const u = u1 + ((u2 - u1) * i) / n, h = heightAt(u) - r.baseY;
          push(acc, fm, axis === 'z' ? boxGeo(u, r.baseY + h / 2, e, 0.05, h, 0.06, fm) : boxGeo(e, r.baseY + h / 2, u, 0.06, h, 0.05, fm));
        }
        const hb = (ridgeY - r.baseY) * 0.45;
        push(acc, fm, axis === 'z' ? boxGeo((u1 + u2) / 2, r.baseY + hb, e, (u2 - u1) * 0.55, 0.05, 0.06, fm) : boxGeo(e, r.baseY + hb, (u1 + u2) / 2, 0.06, 0.05, (u2 - u1) * 0.55, fm));
      } else {
        push(acc, r.infillMaterial ?? 'paint', triangle(tri, axis, e, 0.2));
        if (r.gableInfill === 'louvers') {
          const lm = r.louverMaterial ?? 'darkWood';
          const half = Math.min(0.9, (u2 - u1) * 0.18);
          const n = Math.round((half * 2) / 0.12);
          const out = e === ends[1] ? 0.13 : -0.13;
          for (let i = 0; i <= n; i++) {
            const u = ridgeU - half + (2 * half * i) / n, h = heightAt(u) - r.baseY - 0.05;
            push(acc, lm, axis === 'z' ? boxGeo(u, r.baseY + h / 2, e + out, 0.05, h, 0.12, lm) : boxGeo(e + out, r.baseY + h / 2, u, 0.12, h, 0.05, lm));
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------- façade elements
function buildElement(acc: Acc, cyl: Acc, obstacles: Obstacle[], e: ElementDef, creepers: THREE.BufferGeometry[]) {
  switch (e.type) {
    case 'box': {
      push(acc, e.material, boxGeo(e.x, e.y + e.h / 2, e.z, e.w, e.h, e.d, e.material, e.w > e.h * 3 && e.d > e.h * 3));
      if (e.collide) obstacles.push({ x1: e.x - e.w / 2, x2: e.x + e.w / 2, z1: e.z - e.d / 2, z2: e.z + e.d / 2, y0: e.y, y1: e.y + Math.max(e.h, e.colH ?? 0) });
      break;
    }
    case 'louvers': {
      const len = Math.hypot(e.x2 - e.x1, e.z2 - e.z1), ux = (e.x2 - e.x1) / len, uz = (e.z2 - e.z1) / len;
      const slat = e.slat ?? 0.05, depth = e.depth ?? 0.12;
      const alongX = Math.abs(ux) > Math.abs(uz);
      if (e.dir === 'vertical') {
        for (let i = 0; i < e.count; i++) {
          const f = e.count === 1 ? 0.5 : i / (e.count - 1);
          const x = e.x1 + (e.x2 - e.x1) * f, z = e.z1 + (e.z2 - e.z1) * f;
          push(acc, e.material, alongX ? boxGeo(x, (e.y0 + e.y1) / 2, z, slat, e.y1 - e.y0, depth, e.material) : boxGeo(x, (e.y0 + e.y1) / 2, z, depth, e.y1 - e.y0, slat, e.material));
        }
      } else {
        const cx = (e.x1 + e.x2) / 2, cz = (e.z1 + e.z2) / 2;
        for (let i = 0; i < e.count; i++) {
          const y = e.y0 + ((e.y1 - e.y0) * (i + 0.5)) / e.count;
          push(acc, e.material, alongX ? boxGeo(cx, y, cz, len, slat, depth, e.material) : boxGeo(cx, y, cz, depth, slat, len, e.material));
        }
      }
      if (e.collide) obstacles.push({ x1: Math.min(e.x1, e.x2) - depth / 2, x2: Math.max(e.x1, e.x2) + depth / 2, z1: Math.min(e.z1, e.z2) - depth / 2, z2: Math.max(e.z1, e.z2) + depth / 2, y0: e.y0, y1: e.y1 });
      break;
    }
    case 'boxFrame': {
      const c0 = e.c, c1 = e.c + e.outward * e.depth, cm = (c0 + c1) / 2, th = e.thickness, L = e.a2 - e.a1, H = e.y1 - e.y0;
      const put = (a: number, y: number, la: number, h: number) => push(acc, e.material, e.axis === 'x' ? boxGeo(a, y, cm, la, h, e.depth, e.material) : boxGeo(cm, y, a, e.depth, h, la, e.material));
      put((e.a1 + e.a2) / 2, e.y1 - th / 2, L, th);
      put((e.a1 + e.a2) / 2, e.y0 + th / 2, L, th);
      put(e.a1 + th / 2, e.y0 + H / 2, th, H - 2 * th);
      put(e.a2 - th / 2, e.y0 + H / 2, th, H - 2 * th);
      if (e.back) push(acc, e.back, e.axis === 'x' ? boxGeo((e.a1 + e.a2) / 2, e.y0 + H / 2, c0 + e.outward * 0.03, L - 2 * th, H - 2 * th, 0.04, e.back) : boxGeo(c0 + e.outward * 0.03, e.y0 + H / 2, (e.a1 + e.a2) / 2, 0.04, H - 2 * th, L - 2 * th, e.back));
      break;
    }
    case 'column': {
      const g = new THREE.CylinderGeometry(e.r, e.r, e.h, 16);
      g.translate(e.x, e.y + e.h / 2, e.z);
      push(cyl, e.material, g);
      if (e.baseMaterial) { const b = new THREE.CylinderGeometry(e.r * 1.35, e.r * 1.35, 0.3, 16); b.translate(e.x, e.y + 0.15, e.z); push(cyl, e.baseMaterial, b); }
      if (e.collide) obstacles.push({ x1: e.x - e.r, x2: e.x + e.r, z1: e.z - e.r, z2: e.z + e.r, y0: e.y, y1: e.y + e.h });
      break;
    }
    case 'railing': {
      const len = Math.hypot(e.x2 - e.x1, e.z2 - e.z1), alongX = Math.abs(e.x2 - e.x1) >= Math.abs(e.z2 - e.z1);
      const cx = (e.x1 + e.x2) / 2, cz = (e.z1 + e.z2) / 2;
      push(acc, e.material, alongX ? boxGeo(cx, e.y + e.h - 0.025, cz, len, 0.05, 0.06, e.material) : boxGeo(cx, e.y + e.h - 0.025, cz, 0.06, 0.05, len, e.material));
      push(acc, e.material, alongX ? boxGeo(cx, e.y + 0.1, cz, len, 0.04, 0.04, e.material) : boxGeo(cx, e.y + 0.1, cz, 0.04, 0.04, len, e.material));
      const n = e.balusters ? Math.round(len / 0.12) : (e.posts ?? Math.max(2, Math.round(len / 1.2)));
      for (let i = 0; i <= n; i++) {
        const f = i / n, x = e.x1 + (e.x2 - e.x1) * f, z = e.z1 + (e.z2 - e.z1) * f, s = e.balusters ? 0.025 : 0.05;
        push(acc, e.material, boxGeo(x, e.y + e.h / 2, z, s, e.h, s, e.material));
      }
      break;
    }
    case 'creeper': {
      // thin strands of small leaves; 'sway' = 0 at the top, 1 at the tip (vertex shader)
      let seed = Math.round(e.a1 * 97 + e.c * 31) || 1;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const density = e.density ?? 22, axis = e.axis ?? 'x';
      const n = Math.round((e.a2 - e.a1) * density);
      const pos: number[] = [], sway: number[] = [], nrm: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = e.a1 + (e.a2 - e.a1) * (i + rnd()) / n, len = e.minLen + (e.maxLen - e.minLen) * rnd();
        const off = (rnd() - 0.5) * 0.12;
        for (let y = 0; y < len; y += 0.075) {
          const k = y / Math.max(len, 0.01), s = 0.035 + 0.02 * rnd(), tilt = (rnd() - 0.5) * 0.06;
          const px = axis === 'x' ? a + tilt : e.c + off, pz = axis === 'x' ? e.c + off : a + tilt, py = e.y - y;
          // a leaf: two triangles in the wall plane
          const quad = axis === 'x'
            ? [[px - s, py, pz], [px + s, py, pz], [px + s, py - s * 1.6, pz], [px - s, py, pz], [px + s, py - s * 1.6, pz], [px - s, py - s * 1.6, pz]]
            : [[px, py, pz - s], [px, py, pz + s], [px, py - s * 1.6, pz + s], [px, py, pz - s], [px, py - s * 1.6, pz + s], [px, py - s * 1.6, pz - s]];
          for (const q of quad) { pos.push(...q); sway.push(k); nrm.push(axis === 'x' ? 0 : 1, 0, axis === 'x' ? 1 : 0); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
      creepers.push(g);
      break;
    }
  }
}

/** Build (once, then cache) everything a style adds to the house. */
export function buildStyleGeometry(world: World, style: StyleDef): StyleGeometry {
  const acc: Acc = new Map(), cyl: Acc = new Map(), obstacles: Obstacle[] = [], creepers: THREE.BufferGeometry[] = [];
  // outer skins with this style's zones and role materials, + the compound wall
  const rolePieces = [...world.skins.flatMap((s) => zoned(s, style.wallZones)), ...world.pieces.filter((p) => p.role === 'compoundWall')];
  for (const p of rolePieces) {
    const m = roleMaterial(style, p.role ?? 'wallMain');
    push(acc, m, boxGeo(p.x, p.y + p.h / 2, p.z, p.w, p.h, p.d, m));
  }
  for (const r of style.roofs) buildRoof(acc, r);
  for (const e of style.elements) buildElement(acc, cyl, obstacles, e, creepers);
  // trunks, hedges and pots of the style's landscaping block the player (same sizes as the plan's plants)
  for (const p of style.landscape.plants) {
    const y = p.y ?? 0, s = p.scale ?? 1;
    const r = p.type === 'palm' ? 0.18 : p.type === 'tree' ? 0.22 * s : p.type === 'rainTree' ? 0.32 * s : p.type === 'potted' ? 0.2 : 0;
    if (r) obstacles.push({ x1: p.x - r, x2: p.x + r, z1: p.z - r, z2: p.z + r, y0: y, y1: y + 4 });
    if (p.type === 'hedge') obstacles.push({ x1: p.x - (p.w ?? 1) / 2, x2: p.x + (p.w ?? 1) / 2, z1: p.z - (p.d ?? 0.6) / 2, z2: p.z + (p.d ?? 0.6) / 2, y0: y, y1: y + 1 });
  }
  const byMaterial = new Map<MaterialName, THREE.BufferGeometry>();
  const merge = (m: MaterialName, list: THREE.BufferGeometry[]) => {
    const ni = list.map((g) => (g.index ? g.toNonIndexed() : g));
    ni.forEach((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); });
    const prev = byMaterial.get(m);
    const merged = mergeGeometries(prev ? [prev, ...ni] : ni, false);
    list.forEach((g) => g.dispose()); ni.forEach((g) => g.dispose());
    if (merged) byMaterial.set(m, merged);
  };
  acc.forEach((list, m) => merge(m, list));
  cyl.forEach((list, m) => merge(m, list));
  const creeperGeo = creepers.length ? mergeGeometries(creepers, false) : null;
  creepers.forEach((g) => g.dispose());
  return { byMaterial, creepers: creeperGeo, obstacles };
}
