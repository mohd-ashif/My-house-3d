// Walks a simulated visitor through the house with the real engine code (world + physics) and
// reports the room and floor at every stop, plus furniture that blocks a doorway or sits in a wall.
// usage: node scripts/walk_sim.mjs        (compiles src/lib into .sim/ first)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

execSync('npx tsc src/lib/world.ts src/lib/physics.ts --outDir .sim --module commonjs --target es2020 --skipLibCheck', { stdio: 'inherit' });
mkdirSync('.sim', { recursive: true });
writeFileSync('.sim/package.json', '{"type":"commonjs"}');
const require = createRequire(import.meta.url);
const { buildWorld } = require('../.sim/world.js');
const { groundHeight, resolve, roomAt, STEP, BODY } = require('../.sim/physics.js');

const cfg = JSON.parse(readFileSync('src/data/house.json', 'utf8'));
const world = buildWorld(cfg);
let problems = 0;
for (const w of world.warnings) { console.log('WORLD WARNING:', w); problems++; }

// ---------- walk ----------
const p = { x: cfg.spawn.x, z: cfg.spawn.z, feet: 0 };
p.feet = groundHeight(world, p.x, p.z, 0.6);
const dt = 1 / 60;
function walkTo(tx, tz, label) {
  let t = 0, best = Infinity, stuck = 0;
  while (t < 60) {
    const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
    if (dist < 0.08) return true;
    const sp = Math.min(1.9 * dt, dist);
    const mx = (dx / dist) * sp, mz = (dz / dist) * sp;
    const sub = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.08));
    let x = p.x, z = p.z;
    for (let i = 0; i < sub; i++) {
      [x, z] = resolve(world, x + mx / sub, z + mz / sub, p.feet);
      const g = groundHeight(world, x, z, p.feet);
      if (g >= p.feet) p.feet = g;
    }
    p.x = x; p.z = z;
    const g = groundHeight(world, x, z, p.feet);
    if (g < p.feet) p.feet = Math.max(g, p.feet - 9.81 * dt * 0.5);
    t += dt;
    if (dist < best - 0.01) { best = dist; stuck = 0; } else if ((stuck += dt) > 2) break;
  }
  console.log(`  STUCK on the way to ${label} (${tx}, ${tz}): at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) feet ${p.feet.toFixed(2)}`);
  problems++;
  return false;
}
function stop(label, wantRoom, wantFloor) {
  const { room, floor } = roomAt(world, p.x, p.z, p.feet);
  const name = room ? room.name : 'Garden';
  const ok = name === wantRoom && floor === wantFloor;
  if (!ok) problems++;
  console.log(`${ok ? 'OK ' : 'BAD'} ${label.padEnd(12)} -> ${name} / ${cfg.floors[floor].name}  at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}), feet ${p.feet.toFixed(2)}${ok ? '' : `   (expected ${wantRoom} / floor ${wantFloor})`}`);
}
const route = [
  ['gate', [[9.44, 17.6]], 'Garden', 0],
  ['sit-out', [[9.44, 9.2]], 'Sit Out', 0],
  ['main door', [[11.09, 9.0], [11.09, 7.9]], 'Living', 0],
  ['living', [[11.0, 7.4], [10.6, 6.4]], 'Living', 0],
  ['passage', [[10.7, 4.9], [10.6, 3.85]], 'Passage', 0],
  ['stairs', [[8.62, 3.7], [8.62, 2.2]], 'Staircase', 0],
  ['landing', [[8.62, 0.7], [7.67, 0.7]], 'Staircase', 0],
  ['FF passage', [[7.67, 3.0], [7.67, 3.9]], 'Passage', 1],
  ['Bedroom 1', [[4.45, 3.9], [4.45, 2.6], [4.6, 1.4]], 'Bedroom 1', 1],
  ['Toilet 1', [[4.45, 2.78], [3.3, 2.78], [3.2, 2.2]], 'Toilet', 1],
  ['Bedroom 3', [[3.3, 2.78], [4.45, 2.78], [4.45, 3.9], [6.55, 3.95], [6.55, 5.3], [6.4, 6.6], [6.1, 8.9]], 'Bedroom 3', 1],
  ['Att. toilet', [[6.4, 6.6], [6.3, 5.6], [5.2, 5.6]], 'Attached Toilet', 1],
  ['Master', [[6.3, 5.6], [6.55, 5.0], [6.55, 3.95], [11.7, 3.85], [12.8, 3.85], [13.2, 5.0], [13.2, 6.6]], 'Master Bedroom', 1],
  ['Walk-in', [[13.2, 4.0], [13.6, 3.0], [14.3, 2.85]], 'Walk-in Wardrobe', 1],
  ['Toilet 2', [[12.8, 2.75], [11.9, 2.75], [11.0, 2.6]], 'Toilet', 1],
  ['Balcony', [[11.9, 2.75], [13.6, 2.9], [13.2, 4.0], [13.2, 6.6], [14.1, 7.0], [14.1, 7.55]], 'Balcony', 1],
  ['Terrace', [[14.1, 7.0], [13.2, 6.6], [13.2, 4.0], [12.8, 3.85], [11.7, 3.85], [3.4, 3.85], [2.4, 3.85], [1.4, 4.5]], 'Open Terrace', 1],
  ['back down', [[2.4, 3.85], [7.67, 3.9], [7.67, 3.0], [7.67, 0.7], [8.62, 0.7], [8.62, 3.7], [8.0, 4.0]], 'Passage', 0],
  ['guest', [[6.56, 3.9], [6.56, 2.6], [5.2, 2.6]], 'Guest Bedroom', 0],
  ['courtyard', [[6.56, 2.6], [6.56, 3.9], [10.7, 3.9], [10.7, 2.9], [10.5, 1.5]], 'Courtyard', 0],
  ['kitchen', [[10.7, 2.9], [10.7, 3.9], [3.3, 4.2], [3.3, 5.25], [2.0, 5.25], [1.5, 6.0]], 'Kitchen', 0],
  ['work area', [[1.82, 5.2], [1.82, 3.9], [1.3, 2.6]], 'Work Area', 0],
  ['bedroom', [[1.82, 3.9], [1.82, 5.2], [3.3, 5.25], [3.3, 4.2], [11.9, 3.85], [12.8, 3.85], [13.4, 4.4], [13.4, 6.6]], 'Bedroom', 0],
  ['GF toilet', [[13.4, 4.4], [15.45, 3.6], [15.45, 2.72], [14.4, 2.72], [13.9, 2.6]], 'Toilet', 0],
];
console.log('Walk: gate -> sit-out -> main door -> living -> passage -> stairs -> FF -> every room');
for (const [label, pts, room, floor] of route) {
  for (const [x, z] of pts) if (!walkTo(x, z, label)) break;
  stop(label, room, floor);
}

