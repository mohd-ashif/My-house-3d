// Emotes (wave, clap, point, sit, dance) and reactions (❤️ 👍 😂 😮 🔥): who is doing what, and the procedural poses
// the avatars play for them. This visitor is SELF; everyone else goes by their multiplayer id.
// Local actions go out as player:emote / player:react (lib/protocol.mjs); the relay rate-limits them too.
// Moving ends an emote: here for this visitor, in RemotePlayers for everyone else (they are seen walking off).
import { useSyncExternalStore } from 'react';
import { player } from './player';
import { send, on, peers } from './multiplayer';
import { INTERP_DELAY_MS } from './interp';
import { EMOTES, REACTIONS, LOOPING_EMOTES, ACTION_COOLDOWN_MS, type Emote, type Reaction } from './protocol.mjs';

export { EMOTES, REACTIONS, type Emote, type Reaction };

export const SELF = 'self';

/** seconds: how long a one-off emote plays (sit and dance loop). */
export const EMOTE_INFO: Record<Emote, { label: string; icon: string; seconds: number }> = {
  wave: { label: 'Wave', icon: '👋', seconds: 2.4 },
  clap: { label: 'Clap', icon: '👏', seconds: 2.6 },
  point: { label: 'Point', icon: '👉', seconds: 2.2 },
  sit: { label: 'Sit', icon: '🪑', seconds: 0 },
  dance: { label: 'Dance', icon: '💃', seconds: 0 },
};
export const REACTION_EMOJI: Record<Reaction, string> = { heart: '❤️', like: '👍', laugh: '😂', wow: '😮', fire: '🔥' };

/** How long a reaction floats over a head (matches the CSS animation). */
export const FLOAT_MS = 2000;
const MAX_FLOATERS = 4;
/** Faster than this (m/s) counts as moving: you can't start an emote, and a running one ends. */
export const STILL = 0.3;

// ---------- who is emoting ----------

/** t0: performance.now() when it starts. Someone else's starts after their playback delay, in step with their walking. */
interface Playing { e: Emote; t0: number }
const playing = new Map<string, Playing>();

/** The emote `id` is playing (or about to), if any; a one-off that has finished is dropped. */
function emoteOf(id: string, now: number): Playing | null {
  const p = playing.get(id);
  if (!p) return null;
  const secs = EMOTE_INFO[p.e].seconds;
  if (secs && now - p.t0 > secs * 1000) { playing.delete(id); return null; }
  return p;
}

function startRemote(id: string, e: Emote | null) {
  if (!e) { playing.delete(id); return; }
  playing.set(id, { e, t0: performance.now() + (peers.get(id)?.track.delay ?? INTERP_DELAY_MS) });
}

// ---------- reactions ----------

export interface Floater { key: number; r: Reaction }
const NONE: Floater[] = [];
const floaters = new Map<string, Floater[]>();
const floatListeners = new Set<() => void>();
const notify = () => floatListeners.forEach((f) => f());
let nextKey = 1;

function addFloater(id: string, r: Reaction) {
  const f = { key: nextKey++, r };
  floaters.set(id, [...(floaters.get(id) ?? NONE), f].slice(-MAX_FLOATERS));
  notify();
  setTimeout(() => {
    const list = floaters.get(id);
    if (!list?.includes(f)) return;
    const rest = list.filter((x) => x !== f);
    if (rest.length) floaters.set(id, rest); else floaters.delete(id);
    notify();
  }, FLOAT_MS);
}

/** The reactions floating over `id`'s head right now (re-renders when they change). */
export function useFloaters(id: string): Floater[] {
  const get = () => floaters.get(id) ?? NONE;
  return useSyncExternalStore((fn) => { floatListeners.add(fn); return () => { floatListeners.delete(fn); }; }, get, () => NONE);
}

// ---------- this visitor ----------

const last = { emote: -Infinity, react: -Infinity };
export type EmoteResult = 'ok' | 'moving' | 'cooldown';

/** Start an emote; the same looping one again stands back up. Refused while walking (or auto-walking) and during the cooldown. */
export function playEmote(e: Emote): EmoteResult {
  const now = performance.now();
  const cur = emoteOf(SELF, now);
  const stop = cur?.e === e && LOOPING_EMOTES.includes(e);
  if (!stop && (player.speed > STILL || player.auto)) return 'moving';
  if (now - last.emote < ACTION_COOLDOWN_MS) return 'cooldown';
  last.emote = now;
  if (stop) playing.delete(SELF); else playing.set(SELF, { e, t0: now });
  send('player:emote', { e: stop ? null : e });
  return 'ok';
}

/** Float a reaction over this visitor's head, for everyone. False during the cooldown. */
export function react(r: Reaction): boolean {
  const now = performance.now();
  if (now - last.react < ACTION_COOLDOWN_MS) return false;
  last.react = now;
  addFloater(SELF, r);
  send('player:react', { r });
  return true;
}

// ---------- from the relay ----------

