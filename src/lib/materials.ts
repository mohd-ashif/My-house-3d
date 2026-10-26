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

/** Texture resolution factor: low-tier devices get half-size canvases. */
let detail = 1;
export function setTextureDetail(d: number) { detail = d; }

function canvasTexture(draw: Draw, seed: number, S = Math.round(512 * detail)): THREE.CanvasTexture {
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
  stoneTile: (ctx, S, r) => {
    // large-format grey textured stone, 2 x 2 tiles per texture
    ctx.fillStyle = '#6f6c68'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = `hsl(30, 3%, ${52 + r() * 10}%)`;
      ctx.fillRect(i * S / 2 + 2, j * S / 2 + 2, S / 2 - 4, S / 2 - 4);
    }
    speckle(ctx, S, r, 16000, '40,40,40', 0.16, 3);
    speckle(ctx, S, r, 6000, '235,235,230', 0.14, 3);
    for (let k = 0; k < 10; k++) {
      ctx.strokeStyle = `rgba(250,250,245,${0.08 + r() * 0.12})`; ctx.lineWidth = 0.6 + r() * 1.5;
      ctx.beginPath(); const y = r() * S; ctx.moveTo(0, y); ctx.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 160, S * 0.7, y + (r() - 0.5) * 160, S, y + (r() - 0.5) * 90); ctx.stroke();
    }
  },
  jali: (ctx, S) => {
    // terracotta CNC lattice: square openings (transparent, see getMaterial) with an inner diamond
    ctx.fillStyle = '#a5442a'; ctx.fillRect(0, 0, S, S);
    const n = 4, cell = S / n, bar = cell * 0.18;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = i * cell + bar / 2, y = j * cell + bar / 2, w = cell - bar;
      ctx.clearRect(x, y, w, w);
      ctx.fillStyle = '#a5442a';
      const m = w * 0.32;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + m); ctx.lineTo(x + w - m, y + w / 2); ctx.lineTo(x + w / 2, y + w - m); ctx.lineTo(x + m, y + w / 2); ctx.closePath(); ctx.fill();
    }
  },
  paverGrass: (ctx, S, r) => {
    // large grey pavers with grass joints, like the forecourt in the render
    ctx.fillStyle = '#4f7a2e'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = `hsl(28, 6%, ${62 + r() * 8}%)`;
      ctx.fillRect(i * S / 2 + 7, j * S / 2 + 7, S / 2 - 14, S / 2 - 14);
    }
    speckle(ctx, S, r, 9000, '60,55,50', 0.12);
  },
  exposedConcrete: (ctx, S, r) => {
    // board-formed concrete: warm light grey, 8 horizontal board marks, tie holes
    ctx.fillStyle = '#b8b2a9'; ctx.fillRect(0, 0, S, S);
    const boards = 8;
    for (let b = 0; b < boards; b++) {
      ctx.fillStyle = `hsl(35, ${4 + r() * 4}%, ${66 + r() * 7}%)`;
      ctx.fillRect(0, (b * S) / boards, S, S / boards);
      for (let g = 0; g < 10; g++) {
        ctx.strokeStyle = `rgba(90,80,70,${0.04 + r() * 0.06})`; ctx.lineWidth = 0.6 + r() * 1.4;
        const y = (b * S) / boards + r() * (S / boards);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(S / 3, y + (r() - 0.5) * 4, (2 * S) / 3, y + (r() - 0.5) * 4, S, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(70,64,58,.35)'; ctx.fillRect(0, (b * S) / boards, S, 1.5);
    }
    speckle(ctx, S, r, 9000, '60,55,50', 0.12, 2);
    speckle(ctx, S, r, 3000, '255,255,250', 0.12, 2);
    ctx.fillStyle = 'rgba(60,55,50,.45)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.arc((i + 0.5) * S / 4, (j + 0.5) * S / 4, S / 140, 0, Math.PI * 2); ctx.fill(); }
  },
  laterite: (ctx, S, r) => {
    // laterite blocks: warm orange-red, porous, staggered 2:1 courses
    ctx.fillStyle = '#7c3a24'; ctx.fillRect(0, 0, S, S);
    const rows = 8, cols = 4, bh = S / rows, bw = S / cols;
    for (let j = 0; j < rows; j++) for (let i = -1; i < cols; i++) {
      const x = i * bw + (j % 2 ? bw / 2 : 0);
      ctx.fillStyle = `hsl(${12 + r() * 10}, ${48 + r() * 14}%, ${38 + r() * 10}%)`;
      ctx.fillRect(x + 2, j * bh + 2, bw - 4, bh - 4);
      for (let k = 0; k < 60; k++) {
        ctx.fillStyle = `rgba(${40 + r() * 30},${15 + r() * 10},8,${0.25 + r() * 0.4})`;
        ctx.beginPath(); ctx.arc(x + 2 + r() * (bw - 4), j * bh + 2 + r() * (bh - 4), 0.6 + r() * 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }
    speckle(ctx, S, r, 5000, '230,170,120', 0.12, 2);
  },
  darkGranite: (ctx, S, r) => {
    ctx.fillStyle = '#2b2b2d'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, r, 22000, '150,150,155', 0.22, 2);
    speckle(ctx, S, r, 8000, '10,10,12', 0.4, 2);
    ctx.strokeStyle = '#1c1c1e'; ctx.lineWidth = 2;
    for (const p of [0, S / 2]) { ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
  },
  clayTile: (ctx, S, r) => {
    // Mangalore clay tiles: rows of curved tiles, each with its own tone, shaded for curvature
    ctx.fillStyle = '#5a2414'; ctx.fillRect(0, 0, S, S);
    const rows = 6, cols = 5, th = S / rows, tw = S / cols;
    for (let j = 0; j < rows; j++) for (let i = -1; i <= cols; i++) {
      const x = i * tw + (j % 2 ? tw / 2 : 0), y = j * th;
      const hue = 10 + r() * 10, sat = 55 + r() * 15, lit = 42 + r() * 10;
      const g = ctx.createLinearGradient(x, 0, x + tw, 0);
      g.addColorStop(0, `hsl(${hue},${sat}%,${lit - 14}%)`);
      g.addColorStop(0.35, `hsl(${hue},${sat}%,${lit + 6}%)`);
      g.addColorStop(0.7, `hsl(${hue},${sat}%,${lit}%)`);
      g.addColorStop(1, `hsl(${hue},${sat}%,${lit - 18}%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + 2);
      ctx.lineTo(x + tw - 1, y + 2);
      ctx.quadraticCurveTo(x + tw - 1, y + th + 4, x + tw / 2, y + th + 6); // rounded lower lip
      ctx.quadraticCurveTo(x + 1, y + th + 4, x + 1, y + 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,8,0,.35)'; ctx.fillRect(x, y + th + 2, tw, 3); // shadow line under the lip
    }
    speckle(ctx, S, r, 4000, '40,15,5', 0.2, 2);
  },
  breezeBlock: (ctx, S) => {
    // white concrete breeze blocks: 2 x 2 blocks, each with a square-cross pattern of openings
    ctx.fillStyle = '#ecebe6'; ctx.fillRect(0, 0, S, S);
    const n = 2, b = S / n, u = b / 8;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = i * b, y = j * b;
      for (const [cx, cy] of [[1, 1], [5, 1], [1, 5], [5, 5]]) ctx.clearRect(x + cx * u, y + cy * u, 2 * u, 2 * u);
      ctx.clearRect(x + 3.5 * u, y + 1 * u, u, 2 * u); ctx.clearRect(x + 3.5 * u, y + 5 * u, u, 2 * u);
      ctx.clearRect(x + 1 * u, y + 3.5 * u, 2 * u, u); ctx.clearRect(x + 5 * u, y + 3.5 * u, 2 * u, u);
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x, y, b, 2); ctx.fillRect(x, y, 2, b);
    }
  },
  perforatedTerracotta: (ctx, S, r) => {
    // terracotta perforated metal: dot grid (transparent dots)
    ctx.fillStyle = '#b4532f'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, r, 3000, '90,30,10', 0.15, 2);
    const n = 16, step = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc((i + 0.5) * step, (j + 0.5) * step, step * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  },
  timberSoffit: (ctx, S, r) => {
    // warm timber planks running one way, thin dark joints
    const n = 10;
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = `hsl(${28 + r() * 6}, ${45 + r() * 10}%, ${46 + r() * 10}%)`;
      ctx.fillRect(0, (k * S) / n, S, S / n);
      for (let g = 0; g < 12; g++) {
        ctx.strokeStyle = `rgba(70,35,10,${0.06 + r() * 0.08})`; ctx.lineWidth = 0.6 + r();
        const y = (k * S) / n + r() * (S / n);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + (r() - 0.5) * 3); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,20,5,.55)'; ctx.fillRect(0, (k * S) / n, S, 2);
    }
  },
  lightStone: (ctx, S, r) => {
    ctx.fillStyle = '#c9c5bd'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, r, 12000, '110,105,100', 0.14, 2);
    ctx.strokeStyle = 'rgba(120,115,108,.6)'; ctx.lineWidth = 2;
    for (const p of [0, S / 2]) { ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke(); }
  },
  roofDark: (ctx, S, r) => {
    ctx.fillStyle = '#4b4c4f'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, r, 14000, '30,30,32', 0.22, 2);
    speckle(ctx, S, r, 5000, '140,140,145', 0.12, 2);
  },
  road: (ctx, S, r) => {
    ctx.fillStyle = '#2e3033'; ctx.fillRect(0, 0, S, S);
    speckle(ctx, S, r, 20000, '120,120,125', 0.18, 2);
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
  teak: { color: '#e09a5c', rough: 0.45, tex: 'wood', size: 1.0 },
  stoneTile: { color: '#ffffff', rough: 0.7, tex: 'stoneTile', size: 1.2 },
  jali: { color: '#ffffff', rough: 0.8, tex: 'jali', size: 0.6 },
  paverGrass: { color: '#ffffff', rough: 0.8, tex: 'paverGrass', size: 1.6 },
  exposedConcrete: { color: '#ffffff', rough: 0.85, tex: 'exposedConcrete', size: 2.4 },
  laterite: { color: '#ffffff', rough: 0.95, tex: 'laterite', size: 1.6 },
  darkGranite: { color: '#ffffff', rough: 0.35, tex: 'darkGranite', size: 1.4 },
  clayTile: { color: '#ffffff', rough: 0.75, tex: 'clayTile', size: 1.5 },
  breezeBlock: { color: '#ffffff', rough: 0.9, tex: 'breezeBlock', size: 0.8 },
  perforatedTerracotta: { color: '#ffffff', rough: 0.55, metal: 0.4, tex: 'perforatedTerracotta', size: 0.8 },
  charcoalPaint: { color: '#5b5d61', rough: 0.95, tex: 'plaster', size: 2 },
  timberSoffit: { color: '#ffffff', rough: 0.6, tex: 'timberSoffit', size: 1.6 },
  copper: { color: '#b8733f', rough: 0.35, metal: 1 },
  sheer: { color: '#fbf6ee', rough: 0.9, emissive: '#fff1dc', emissiveIntensity: 0.25 },
  lightStone: { color: '#ffffff', rough: 0.6, tex: 'lightStone', size: 1.2 },
  roofDark: { color: '#ffffff', rough: 0.8, tex: 'roofDark', size: 2 },
  road: { color: '#ffffff', rough: 0.4, tex: 'road', size: 4 },
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
  } else if (name === 'sheer') {
    m = new THREE.MeshStandardMaterial({ color: def.color, roughness: def.rough, transparent: true, opacity: 0.72,
      emissive: new THREE.Color(def.emissive), emissiveIntensity: def.emissiveIntensity, side: THREE.DoubleSide, depthWrite: false });
  } else if (name === 'jali' || name === 'breezeBlock' || name === 'perforatedTerracotta') {
    // see-through lattices: the canvas alpha cuts the openings
    const t = baseTexture(def.tex!).clone();
    t.repeat.set(rx, ry); t.needsUpdate = true;
    m = new THREE.MeshStandardMaterial({ map: t, roughness: def.rough, metalness: def.metal ?? 0, alphaTest: 0.5, side: THREE.DoubleSide });
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

/** Real-world size (m) one texture tile covers, or 0 for untextured materials. */
export function texSize(name: MaterialName): number {
  const def = DEFS[name];
  return def?.tex ? def.size ?? 1 : 0;
}

/** Texture repeat a piece gets (same rule as materialForPiece), or null for untextured materials. */
export function pieceRepeat(p: Piece): [number, number] | null {
  const def = DEFS[p.material];
  if (!def?.tex) return null;
  const size = def.size ?? 1;
  return p.uv === 'floor' ? [p.w / size, p.d / size] : [Math.max(p.w, p.d) / size, p.h / size];
}

/** Night mode dims the emissive lamps' surroundings; lamps glow brighter. */
export function setLampGlow(intensity: number) {
  cache.forEach((m, k) => {
    if ((k === 'lamp' || k === 'crystal') && m instanceof THREE.MeshStandardMaterial) m.emissiveIntensity = intensity;
  });
}