// ---------- furniture sanity: inside a room, clear of walls ----------
const { expandFurniture } = require('../.sim/furniture.js');
const wallBoxes = world.pieces.filter((q) => q.uv === 'wall' && q.material !== 'glass');
for (const b of expandFurniture(cfg)) {
  if (b.name === 'car' || b.collide === false) continue;
  const hit = wallBoxes.find((q) =>
    Math.min(b.x + b.w / 2, q.x + q.w / 2) - Math.max(b.x - b.w / 2, q.x - q.w / 2) > 0.02 &&
    Math.min(b.z + b.d / 2, q.z + q.d / 2) - Math.max(b.z - b.d / 2, q.z - q.d / 2) > 0.02 &&
    Math.min(b.y + b.h, q.y + q.h) - Math.max(b.y, q.y) > 0.02);
  if (hit) { problems++; console.log(`FURNITURE ${b.name} part at (${b.x.toFixed(2)}, ${b.z.toFixed(2)}) y ${b.y.toFixed(2)} pokes into a wall at (${hit.x.toFixed(2)}, ${hit.z.toFixed(2)})`); }
}
// doorways: a 0.6 m wide person must fit through every door, 0.4 m either side of the wall
for (const d of world.doors) {
  const mid = (d.a + d.b) / 2;
  for (const off of [-0.45, 0.45]) {
    const [x, z] = d.axis === 'x' ? [mid, d.c + off] : [d.c + off, mid];
    const [rx, rz] = resolve(world, x, z, d.y);
    if (Math.hypot(rx - x, rz - z) > 0.05) { problems++; console.log(`DOOR at ${d.axis}=${d.c.toFixed(2)} ${d.a.toFixed(2)}-${d.b.toFixed(2)} floor ${d.floor}: blocked on its ${off < 0 ? '-' : '+'} side`); }
  }
}
console.log(problems ? `${problems} problem(s)` : 'All stops correct, no blocked doors, no furniture in walls.');
process.exit(problems ? 1 : 0);
