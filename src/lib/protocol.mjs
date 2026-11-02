// Multiplayer wire protocol, shared by the relay (server/*.mjs) and the browser (lib/multiplayer.ts).
// Plain JS so Node runs it as is; the JSDoc types below are what TypeScript sees (tsconfig: allowJs).
// Every frame is one JSON object whose `t` names the message.
//
//   client -> server  room:join     { room, name, key }   enter a room (key: one per open page); again to switch rooms
//                     room:leave    {}                     back to the intro, socket stays open
//                     player:move   { x, f, z, y, s, ts }  position (feet height f, body yaw y, speed s) at the sender's clock ts (ms),
//                                                          MOVE_HZ times a second at most, and only when it changed
//                     room:event    { name, data }         anything a feature wants everyone else in the room to hear
//                     player:emote  { e }                  start an emote (EMOTES), or stop one (null); at most once per ACTION_COOLDOWN_MS
//                     player:react  { r }                  a reaction (REACTIONS) floating over your head; same cooldown, counted apart
//                     tour:update   { tour }               host of a private room only: the group tour's state (TourSync)
//                     room:host     { id }                 host only: hand the host role to another player in the room
//   server -> client  room:snapshot { self, room }         your id + the whole room state, right after joining
//                     player:join   { p } / player:leave { id }
//                     room:moves    { u: [[id, x, f, z, y, s, ts], ...] }   moved players, batched every relay tick (50 ms)
//                     room:event    { from, name, data }   a room:event from another player in the room
//                     player:emote  { id, e } / player:react { id, r }   from another player in the room
//                     tour:state    { tour }               the group tour changed (from the host)
//                     room:host     { hostId, reason }     someone else is host now: the host left, handed it over, or came back
//                     room:full     {}                     the room is at capacity
//                     room:error    { reason }             a malformed room code, or a host-only message from someone else

export const PUBLIC_ROOM = 'public';
export const MAX_PLAYERS = 60;
export const CODE_LENGTH = 6;
/** How often a client sends its position, at most. */
export const MOVE_HZ = 12;
/** room:event names: a word, optionally namespaced (door:open, chat.say). */
export const EVENT_NAME = /^[a-z][\w:.-]{0,31}$/i;
/** Emotes, in key order (desktop 1-5). sit and dance loop until the player moves; the others play once. */
export const EMOTES = /** @type {const} */ (['wave', 'clap', 'point', 'sit', 'dance']);
export const LOOPING_EMOTES = /** @type {readonly string[]} */ (['sit', 'dance']);
/** Reactions, in key order (desktop 6-0). Ids on the wire; the emoji are the client's business. */
export const REACTIONS = /** @type {const} */ (['heart', 'like', 'laugh', 'wow', 'fire']);
/** One emote, and separately one reaction, per player per this long. */
export const ACTION_COOLDOWN_MS = 1000;
/** Group tour phases, as in src/lib/tourMachine.ts. */
export const TOUR_PHASES = /** @type {const} */ (['walking', 'framing', 'caption', 'done']);
/** @type {TourSync} */
export const IDLE_TOUR = Object.freeze({ active: false, step: 0, paused: false, phase: 'walking', leg: 0, run: 0 });

/**
 * A group tour state from the wire, checked and normalised; null if it is not one.
 * @param {unknown} v
 * @returns {TourSync | null}
 */
export function cleanTour(v) {
  if (!v || typeof v !== 'object') return null;
  const t = /** @type {Record<string, unknown>} */ (v);
  const int = (/** @type {unknown} */ n, /** @type {number} */ max) => (Number.isInteger(n) && /** @type {number} */ (n) >= 0 && /** @type {number} */ (n) <= max ? /** @type {number} */ (n) : null);
  const step = int(t.step, 63), leg = int(t.leg, 1e9), run = int(t.run, 1e9);
  const phase = TOUR_PHASES.find((p) => p === t.phase);
  if (typeof t.active !== 'boolean' || typeof t.paused !== 'boolean' || step === null || leg === null || run === null || !phase) return null;
  return { active: t.active, step, paused: t.paused, phase, leg, run };
}

// no 0/O or 1/I/L: codes get read out loud and typed on phones
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * A room id from user input or the wire: 'public', or a private code (upper-cased). Null if neither.
 * @param {unknown} v
 * @returns {string | null}
 */
export function roomId(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.toLowerCase() === PUBLIC_ROOM) return PUBLIC_ROOM;
  const code = s.toUpperCase();
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_CHARS.includes(c)) ? code : null;
}

/** A fresh private room code, like ASH42K. */
export function newRoomCode() {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/** @typedef {typeof EMOTES[number]} Emote */
/** @typedef {typeof REACTIONS[number]} Reaction */

/**
 * What other visitors may see of a player. emote: a looping emote they are in the middle of (for late joiners).
 * @typedef {{ id: string, name: string, color: string, x: number, f: number, z: number, y: number, s: number, emote: Emote | null }} PublicPlayer
 */

/**
 * The group tour (private rooms): the host's tour state. step: stop index; leg: bumped whenever everyone should
 * (re)start walking to `step`; run: bumped by each (re)start of the whole tour.
 * @typedef {{ active: boolean, step: number, paused: boolean, phase: typeof TOUR_PHASES[number], leg: number, run: number }} TourSync
 */

/**
 * Everything a room shares. New shared things get a field here; the snapshot carries them to late joiners.
 * @typedef {{
 *   id: string,
 *   hostId: string | null,
 *   players: PublicPlayer[],
 *   tour: TourSync,
 *   design: string | null,
 *   isNight: boolean,
 *   doors: Record<string, boolean>,
 *   lights: Record<string, boolean>,
 *   collectibles: Record<string, string>,
 * }} RoomSnapshot
 * design: style id, null until someone picks one for the room. doors/lights: id -> open/on.
 * collectibles: id -> id of the player who picked it up.
 */

/**
 * ts (player:move, last entry of a room:moves row): the sender's own monotonic clock in ms. Receivers only use the
 * differences between one sender's stamps, so clocks never need to agree.
 * @typedef {{ t: 'room:join', room: string, name: string, key: string }
 *   | { t: 'room:leave' }
 *   | { t: 'player:move', x: number, f: number, z: number, y: number, s: number, ts: number }
 *   | { t: 'room:event', name: string, data?: unknown }
 *   | { t: 'player:emote', e: Emote | null }
 *   | { t: 'player:react', r: Reaction }
 *   | { t: 'tour:update', tour: TourSync }
 *   | { t: 'room:host', id: string }} ClientMsg
 */

/**
 * @typedef {{ t: 'room:snapshot', self: string, room: RoomSnapshot }
 *   | { t: 'player:join', p: PublicPlayer }
 *   | { t: 'player:leave', id: string }
 *   | { t: 'room:moves', u: [string, number, number, number, number, number, number][] }
 *   | { t: 'room:event', from: string, name: string, data?: unknown }
 *   | { t: 'player:emote', id: string, e: Emote | null }
 *   | { t: 'player:react', id: string, r: Reaction }
 *   | { t: 'tour:state', tour: TourSync }
 *   | { t: 'room:host', hostId: string | null, reason: 'left' | 'transfer' | 'back' }
 *   | { t: 'room:full' }
 *   | { t: 'room:error', reason: 'bad-room' | 'not-host' }} ServerMsg
 */
