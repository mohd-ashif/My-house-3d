// Host-led group tour, in private rooms: the host runs the guided tour as usual, their tour state
// (lib/tourMachine.ts) becomes the room's, and everyone else's character walks it in step. Roles:
//   host      drives it: their tour changes go out as tour:update (the relay takes them from the host only)
//   follower  the room's state is applied to the local tour, which walks without a clock of its own (useTour clock: false)
//   away      left the group to look around; "Rejoin group" teleports to the current stop and follows again
//   none      no group tour here (public room, offline, or none running): the tour is solo, as it always was
// Leg numbers (TourState.leg) are each client's own; legBase turns the room's into ours.
import { useSyncExternalStore } from 'react';
import { house } from './houseState';
import { mp, send, on, peers, onMpChange, PUBLIC_ROOM } from './multiplayer';
import { TOUR_IDLE, type TourState } from './tourMachine';
import { IDLE_TOUR, type TourSync } from './protocol.mjs';

export type GroupRole = 'none' | 'host' | 'follower' | 'away';
export type GroupNotice = { type: 'started' | 'ended'; by: string };
/** What the tour hook can do for us: put the character at a stop, or at the start of the tour. */
export interface TourMoves { hop: (index: number) => void; toStart: () => void }

let shared: TourSync = IDLE_TOUR; // the room's tour, as last heard (or sent)
let away = false;
let legBase = 0;
let pendingRun: number | null = null; // host: a start of ours on its way out (the room has no tour yet)
let moves: TourMoves | null = null;

const isPrivate = () => mp.status === 'online' && mp.room !== PUBLIC_ROOM;
const amHost = () => !!mp.selfId && mp.hostId === mp.selfId;
const hostName = () => (amHost() ? mp.selfName : (mp.hostId && peers.get(mp.hostId)?.name) || '');

export function groupRole(): GroupRole {
  if (!isPrivate() || !shared.active) return 'none';
  if (amHost()) return 'host';
  return away ? 'away' : 'follower';
}

/** Hook up the tour's moves (App does this once the tour hook exists). */
export function setTourMoves(m: TourMoves | null) { moves = m; }

// ---------- room -> this visitor ----------

type Apply = 'live' | 'sync' | 'jump' | 'start';
/**
 * Bring the local tour in line with the room's. live: the next update from the host; sync: same stop, just re-align
 * (reconnect); jump: teleport to the current stop (late joiner, rejoin); start: everyone to the start, from the top.
 */
function apply(how: Apply) {
  const cur = house.get().tour;
  const s = shared;
  if (!s.active) { if (cur.active) house.set({ tour: { ...TOUR_IDLE, leg: cur.leg } }); return; }
  if (how === 'start') moves?.toStart();
  if (how === 'jump') moves?.hop(s.step);
  if (how === 'sync') legBase = cur.leg - s.leg; // the same leg as ours: nothing to re-walk
  else if (how !== 'live') legBase = cur.leg + 1 - s.leg; // a new leg number: walk (or settle) afresh
  // hopped in while the host is still on the way: already there, so just look at the stop
  const phase = how === 'jump' && s.phase === 'walking' ? 'framing' : s.phase;
  house.set({ tour: { active: true, index: s.step, phase, paused: s.paused, leg: s.leg + legBase } });
}

const same = (a: TourState, s: TourSync) => a.active && a.index === s.step;

// ---------- this visitor (host) -> room ----------

const toSync = (t: TourState, run: number): TourSync =>
  ({ active: t.active, step: t.index, paused: t.paused, phase: t.phase, leg: Math.max(0, t.leg - legBase), run });

function pushOwn() {
  shared = toSync(house.get().tour, pendingRun ?? shared.run);
  pendingRun = null;
  send('tour:update', { tour: shared });
}

/** Start (or restart) the tour for everyone in the room; `start` is the tour hook's own start. False unless host of a private room. */
export function startGroupTour(start: () => void): boolean {
  if (!isPrivate() || !amHost()) return false;
  away = false;
  pendingRun = shared.run + 1;
  start(); // teleports to the first stop and dispatches 'start': the store listener below sends it
  return true;
}

/** Follower: go and look around alone (any movement of your own does this too). */
export function leaveGroup() {
  if (groupRole() !== 'follower') return;
  away = true;
  house.set({ tour: { ...TOUR_IDLE, leg: house.get().tour.leg } });
  changed();
}

/** Back to the group: teleport to the current stop and follow again. */
export function rejoinGroup() {
  if (groupRole() !== 'away') return;
  away = false;
  apply('jump');
  changed();
}

// ---------- wiring ----------

const listeners = new Set<() => void>();
const noticeListeners = new Set<(n: GroupNotice) => void>();
const notice = (n: GroupNotice) => noticeListeners.forEach((f) => f(n));
/** Group tour started or ended by someone else (for a toast). */
export function onGroupNotice(fn: (n: GroupNotice) => void) { noticeListeners.add(fn); return () => { noticeListeners.delete(fn); }; }

// (kept on globalThis so a hot reload in dev replaces these subscriptions instead of doubling them)
const g = globalThis as typeof globalThis & { __groupTourOff?: () => void };
g.__groupTourOff?.();
let lastTour = house.get().tour;
const offs = [
  // the host's own tour changes go out to the room
  house.subscribe(() => {
    const t = house.get().tour;
    if (t === lastTour) return;
    lastTour = t;
    if (isPrivate() && amHost() && (shared.active || pendingRun !== null)) { pushOwn(); changed(); }
  }),
  on('room:snapshot', (m) => {
    shared = m.room.tour;
    away = false;
    const cur = house.get().tour;
    if (shared.active) {
      if (!amHost()) apply(same(cur, shared) ? 'sync' : 'jump'); // late joiner (or back after a dropout)
      else if (cur.active) pushOwn(); // the host's page reconnecting: whatever happened meanwhile is the tour now
      else apply('jump'); // host of a tour we aren't on (handed over while we were away)
    }
    changed();
  }),
  on('tour:state', (m) => {
    const prev = shared;
    shared = m.tour;
    if (!shared.active) {
      if (prev.active) { away = false; apply('live'); notice({ type: 'ended', by: hostName() }); }
    } else if (!prev.active || shared.run !== prev.run) {
      away = false;
      apply('start');
      notice({ type: 'started', by: hostName() });
    } else if (!away) apply('live');
    changed();
  }),
  on('room:host', () => {
    // host now, of a tour we left: back on it, at the current stop
    if (amHost() && shared.active && (away || !house.get().tour.active)) { away = false; apply('jump'); }
    changed();
  }),
  onMpChange(() => changed()),
];
g.__groupTourOff = () => offs.forEach((f) => f());

// ---------- React ----------

export interface GroupView extends TourSync {
  role: GroupRole;
  /** May start a group tour: host of a private room. */
  canLead: boolean;
  hostName: string;
}
let view: GroupView | null = null;
function changed() { view = null; listeners.forEach((f) => f()); }
const getView = (): GroupView => (view ??= { ...shared, role: groupRole(), canLead: isPrivate() && amHost(), hostName: hostName() });
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** The group tour as this visitor sees it; re-renders on changes. */
export function useGroupTour(): GroupView { return useSyncExternalStore(subscribe, getView, getView); }
