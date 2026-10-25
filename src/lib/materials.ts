import * as THREE from 'three';
import type { MaterialName } from './types';
import type { Piece } from './world';

// Every texture is painted onto a <canvas> at runtime, so the project works offline
// and has no licensing questions. Swap in Poly Haven textures later for even more realism.

type Draw = (ctx: CanvasRenderingContext2D, S: number, r: () => number) => void;

function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function canvasTexture(draw: Draw, seed: number, S = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  draw(ctx, S, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const speckle = (ctx: CanvasRenderingContext2D, S: number, r: () => number, n: number, rgb: string, a: number, size = 2) => {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${rgb},${a * r()})`;
    ctx.fillRect(r() * S, r() * S, size * r() + 0.5, size * r() + 0.5);
  }
};

const DRAW: Record<string, Draw> = {
  marble: (ctx, S, r) => {
    ctx.fillStyle = '#efe2cc'; ctx.fillRect(0, 0, S, S); // warm cream marble, as in the reference renders
    speckle(ctx, S, r, 6000, '170,145,115', 0.12);
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(160,130,100,${0.08 + r() * 0.12})`;
      ctx.lineWidth = 0.6 + r() * 2.2;
      ctx.beginPath();
      const y = r() * S;
      ctx.moveTo(-10, y);
      ctx.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 200, S * 0.6, y + (r() - 0.5) * 200, S + 10, y + (r() - 0.5) * 120);
      ctx.stroke();
    }
    ctx.strokeStyle = '#dccbb0'; ctx.lineWidth = 2;
    for (const p of [0, S / 2]) { ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke(); }
  },
  tile: (ctx, S, r) => {
    ctx.fillStyle = '#d8d2c8'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = `hsl(35, 12%, ${76 + r() * 6}%)`;
      ctx.fillRect(i * S / 4 + 2, j * S / 4 + 2, S / 4 - 4, S / 4 - 4);
    }
    speckle(ctx, S, r, 3000, '120,110,100', 0.1);
  },
  bathTile: (ctx, S, r) => {
    ctx.fillStyle = '#b8c0c3'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      ctx.fillStyle = `hsl(195, 8%, ${80 + r() * 6}%)`;
      ctx.fillRect(i * S / 8 + 2, j * S / 4 + 2, S / 8 - 4, S / 4 - 4);
    }
  },
  wood: (ctx, S, r) => {
    const rows = 6;
    for (let row = 0; row < rows; row++) {
      let x = -r() * S;
      while (x < S) {
        const len = S * (0.5 + r() * 0.7);
        ctx.fillStyle = `hsl(${26 + r() * 8}, ${38 + r() * 12}%, ${34 + r() * 12}%)`;
        ctx.fillRect(x, (row * S) / rows, len, S / rows);
        for (let g = 0; g < 18; g++) {
          ctx.strokeStyle = `rgba(40,22,10,${0.05 + r() * 0.1})`;
          ctx.lineWidth = 0.5 + r();
          const gy = (row * S) / rows + r() * (S / rows);
          ctx.beginPath(); ctx.moveTo(x, gy); ctx.bezierCurveTo(x + len / 3, gy + (r() - 0.5) * 6, x + (2 * len) / 3, gy + (r() - 0.5) * 6, x + len, gy); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(20,10,5,0.5)'; ctx.fillRect(x, (row * S) / rows, 1.5, S / rows);
        x += len;
      }
      ctx.fillStyle = 'rgba(20,10,5,0.45)'; ctx.fillRect(0, (row * S) / rows, S, 1.5);
    }
  },
  grass: (ctx, S, r) => {
    ctx.fillStyle = '#4c7a2c'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 14000; i++) {
      ctx.strokeStyle = `hsl(${85 + r() * 30}, ${45 + r() * 20}%, ${22 + r() * 22}%)`;
      ctx.lineWidth = 1;
      const x = r() * S, y = r() * S;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6); ctx.stroke();
    }
  },
  paving: (ctx, S, r) => {
    ctx.fillStyle = '#8f877c'; ctx.fillRect(0, 0, S, S);
    const n = 3;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = `hsl(${30 + r() * 15}, ${10 + r() * 8}%, ${58 + r() * 10}%)`;
      ctx.fillRect(i * S / n + 3, j * S / n + 3, S / n - 6, S / n - 6);
    }
    speckle(ctx, S, r, 8000, '60,55,50', 0.18);
  },
  stone: (ctx, S, r) => {
    ctx.fillStyle = '#3d3a37'; ctx.fillRect(0, 0, S, S);
    let y = 0;
    while (y < S) {
      const h = 14 + r() * 26;
      let x = -r() * 80;
      while (x < S) {
        const w = 50 + r() * 120;
        ctx.fillStyle = `hsl(${25 + r() * 20}, ${6 + r() * 8}%, ${30 + r() * 22}%)`;
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        x += w;
      }
      y += h;
    }
    speckle(ctx, S, r, 5000, '0,0,0', 0.2);
  },
  plaster: (ctx, S, r) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, r, 9000, '0,0,0', 0.035, 3);
  },
  concrete: (ctx, S, r) => {
    ctx.fillStyle = '#a7a39c'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, r, 12000, '40,40,40', 0.12, 3);
    speckle(ctx, S, r, 4000, '255,255,255', 0.1, 2);
  },
  granite: (ctx, S, r) => {
    ctx.fillStyle = '#2a2826'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, r, 20000, '200,190,180', 0.35, 2);
    speckle(ctx, S, r, 6000, '120,60,40', 0.3, 2);
  },
  fabric: (ctx, S, r) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 3) { ctx.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`; ctx.fillRect(0, i, S, 1); ctx.fillRect(i, 0, 1, S); }
  },
};

interface Def {
  color: string; rough: number; metal?: number;
  tex?: keyof typeof DRAW; size?: number; // texture covers `size` meters
  emissive?: string; emissiveIntensity?: number;
}

const DEFS: Record<MaterialName, Def> = {
  paint: { color: '#f4f1ea', rough: 0.92, tex: 'plaster', size: 2 },
  paintWarm: { color: '#e9dcc8', rough: 0.9, tex: 'plaster', size: 2 },
  paintGrey: { color: '#9c9a96', rough: 0.9, tex: 'plaster', size: 2 },
  stone: { color: '#ffffff', rough: 0.85, tex: 'stone', size: 1.2 },
  wood: { color: '#ffffff', rough: 0.6, tex: 'wood', size: 1.2 },
  darkWood: { color: '#7a6a5e', rough: 0.55, tex: 'wood', size: 1.2 },
  doorWood: { color: '#ffffff', rough: 0.5, tex: 'wood', size: 1.0 },
  marble: { color: '#f6e4c8', rough: 0.18, tex: 'marble', size: 1.2 },
  tile: { color: '#ffffff', rough: 0.35, tex: 'tile', size: 1.2 },
  bathTile: { color: '#ffffff', rough: 0.25, tex: 'bathTile', size: 1.2 },
  grass: { color: '#ffffff', rough: 0.95, tex: 'grass', size: 2.5 },
  paving: { color: '#ffffff', rough: 0.85, tex: 'paving', size: 1.8 },
  concrete: { color: '#ffffff', rough: 0.9, tex: 'concrete', size: 2 },
  granite: { color: '#ffffff', rough: 0.25, tex: 'granite', size: 1.2 },
  metal: { color: '#c9ccce', rough: 0.25, metal: 1 },
  blackMetal: { color: '#1d1f22', rough: 0.4, metal: 0.8 },
  glass: { color: '#cfe6ee', rough: 0.05 },
  mirror: { color: '#e7eef2', rough: 0.02, metal: 1 },
  screen: { color: '#0b0c0f', rough: 0.15, metal: 0.4 },
  fabric: { color: '#c8bfae', rough: 0.95, tex: 'fabric', size: 0.6 },
  fabricDark: { color: '#5a6470', rough: 0.95, tex: 'fabric', size: 0.6 },
  mattress: { color: '#f3f0ea', rough: 0.95, tex: 'fabric', size: 0.6 },
  white: { color: '#f7f7f5', rough: 0.3 },
  red: { color: '#b3261e', rough: 0.3, metal: 0.4 },
  solar: { color: '#1a2a4d', rough: 0.15, metal: 0.6 },
  leaf: { color: '#3f6e2a', rough: 0.8 },
  water: { color: '#3aa6d0', rough: 0.05 },
  lamp: { color: '#fff4dd', rough: 0.5, emissive: '#ffd79a', emissiveIntensity: 1.5 },
  none: { color: '#000000', rough: 1 },
  sage: { color: '#7d8a62', rough: 0.95, tex: 'fabric', size: 0.6 },
  rattan: { color: '#c79a62', rough: 0.85, tex: 'fabric', size: 0.25 },
  crystal: { color: '#fff1d0', rough: 0.1, metal: 0.3, emissive: '#ffcf7a', emissiveIntensity: 1.5 },
  walnut: { color: '#8a5a3a', rough: 0.5, tex: 'wood', size: 1.0 },
  cushion: { color: '#e9e1d2', rough: 0.95, tex: 'fabric', size: 0.5 },
};

const baseTextures = new Map<string, THREE.CanvasTexture>();
const cache = new Map<string, THREE.Material>();

function baseTexture(name: keyof typeof DRAW) {
  let t = baseTextures.get(name);
  if (!t) { t = canvasTexture(DRAW[name], name.length * 97 + 13); baseTextures.set(name, t); }
  return t;
}

export function getMaterial(name: MaterialName, repeatX = 1, repeatY = 1): THREE.Material {
  const def = DEFS[name] ?? DEFS.paint;
  const rx = Math.max(0.25, Math.round(repeatX * 4) / 4);
  const ry = Math.max(0.25, Math.round(repeatY * 4) / 4);
  const key = def.tex ? `${name}|${rx}|${ry}` : name;
  const hit = cache.get(key);
  if (hit) return hit;
  let m: THREE.Material;
  if (name === 'glass') {
    m = new THREE.MeshPhysicalMaterial({
      color: def.color, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22,
      envMapIntensity: 1.6, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
    });
  } else if (name === 'water') {
    m = new THREE.MeshPhysicalMaterial({ color: def.color, roughness: 0.05, transparent: true, opacity: 0.8, clearcoat: 1 });
  } else {
    const std = new THREE.MeshStandardMaterial({ color: def.color, roughness: def.rough, metalness: def.metal ?? 0 });
    if (def.tex) {
      const t = baseTexture(def.tex).clone();
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      std.map = t;
    }
    if (def.emissive) { std.emissive = new THREE.Color(def.emissive); std.emissiveIntensity = def.emissiveIntensity ?? 1; }
    m = std;
  }
  cache.set(key, m);
  return m;
}

export function materialForPiece(p: Piece): THREE.Material {
  const def = DEFS[p.material];
  if (!def?.tex) return getMaterial(p.material);
  const size = def.size ?? 1;
  if (p.uv === 'floor') return getMaterial(p.material, p.w / size, p.d / size);
  return getMaterial(p.material, Math.max(p.w, p.d) / size, p.h / size);
}

/** Night mode dims the emissive lamps' surroundings; lamps glow brighter. */
export function setLampGlow(intensity: number) {
  cache.forEach((m, k) => {
    if ((k === 'lamp' || k === 'crystal') && m instanceof THREE.MeshStandardMaterial) m.emissiveIntensity = intensity;
  });
}
