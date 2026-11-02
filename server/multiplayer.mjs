// Multiplayer relay: everyone in a room sees everyone else in it, with their name.
//   node server/multiplayer.mjs            (PORT, default 3001)
// The protocol (message names and shapes) lives in src/lib/protocol.mjs, shared with the browser.
// Rooms (room.mjs): 'public' by default, or a private 6-character code; a room exists while someone uses it,
// and is dropped once it has been empty for EMPTY_ROOM_MS.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { Room, send } from './room.mjs';
import { MAX_PLAYERS, PUBLIC_ROOM, EVENT_NAME, EMOTES, REACTIONS, ACTION_COOLDOWN_MS, roomId, cleanTour } from '../src/lib/protocol.mjs';

const PORT = Number(process.env.PORT || 3001);
const TICK_MS = 50; // clients send at MOVE_HZ (12/s): forward each update promptly instead of holding it back
const EMPTY_ROOM_MS = 5 * 60 * 1000;

const rooms = new Map(); // id -> Room
const roomFor = (id) => {
  let r = rooms.get(id);
  if (!r) rooms.set(id, (r = new Room(id, { maxPlayers: MAX_PLAYERS })));
  return r;
};
const everyone = function* () { for (const r of rooms.values()) yield* r.players.values(); };
const headcount = () => { let n = 0; for (const r of rooms.values()) n += r.size; return n; };

// plain HTTP answers health checks (Render, Railway, uptime monitors); WebSockets upgrade on the same port
const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`ok, ${headcount()} inside, ${rooms.size} rooms\n`);
});
const wss = new WebSocketServer({ server: http, maxPayload: 1024 });
http.listen(PORT);
let nextId = 1;

const cleanName = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const r2 = (v) => Math.round(v * 100) / 100;
/** Moving faster than this (m/s) ends an emote. */
const STILL = 0.2;
/**
 * Rate limit for player actions: true (and the clock restarts) if `kind` was last used at least `ms` ago.
 * A little slack, so a client that keeps to the limit on its own clock is never refused for network jitter.
 */
const cooled = (p, kind, ms) => {
  const now = Date.now();
  if (now - (p.last[kind] ?? 0) < ms * 0.85) return false;
  p.last[kind] = now;
  return true;
};

wss.on('connection', (ws) => {
  let me = null;
  const leave = () => {
    if (me && me.room.remove(me.id)) console.log(`- ${me.name} [${me.room.id}] (${me.room.size} inside)`);
    me = null;
  };
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m?.t === 'room:join') {
      const id = m.room == null || m.room === '' ? PUBLIC_ROOM : roomId(m.room);
      if (!id) { send(ws, { t: 'room:error', reason: 'bad-room' }); return; }
      leave(); // switching rooms on the same socket
      // the same page reconnecting: its old connection may still look alive (network switch, sleep), drop it first
      const key = typeof m.key === 'string' ? m.key.slice(0, 40) : '';
      let takeHost = false; // the host's page coming back to the same room stays host
      for (const r of rooms.values()) {
        const old = r.byKey(key);
        if (!old) continue;
        const keepHost = r.id === id && r.hostId === old.id;
        takeHost ||= keepHost;
        r.remove(old.id, { keepHost });
        old.ws.terminate();
        console.log(`~ ${old.name} reconnected`);
      }
      const room = roomFor(id);
      if (room.full) { send(ws, { t: 'room:full' }); ws.close(); return; }
      const pid = String(nextId++);
      me = room.add(ws, { id: pid, key, name: cleanName(m.name) || `Guest ${pid}` }, { takeHost });
      console.log(`+ ${me.name} [${room.id}] (${room.size} inside)`);
      return;
    }
    if (!me) return;
    if (m?.t === 'room:leave') { leave(); return; }
    if (m?.t === 'player:move') {
      if (--me.budget < 0) return; // flood guard: ~20 updates per second is plenty
      const x = num(m.x, -100, 100), f = num(m.f, -5, 20), z = num(m.z, -100, 100), y = num(m.y, -1e4, 1e4), s = num(m.s, 0, 20);
      if (x === null || f === null || z === null || y === null || s === null) return;
      // the sender's clock stamp travels along for the receivers' interpolation; older clients get the relay's clock
      const ts = num(m.ts, 0, 2 ** 31) ?? Math.round(performance.now());
      Object.assign(me, { x: r2(x), f: r2(f), z: r2(z), y: r2(y), s: r2(s), ts: Math.round(ts), dirty: true });
      if (s > STILL) me.emote = null; // walking off ends it (everyone else sees them move and stops it too)
      return;
    }
    if (m?.t === 'player:emote') {
      const e = m.e === null ? null : EMOTES.includes(m.e) ? m.e : undefined;
      if (e === undefined || --me.budget < 0 || !cooled(me, 'emote', ACTION_COOLDOWN_MS)) return;
      me.emote = e;
      me.room.broadcast({ t: 'player:emote', id: me.id, e }, me.id);
      return;
    }
    // host-only, and only in private rooms: in the public room the "host" is just whoever has been there longest
    if (m?.t === 'tour:update' || m?.t === 'room:host') {
      const r = me.room;
      if (r.id === PUBLIC_ROOM || r.hostId !== me.id) { send(ws, { t: 'room:error', reason: 'not-host' }); return; }
      if (--me.budget < 0) return;
      if (m.t === 'room:host') { if (typeof m.id === 'string' && m.id !== me.id) r.setHost(m.id); return; }
      const tour = cleanTour(m.tour);
      if (!tour) return;
      r.tour = tour;
      r.broadcast({ t: 'tour:state', tour }, me.id);
      return;
    }
    if (m?.t === 'player:react') {
      if (!REACTIONS.includes(m.r) || --me.budget < 0 || !cooled(me, 'react', ACTION_COOLDOWN_MS)) return;
      me.room.broadcast({ t: 'player:react', id: me.id, r: m.r }, me.id);
      return;
    }
    if (m?.t === 'room:event') {
      if (--me.budget < 0 || typeof m.name !== 'string' || !EVENT_NAME.test(m.name)) return;
      me.room.broadcast({ t: 'room:event', from: me.id, name: m.name, data: m.data }, me.id); // maxPayload caps its size
    }
  });
  ws.on('pong', () => { if (me) me.alive = true; });
  ws.on('close', leave);
  ws.on('error', () => {});
});

// positions go out in one batch per tick per room, only for players who moved
setInterval(() => { for (const r of rooms.values()) r.tick(); }, TICK_MS);

// drop connections that went away without closing (phone locked, network lost)
setInterval(() => {
  for (const p of everyone()) {
    if (!p.alive) { p.ws.terminate(); continue; }
    p.alive = false;
    try { p.ws.ping(); } catch { /* closing */ }
  }
}, 10000);

// forget rooms nobody has been in for a while (the code just makes a fresh one if used again)
setInterval(() => {
  const now = Date.now();
  for (const [id, r] of rooms) if (!r.size && r.emptySince && now - r.emptySince > EMPTY_ROOM_MS) rooms.delete(id);
}, 30000);

console.log(`Multiplayer server on ws://localhost:${PORT}`);
