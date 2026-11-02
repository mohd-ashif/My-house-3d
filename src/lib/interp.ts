// Snapshot interpolation for other visitors: their position updates are buffered and replayed a little behind
// real time, so there is (nearly) always an update on either side of the moment being shown to blend between.
// Pure data in, pose out: no React, no three.js (lib/multiplayer.ts feeds it, RemotePlayers.tsx reads it).
//
// The delay starts at INTERP_DELAY_MS and only grows when a sender's updates arrive unevenly (relay batching,
// a jittery phone connection): it has to cover one send interval plus that jitter, or the buffer runs dry.

/** One position update, stamped with the sender's own clock (ms). */
export interface Sample { ts: number; x: number; f: number; z: number; y: number; s: number }
export type Pose = Omit<Sample, 'ts'>;

export interface Track {
  buf: Sample[];
  /** local clock - sender clock, for the fastest delivery seen lately (null until the first update). */
  offset: number | null;
  lastArrival: number;
  /** How late updates have been arriving lately, compared with that fastest delivery (decaying peak, ms). */
  jitter: number;
  /** The playback delay in use (ms); eases towards what the jitter needs. */
  delay: number;
  lastSampled: number;
}

/** The shortest playback delay: about one send interval plus a little delivery jitter. */
export const INTERP_DELAY_MS = 100;
/** ...and the longest, for a really bad connection. */
const MAX_DELAY_MS = 300;
/** Further than this between two updates is a teleport ("Go to room"): jump, don't glide. */
export const SNAP_DISTANCE = 5;
/** A longer pause than this between updates means they stood still: hold, then walk off on time. */
const GAP_MS = 250;
/** Roughly one send interval (MOVE_HZ = 12). */
const STEP_MS = 1000 / 12;
/** When the buffer runs dry anyway, carry on at their last velocity for at most this long, then hold. */
const MAX_EXTRAPOLATE_MS = 60;
const MAX_SAMPLES = 32;
/** The offset may creep up this much per ms, so one lucky fast delivery doesn't squeeze the delay forever. */
const DRIFT = 0.002;
/** The jitter peak fades by this much per ms (5 ms/s), so the delay comes back down once the connection settles. */
const JITTER_DECAY = 0.005;
/** The delay changes by at most this much per ms of real time: playback runs at most 10% fast or slow. */
const DELAY_RATE = 0.1;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const far = (a: Pose, b: Pose) => Math.hypot(b.x - a.x, b.z - a.z, b.f - a.f) > SNAP_DISTANCE;
const copy = (out: Pose, a: Pose) => { out.x = a.x; out.f = a.f; out.z = a.z; out.y = a.y; out.s = a.s; };

export const newTrack = (): Track => ({ buf: [], offset: null, lastArrival: 0, jitter: 0, delay: INTERP_DELAY_MS, lastSampled: 0 });

/** Adds an update that arrived at local time `now`. */
export function pushSample(tr: Track, smp: Sample, now: number) {
  const last = tr.buf[tr.buf.length - 1];
  if (last && smp.ts <= last.ts) return; // stale or repeated
  const lag = now - smp.ts;
  const since = now - tr.lastArrival;
  tr.offset = tr.offset === null ? lag : Math.min(lag, tr.offset + since * DRIFT);
  tr.jitter = Math.max(lag - tr.offset, tr.jitter - since * JITTER_DECAY);
  tr.lastArrival = now;
  // after standing still nothing was sent: pin the old spot to just before this update, so they set off
  // when they really did instead of creeping across the whole pause
  if (last && smp.ts - last.ts > GAP_MS && !far(last, smp)) tr.buf.push({ ...last, ts: smp.ts - STEP_MS });
  tr.buf.push(smp);
  if (tr.buf.length > MAX_SAMPLES) tr.buf.splice(0, tr.buf.length - MAX_SAMPLES);
}

/**
 * Where to show them at local time `now`: blended between the two updates around (now - delay), position lerped
 * and yaw turned the short way round; a teleport jumps at its own moment. False if nothing has arrived yet.
 */
export function sampleTrack(tr: Track, now: number, out: Pose): boolean {
  const b = tr.buf;
  if (!b.length || tr.offset === null) return false;
  // ease the delay towards one send interval + the recent jitter (+ a margin), within limits
  const want = Math.min(MAX_DELAY_MS, Math.max(INTERP_DELAY_MS, STEP_MS + tr.jitter + 25));
  const step = tr.lastSampled ? (now - tr.lastSampled) * DELAY_RATE : Infinity;
  tr.delay += Math.max(-step, Math.min(step, want - tr.delay));
  tr.lastSampled = now;

  const at = now - tr.offset - tr.delay; // on the sender's clock
  let i = 0;
  while (i + 1 < b.length && b[i + 1].ts <= at) i++;
  if (i > 1) b.splice(0, i - 1); // keep the update just before `at` (and one older, for the velocity), and what comes after
  if (i > 1) i = 1;
  const a = b[i], c = b[i + 1];
  if (c) {
    if (at <= a.ts || far(a, c)) { copy(out, a); return true; } // not started yet, or a teleport still to come
    const k = (at - a.ts) / (c.ts - a.ts);
    out.x = a.x + (c.x - a.x) * k;
    out.f = a.f + (c.f - a.f) * k;
    out.z = a.z + (c.z - a.z) * k;
    out.y = a.y + wrap(c.y - a.y) * k;
    out.s = a.s + (c.s - a.s) * k;
    return true;
  }
  // nothing newer has arrived: keep going a moment at their last velocity (they were walking), then hold
  const p = b[i - 1];
  copy(out, a);
  if (p && a.s > 0 && !far(p, a) && a.ts > p.ts) {
    const k = Math.min(at - a.ts, MAX_EXTRAPOLATE_MS) / (a.ts - p.ts);
    if (k > 0) { out.x += (a.x - p.x) * k; out.f += (a.f - p.f) * k; out.z += (a.z - p.z) * k; }
  }
  return true;
}