// (kept on globalThis so a hot reload in dev replaces these subscriptions instead of doubling them)
const g = globalThis as typeof globalThis & { __emotesOff?: () => void };
g.__emotesOff?.();
const offs = [
  on('room:snapshot', (m) => {
    for (const id of [...playing.keys()]) if (id !== SELF) playing.delete(id);
    for (const id of [...floaters.keys()]) if (id !== SELF) floaters.delete(id);
    for (const p of m.room.players) if (p.id !== m.self && p.emote) startRemote(p.id, p.emote);
    notify();
  }),
  on('player:join', (m) => startRemote(m.p.id, m.p.emote)),
  on('player:leave', (m) => { playing.delete(m.id); if (floaters.delete(m.id)) notify(); }),
  on('player:emote', (m) => startRemote(m.id, m.e)),
  on('player:react', (m) => { if (peers.has(m.id)) addFloater(m.id, m.r); }),
];
g.__emotesOff = () => offs.forEach((f) => f());

// ---------- poses ----------

/** Limb rotations (radians) about the hip/shoulder pivots: x swings forward, z lifts sideways (+ = towards +x). */
export interface LimbPose { x: number; z: number }
export interface EmotePose {
  legL: LimbPose; legR: LimbPose; armL: LimbPose; armR: LimbPose;
  /** How far the body sinks (m), and turns from its facing (radians). */
  drop: number; yaw: number;
}
export const restPose = (): EmotePose => ({ legL: { x: 0, z: 0 }, legR: { x: 0, z: 0 }, armL: { x: 0, z: 0 }, armR: { x: 0, z: 0 }, drop: 0, yaw: 0 });

const limb = (l: LimbPose, x: number, z: number) => { l.x = x; l.z = z; };

/** Writes emote `e`'s pose `t` seconds in into `out`. */
export function emotePose(e: Emote, t: number, out: EmotePose): EmotePose {
  const s = Math.sin;
  out.drop = 0; out.yaw = 0;
  limb(out.legL, 0, 0); limb(out.legR, 0, 0); limb(out.armL, 0, 0); limb(out.armR, 0, 0);
  switch (e) {
    case 'wave': // right hand up, waving side to side
      limb(out.armR, 0.15, 2.5 + s(t * 9) * 0.35);
      limb(out.armL, 0.05, -0.08);
      break;
    case 'clap': // both hands in front, meeting in the middle
      { const k = 0.38 + 0.2 * (0.5 + 0.5 * s(t * 14));
        limb(out.armL, 1.25, k); limb(out.armR, 1.25, -k); }
      break;
    case 'point': // right arm straight ahead, a small nod of the hand
      limb(out.armR, 1.45 + s(t * 5) * 0.04, -0.08);
      limb(out.armL, 0.05, -0.05);
      break;
    case 'sit': // on the floor, legs out, leaning back on the hands
      limb(out.legL, 1.45, -0.1); limb(out.legR, 1.45, 0.1);
      limb(out.armL, -0.4 + s(t * 1.4) * 0.03, -0.18); limb(out.armR, -0.4 + s(t * 1.4) * 0.03, 0.18);
      out.drop = 0.76;
      break;
    case 'dance': // arms up and swaying, bouncing, hips turning
      limb(out.armL, s(t * 6) * 0.3, -(2.2 + 0.4 * s(t * 6)));
      limb(out.armR, -s(t * 6) * 0.3, 2.2 + 0.4 * s(t * 6 + Math.PI));
      limb(out.legL, s(t * 6) * 0.35, -0.05); limb(out.legR, -s(t * 6) * 0.35, 0.05);
      out.drop = 0.06 * (0.5 + 0.5 * s(t * 12));
      out.yaw = 0.45 * s(t * 3);
      break;
  }
  return out;
}

/** Per-avatar playback: the emote being shown, its pose, and how much of it is blended in. */
export interface EmoteAnim { e: Emote | null; t0: number; w: number; pose: EmotePose }
export const newEmoteAnim = (): EmoteAnim => ({ e: null, t0: 0, w: 0, pose: restPose() });

/**
 * One frame of `id`'s emote: eases it in or out and updates `a.pose`. Moving ends it.
 * Returns the blend weight (0 = just the walk cycle, 1 = just the emote).
 */
export function stepEmote(a: EmoteAnim, id: string, now: number, dt: number, moving: boolean): number {
  let p = emoteOf(id, now);
  if (p && now >= p.t0 && moving) { playing.delete(id); p = null; }
  const on = !!p && now >= p.t0;
  if (on) { a.e = p!.e; a.t0 = p!.t0; }
  a.w += ((on ? 1 : 0) - a.w) * (1 - Math.exp(-(on ? 9 : 7) * dt));
  if (!on && a.w < 0.01) { a.e = null; a.w = 0; }
  if (a.e) emotePose(a.e, (now - a.t0) / 1000, a.pose);
  return a.e ? a.w : 0;
}
