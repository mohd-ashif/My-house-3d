// One shared space: the players inside it, what they all see (src/lib/protocol.mjs: RoomSnapshot),
// and the messages that go to everyone in it. Nothing a room sends ever leaves the room.
// The relay (multiplayer.mjs) owns the sockets, the ids and the room list; a room only knows its own players.
import { LOOPING_EMOTES, IDLE_TOUR } from '../src/lib/protocol.mjs';

const COLORS = ['#e05a4f', '#3f8fd8', '#45b36b', '#e9a23b', '#9b5fd0', '#2bb5b0', '#d2588f', '#7f8c3a', '#5a6ee0', '#c7743a'];

/** @param {import('ws').WebSocket} ws @param {import('../src/lib/protocol.mjs').ServerMsg | string} msg */
export const send = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
/** What other visitors may see of a player. */
export const pub = (p) => ({
  id: p.id, name: p.name, color: p.color, x: p.x, f: p.f, z: p.z, y: p.y, s: p.s,
  emote: LOOPING_EMOTES.includes(p.emote) ? p.emote : null, // a wave that ended long ago is not news
});

export class Room {
  constructor(id, { maxPlayers }) {
    this.id = id;
    this.maxPlayers = maxPlayers;
    this.players = new Map(); // id -> { ws, id, key, name, color, x, f, z, y, s, ts, emote, last, dirty, alive, budget, room }
    this.colorIx = 0;
    this.hostId = null;
    // shared state, sent whole to everyone who joins
    this.tour = { ...IDLE_TOUR }; // the group tour: whatever the host last sent (tour:update)
    this.design = null;
    this.isNight = false;
    this.doors = {};
    this.lights = {};
    this.collectibles = {};
    this.emptySince = Date.now(); // the relay deletes rooms that stay empty too long
  }

  get size() { return this.players.size; }
  get full() { return this.players.size >= this.maxPlayers; }

  /** The player this page (one key per open page) already has in here, if any. */
  byKey(key) {
    if (key) for (const p of this.players.values()) if (p.key === key) return p;
    return null;
  }

  /** @returns {import('../src/lib/protocol.mjs').RoomSnapshot} */
  snapshot() {
    const { id, hostId, tour, design, isNight, doors, lights, collectibles } = this;
    return { id, hostId, players: this.list(), tour, design, isNight, doors, lights, collectibles };
  }

  /**
   * A new player: gets a shirt colour and the whole room state, and everyone else hears about them.
   * `takeHost`: the host's own page coming back (see remove's `keepHost`), so the role comes with it.
   */
  add(ws, { id, key, name }, { takeHost = false } = {}) {
    const p = { ws, id, key, name, color: COLORS[this.colorIx++ % COLORS.length], x: 0, f: 0, z: 0, y: 0, s: 0, ts: 0, emote: null, last: {}, dirty: false, alive: true, budget: 40, room: this };
    this.players.set(id, p);
    if (takeHost || !this.hostId) this.hostId = id;
    this.emptySince = 0;
    send(ws, { t: 'room:snapshot', self: id, room: this.snapshot() });
    this.broadcast({ t: 'player:join', p: pub(p) }, id);
    if (takeHost) this.broadcast({ t: 'room:host', hostId: id, reason: 'back' }, id);
    return p;
  }

  /**
   * Takes the player out and tells everyone else; false if they were already gone. The host role moves on,
   * unless `keepHost`: their page is reconnecting and add(…, { takeHost }) follows straight away.
   */
  remove(id, { keepHost = false } = {}) {
    if (!this.players.delete(id)) return false;
    this.broadcast({ t: 'player:leave', id });
    if (this.hostId === id && !keepHost) {
      this.hostId = this.players.keys().next().value ?? null; // longest inside
      if (this.hostId) this.broadcast({ t: 'room:host', hostId: this.hostId, reason: 'left' });
    }
    if (!this.players.size) {
      this.emptySince = Date.now();
      this.tour = { ...IDLE_TOUR }; // nobody left on it; whoever comes back starts fresh
    }
    return true;
  }

  /** Hand the host role to `id` (someone in the room), and tell everyone. False if they aren't here. */
  setHost(id) {
    if (!this.players.has(id)) return false;
    this.hostId = id;
    this.broadcast({ t: 'room:host', hostId: id, reason: 'transfer' });
    return true;
  }

  list() { return [...this.players.values()].map(pub); }

  broadcast(msg, exceptId) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.id !== exceptId) send(p.ws, s);
  }

  /** One relay tick (50 ms): refill flood budgets (20 messages/s each), then one batch with everyone who moved. */
  tick() {
    const u = [];
    for (const p of this.players.values()) {
      p.budget = Math.min(40, p.budget + 1);
      if (p.dirty) { p.dirty = false; u.push([p.id, p.x, p.f, p.z, p.y, p.s, p.ts]); }
    }
    if (u.length) this.broadcast({ t: 'room:moves', u });
  }
}
