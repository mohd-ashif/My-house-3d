import type { BoxDef, Furniture, HouseConfig, MaterialName } from './types';

// Local coordinates: item centered at (0,0), FRONT faces +z, y measured from the floor.
type L = { x: number; z: number; w: number; d: number; y: number; h: number; m: MaterialName; c?: boolean; colH?: number };

function preset(f: Furniture): L[] {
  const out: L[] = [];
  const add = (x: number, z: number, w: number, d: number, y: number, h: number, m: MaterialName, c = false, colH?: number) =>
    out.push({ x, z, w, d, y, h, m, c, colH });
  switch (f.type) {
    case 'bed': {
      const w = f.w ?? 1.8, d = f.d ?? 2.1;
      const sides = f.sides ?? 'both';
      add(0, 0, w, d, 0, 0.32, 'walnut', true, 0.9);
      add(0, 0.04, w - 0.06, d - 0.12, 0.32, 0.24, 'mattress');
      add(0, -d / 2 - 0.05, w + 0.12, 0.1, 0, 1.15, 'walnut');
      add(0, -d / 2 + 0.02, w - 0.1, 0.06, 0.45, 0.62, 'cushion'); // upholstered headboard
      add(-w / 4, -d / 2 + 0.32, w / 2 - 0.12, 0.38, 0.56, 0.16, 'white');
      add(w / 4, -d / 2 + 0.32, w / 2 - 0.12, 0.38, 0.56, 0.16, 'white');
      add(0, -d / 2 + 0.6, 0.42, 0.14, 0.6, 0.3, 'sage'); // accent cushion
      add(0, d * 0.18, w - 0.02, d * 0.58, 0.56, 0.04, 'cushion');
      add(0, d * 0.3, w + 0.04, d * 0.3, 0.57, 0.04, 'sage'); // sage-green throw over the foot
      for (const sx of [-1, 1]) {
        if (sides === 'none' || (sides === 'left' && sx > 0) || (sides === 'right' && sx < 0)) continue;
        add(sx * (w / 2 + 0.3), -d / 2 + 0.25, 0.45, 0.42, 0, 0.5, 'walnut', true);
        add(sx * (w / 2 + 0.3), -d / 2 + 0.25, 0.05, 0.05, 0.5, 0.25, 'metal');
        add(sx * (w / 2 + 0.3), -d / 2 + 0.25, 0.2, 0.2, 0.75, 0.2, 'lamp');
      }
      break;
    }
    case 'sofa':
    case 'armchair': {
      const w = f.w ?? (f.type === 'sofa' ? 2.2 : 0.85), d = f.d ?? 0.9;
      add(0, 0.05, w - 0.3, d - 0.2, 0, 0.44, 'fabric', true, 0.8);
      add(0, -d / 2 + 0.11, w, 0.22, 0, 0.82, 'fabric', true);
      add(-w / 2 + 0.08, 0.05, 0.16, d - 0.1, 0, 0.62, 'fabric', true);
      add(w / 2 - 0.08, 0.05, 0.16, d - 0.1, 0, 0.62, 'fabric', true);
      if (f.type === 'sofa') {
        add(-w / 4 + 0.04, 0.0, 0.42, 0.14, 0.44, 0.38, 'fabricDark');
        add(w / 4 - 0.04, 0.0, 0.42, 0.14, 0.44, 0.38, 'fabricDark');
      }
      break;
    }
    case 'sofaL': {
      const w = f.w ?? 2.6, d = 0.9;
      add(0, 0.05, w - 0.3, d - 0.2, 0, 0.44, 'fabric', true, 0.8);
      add(0, -d / 2 + 0.11, w, 0.22, 0, 0.82, 'fabric', true);
      add(-w / 2 + 0.08, 0.05, 0.16, d - 0.1, 0, 0.62, 'fabric', true);
      add(w / 2 - 0.45, d / 2 + 0.6, 0.9, 1.2, 0, 0.44, 'fabric', true, 0.8); // chaise
      break;
    }
    case 'coffeeTable': {
      const w = f.w ?? 1.1, d = f.d ?? 0.6;
      add(0, 0, w, d, 0.36, 0.05, 'wood', true, 0.5);
      add(0, 0, w - 0.2, d - 0.2, 0, 0.36, 'blackMetal');
      break;
    }
    case 'diningTable': {
      const w = f.w ?? 1.8, d = f.d ?? 0.9;
      const seats = f.seats ?? 6;
      add(0, 0, w, d, 0.72, 0.05, 'wood', true, 0.9);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * (w / 2 - 0.1), sz * (d / 2 - 0.1), 0.07, 0.07, 0, 0.72, 'darkWood');
      const perSide = Math.max(1, Math.floor(seats / 2));
      for (let i = 0; i < perSide; i++) {
        const cx = -w / 2 + (w / perSide) * (i + 0.5);
        for (const side of [-1, 1]) {
          const cz = side * (d / 2 + 0.28);
          add(cx, cz, 0.44, 0.44, 0, 0.45, 'darkWood', true, 0.9);
          add(cx, cz, 0.46, 0.46, 0.45, 0.06, 'fabricDark');
          add(cx, cz + side * 0.21, 0.44, 0.05, 0.5, 0.5, 'darkWood');
        }
      }
      break;
    }
    case 'tvUnit': {
      const w = f.w ?? 2.0, d = f.d ?? 0.42;
      add(0, 0, w, d, 0.15, 0.4, 'darkWood', true, 0.6);
      add(0, -d / 2 + 0.04, 1.45, 0.05, 0.95, 0.84, 'screen');
      add(0, -d / 2 + 0.01, w + 0.4, 0.02, 0.6, 1.6, 'wood');
      break;
    }
    case 'wardrobe': {
      const w = f.w ?? 1.8, d = f.d ?? 0.6;
      add(0, 0, w, d, 0, 2.2, 'wood', true);
      const doors = Math.max(2, Math.round(w / 0.5));
      for (let i = 1; i < doors; i++) add(-w / 2 + (w / doors) * i, d / 2, 0.01, 0.01, 0.05, 2.1, 'darkWood');
      for (let i = 0; i < doors; i++) add(-w / 2 + (w / doors) * (i + 0.5) + (i % 2 ? -0.18 : 0.18), d / 2 + 0.01, 0.02, 0.02, 0.9, 0.35, 'metal');
      break;
    }
    case 'kitchenCounter': {
      const w = f.w ?? 2.4, d = f.d ?? 0.6;
      add(0, 0, w, d, 0, 0.86, 'white', true);
      add(0, 0.01, w + 0.02, d + 0.02, 0.86, 0.04, 'granite');
      add(-w / 4, 0.02, 0.6, 0.42, 0.88, 0.02, 'metal');
      add(w / 4, 0.0, 0.6, 0.5, 0.9, 0.02, 'screen');
      add(0, -d / 2 + 0.18, w, 0.35, 1.5, 0.7, 'white', true);
      add(0, -d / 2 + 0.01, w, 0.02, 0.9, 0.6, 'bathTile');
      break;
    }
    case 'wc':
      add(0, 0.05, 0.38, 0.55, 0, 0.4, 'white', true, 0.7);
      add(0, -0.24, 0.42, 0.18, 0.38, 0.42, 'white');
      break;
    case 'basin':
      add(0, 0, 0.6, 0.45, 0, 0.82, 'white', true);
      add(0, 0, 0.62, 0.47, 0.82, 0.04, 'granite');
      add(0, -0.21, 0.6, 0.02, 1.15, 0.75, 'mirror');
      break;
    case 'desk': {
      const w = f.w ?? 1.2, d = f.d ?? 0.6;
      add(0, 0, w, d, 0.72, 0.04, 'wood', true, 0.9);
      add(-w / 2 + 0.03, 0, 0.04, d, 0, 0.72, 'blackMetal');
      add(w / 2 - 0.03, 0, 0.04, d, 0, 0.72, 'blackMetal');
      add(0, d / 2 + 0.25, 0.45, 0.45, 0, 0.47, 'fabricDark', true, 0.9);
      break;
    }
    case 'studyDesk': {
      const w = f.w ?? 1.2, d = f.d ?? 0.5;
      add(0, 0, w, d, 0.72, 0.04, 'walnut', true, 0.9);
      add(-w / 2 + 0.2, 0, 0.36, d - 0.04, 0.2, 0.52, 'walnut'); // drawer pedestal
      add(w / 2 - 0.03, 0, 0.04, d, 0, 0.72, 'walnut');
      add(w / 4, -d / 2 + 0.1, 0.05, 0.05, 0.76, 0.3, 'metal');
      add(w / 4, -d / 2 + 0.1, 0.14, 0.14, 1.06, 0.12, 'lamp');
      add(-0.1, 0, 0.32, 0.22, 0.76, 0.02, 'screen'); // laptop
      // chair in front
      add(0, d / 2 + 0.3, 0.48, 0.46, 0.4, 0.08, 'fabricDark', true, 0.9);
      add(0, d / 2 + 0.52, 0.48, 0.06, 0.48, 0.45, 'fabricDark');
      add(0, d / 2 + 0.3, 0.05, 0.05, 0, 0.4, 'blackMetal');
      add(0, d / 2 + 0.3, 0.42, 0.42, 0, 0.03, 'blackMetal');
      break;
    }
    case 'shower': {
      // walk-in shower: back = local -z wall, glass screen along the front (+z)
      const w = f.w ?? 1.0, d = f.d ?? 0.9;
      add(0, 0, w, d, 0, 0.04, 'granite');
      // fixed panel over the -x 62% of the front, open gap at the +x end to step in
      add(-w / 2 + w * 0.31, d / 2 - 0.01, w * 0.62, 0.02, 0.04, 1.95, 'glass', true);
      add(-w / 2 + w * 0.62, d / 2 - 0.01, 0.03, 0.03, 0.04, 1.95, 'metal');
      add(0, -d / 2 + 0.05, 0.03, 0.03, 0.9, 1.25, 'metal'); // riser pipe
      add(0, -d / 2 + 0.18, 0.03, 0.28, 2.12, 0.03, 'metal'); // arm
      add(0, -d / 2 + 0.3, 0.26, 0.26, 2.08, 0.03, 'metal'); // rain head
      add(0, -d / 2 + 0.04, 0.12, 0.05, 1.0, 0.12, 'metal'); // mixer
      break;
    }
    case 'chandelier': {
      // crystal strands hanging in rings from the ceiling of a double-height space (floor = the upper floor)
      const top = f.d ?? 2.95, drop = f.w ?? 2.2;
      add(0, 0, 0.5, 0.5, top - 0.04, 0.04, 'metal');
      add(0, 0, 0.02, 0.02, top - drop * 0.35, drop * 0.35, 'metal');
      const rings: [number, number, number][] = [[0.18, 8, 0.95], [0.38, 14, 0.75], [0.58, 20, 0.55]];
      for (const [rad, n, len] of rings) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const l = drop * len * (0.85 + 0.15 * Math.cos(a * 3));
          add(Math.cos(a) * rad, Math.sin(a) * rad, 0.025, 0.025, top - l, l - 0.05, 'crystal');
        }
      }
      add(0, 0, 0.22, 0.22, top - drop, 0.22, 'crystal');
      break;
    }
    case 'rattanChair':
      add(0, 0, 0.72, 0.68, 0, 0.42, 'rattan', true, 0.85);
      add(0, -0.3, 0.72, 0.1, 0.42, 0.42, 'rattan');
      add(-0.33, 0, 0.08, 0.6, 0.42, 0.22, 'rattan');
      add(0.33, 0, 0.08, 0.6, 0.42, 0.22, 'rattan');
      add(0, 0.02, 0.56, 0.52, 0.42, 0.1, 'cushion');
      add(0, -0.2, 0.42, 0.12, 0.5, 0.32, 'cushion');
      break;
    case 'roundTable': {
      const w = f.w ?? 0.55;
      add(0, 0, w, w, 0.5, 0.04, 'walnut', true, 0.6);
      add(0, 0, w * 0.72, w * 0.72, 0.5, 0.04, 'walnut');
      add(0, 0, 0.06, 0.06, 0, 0.5, 'walnut');
      add(0, 0, w * 0.55, w * 0.55, 0, 0.03, 'walnut');
      break;
    }
    case 'ottoman':
      add(0, 0, f.w ?? 0.5, f.d ?? 0.5, 0, 0.42, 'sage', true, 0.5);
      break;
    case 'bedsideLamp':
      add(0, 0, 0.45, 0.42, 0, 0.5, 'walnut', true);
      add(0, 0, 0.05, 0.05, 0.5, 0.25, 'metal');
      add(0, 0, 0.2, 0.2, 0.75, 0.2, 'lamp');
      break;
    case 'fridge':
      add(0, 0, f.w ?? 0.7, f.d ?? 0.68, 0, 1.8, 'metal', true);
      add(-(f.w ?? 0.7) / 2 + 0.06, (f.d ?? 0.68) / 2, 0.03, 0.03, 0.9, 0.6, 'blackMetal');
      break;
    case 'rug':
      add(0, 0, f.w ?? 2.4, f.d ?? 1.7, 0, 0.012, 'fabric'); // beige, as in the renders
      break;
    case 'car': {
      const w = 1.8, d = 4.4; // front = +z
      add(0, 0, w, d, 0.32, 0.62, 'red', true, 1.4);
      add(0, -0.25, w - 0.12, 2.1, 0.94, 0.55, 'screen');
      add(0, -0.25, w - 0.2, 2.0, 1.49, 0.04, 'red');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * (w / 2 - 0.12), sz * 1.35, 0.26, 0.66, 0, 0.66, 'blackMetal');
      add(-0.6, d / 2, 0.3, 0.02, 0.62, 0.12, 'lamp');
      add(0.6, d / 2, 0.3, 0.02, 0.62, 0.12, 'lamp');
      break;
    }
  }
  return out;
}

function rotate(x: number, z: number, rot: number): [number, number] {
  switch (rot) {
    case 90: return [z, -x];
    case 180: return [-x, -z];
    case 270: return [-z, x];
    default: return [x, z];
  }
}

export function expandFurniture(cfg: HouseConfig): BoxDef[] {
  const boxes: BoxDef[] = [];
  for (const f of cfg.furniture ?? []) {
    const rot = f.rot ?? 0;
    const baseY = f.type === 'car' ? 0 : (cfg.floors[f.floor]?.y ?? 0);
    for (const p of preset(f)) {
      const [rx, rz] = rotate(p.x, p.z, rot);
      const swap = rot === 90 || rot === 270;
      boxes.push({
        name: f.type,
        x: f.x + rx, z: f.z + rz,
        w: swap ? p.d : p.w, d: swap ? p.w : p.d,
        y: baseY + p.y, h: p.h,
        material: p.m,
        collide: !!p.c,
        colH: p.colH,
      });
    }
  }
  return boxes;
}
