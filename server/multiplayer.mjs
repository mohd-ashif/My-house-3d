// Multiplayer relay: everyone in the house sees everyone else, with their name.
//   node server/multiplayer.mjs            (PORT, default 3001)
// Protocol (JSON text frames):
//   client -> server  {t:'hello', name}            once, right after connecting
//                     {t:'p', x, f, z, y, s}       position (feet height f, body yaw y, speed s), ~10x per second
//   server -> client  {t:'welcome', id, players}   your id + everyone already inside
//                     {t:'join', p} / {t:'leave', id}
//                     {t:'s', u: [[id, x, f, z, y, s], ...]}   moved players, batched 10x per second
//                     {t:'full'}                   the house is at capacity
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 3001);
const MAX_PLAYERS = 60;
const TICK_MS = 100;
const COLORS = ['#e05a4f', '#3f8fd8', '#45b36b', '#e9a23b', '#9b5fd0', '#2bb5b0', '#d2588f', '#7f8c3a', '#5a6ee0', '#c7743a'];

// plain HTTP answers health checks (Render, Railway, uptime monitors); WebSockets upgrade on the same port
const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`ok, ${players.size} inside\n`);
});
const wss = new WebSocketServer({ server: http, maxPayload: 1024 });
http.listen(PORT);
const players = new Map(); // id -> { ws, id, name, color, x, f, z, y, s, dirty, alive, budget }
let nextId = 1;
let colorIx = 0;

const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const r2 = (v) => Math.round(v * 100) / 100;
const pub = (p) => ({ id: p.id, name: p.name, color: p.color, x: p.x, f: p.f, z: p.z, y: p.y, s: p.s });
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
const broadcast = (msg, except) => { const s = JSON.stringify(msg); for (const p of players.values()) if (p.id !== except) send(p.ws, s); };

wss.on('connection', (ws) => {
  let me = null;
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!me) {
      if (m?.t !== 'hello') return;
      if (players.size >= MAX_PLAYERS) { send(ws, { t: 'full' }); ws.close(); return; }
      const id = String(nextId++);
      me = { ws, id, name: cleanName(m.name) || `Guest ${id}`, color: COLORS[colorIx++ % COLORS.length], x: 0, f: 0, z: 0, y: 0, s: 0, dirty: false, alive: true, budget: 40 };
      send(ws, { t: 'welcome', id, players: [...players.values()].map(pub) });
      players.set(id, me);
      broadcast({ t: 'join', p: pub(me) }, id);
      console.log(`+ ${me.name} (${players.size} inside)`);
      return;
    }
    if (m?.t === 'p') {
      if (--me.budget < 0) return; // flood guard: ~20 updates per second is plenty
      const x = num(m.x, -100, 100), f = num(m.f, -5, 20), z = num(m.z, -100, 100), y = num(m.y, -1e4, 1e4), s = num(m.s, 0, 20);
      if (x === null || f === null || z === null || y === null || s === null) return;
      Object.assign(me, { x: r2(x), f: r2(f), z: r2(z), y: r2(y), s: r2(s), dirty: true });
    }
  });
  ws.on('pong', () => { if (me) me.alive = true; });
  ws.on('close', () => {
    if (!me || !players.delete(me.id)) return;
    broadcast({ t: 'leave', id: me.id });
    console.log(`- ${me.name} (${players.size} inside)`);
  });
  ws.on('error', () => {});
});

// positions go out in one batch per tick, only for players who moved
setInterval(() => {
  const u = [];
  for (const p of players.values()) {
    p.budget = Math.min(40, p.budget + 2);
    if (p.dirty) { p.dirty = false; u.push([p.id, p.x, p.f, p.z, p.y, p.s]); }
  }
  if (u.length) broadcast({ t: 's', u });
}, TICK_MS);

// drop connections that went away without closing (phone locked, network lost)
setInterval(() => {
  for (const p of players.values()) {
    if (!p.alive) { p.ws.terminate(); continue; }
    p.alive = false;
    try { p.ws.ping(); } catch { /* closing */ }
  }
}, 15000);

console.log(`Multiplayer server on ws://localhost:${PORT}`);
