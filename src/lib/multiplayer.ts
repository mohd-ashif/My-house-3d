// Multiplayer client: the one place that talks to the relay (server/multiplayer.mjs; message shapes in lib/protocol.mjs).
// It shares this visitor's position and keeps everyone else's in the same room.
// Features use the small API at the bottom: send() / on() for protocol messages, sendRoomEvent() / onRoomEvent()
// for anything ad hoc, and useMultiplayer() in React.
// Peer positions live in a module-level Map so the 3D scene can read them every frame without re-rendering React.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { player } from './player';
import { newTrack, pushSample, type Track } from './interp';
import { PUBLIC_ROOM, MOVE_HZ, EVENT_NAME, roomId, type ClientMsg, type RoomSnapshot, type ServerMsg } from './protocol.mjs';

export { PUBLIC_ROOM, CODE_LENGTH, newRoomCode, roomId } from './protocol.mjs';

export interface Peer {
  id: string; name: string; color: string;
  /** Latest position from the server (follow mode, minimap); avatars show the interpolated `track` instead. */
  x: number; f: number; z: number; y: number; s: number;
  /** Buffered updates for smooth playback (lib/interp.ts). */
  track: Track;
  /** Counts position jumps too big to be walking (a teleport, e.g. "Go to room"). */
  jumps: number;
}
export type MpStatus = 'off' | 'connecting' | 'online' | 'offline' | 'full';
export type MpEvent = { type: 'join' | 'leave'; id: string; name: string };

/** One update moving someone further than this (metres) was a teleport, not a walk (follow mode reacts to it). */
const JUMP = 3;
// a position is only worth sending once it changed by more than this
const MOVE_EPS = 0.03, YAW_EPS = 0.03, SPEED_EPS = 0.15;

export const peers = new Map<string, Peer>();
export const mp = {
  status: 'off' as MpStatus, selfId: '', selfName: '',
  /** The room this page is in (or trying to reach): 'public' or a private code. */
  room: PUBLIC_ROOM,
  hostId: null as string | null,
  /** The room's shared state as of the last snapshot (players live in `peers`). */
  shared: null as Omit<RoomSnapshot, 'players'> | null,
};

const listeners = new Set<(e?: MpEvent) => void>();
/** Called when someone joins/leaves or the connection status changes. */
export function onMpChange(fn: (e?: MpEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = (e?: MpEvent) => { view = null; listeners.forEach((f) => f(e)); };
const setStatus = (s: MpStatus) => { mp.status = s; emit(); };

let ws: WebSocket | null = null;
// One key per open page, sent with room:join: when this page reconnects (network switch, laptop wake, retry) the server
// drops the connection it still holds for the same key instead of showing a second copy of this visitor.
// Kept on globalThis so a hot reload in dev keeps the key and can close the socket the old module left open.
const g = globalThis as typeof globalThis & { __mpKey?: string; __mpSock?: WebSocket | null };
const clientKey = (g.__mpKey ??= Math.random().toString(36).slice(2) + Date.now().toString(36));
g.__mpSock?.close();
g.__mpSock = null;
let sendTimer: ReturnType<typeof setInterval> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;

function serverUrl() {
  const env = process.env.NEXT_PUBLIC_MP_URL;
  if (env) return env;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:3001`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- own position: MOVE_HZ, and only when it changed ----------

let sent: { x: number; f: number; z: number; y: number; s: number } | null = null;

function sendPosition() {
  const cur = { x: r2(player.x), f: r2(player.feet), z: r2(player.z), y: r2(player.bodyYaw), s: r2(Math.min(player.speed, 20)) };
  if (sent
    && Math.abs(cur.x - sent.x) < MOVE_EPS && Math.abs(cur.z - sent.z) < MOVE_EPS && Math.abs(cur.f - sent.f) < MOVE_EPS
    && Math.abs(wrap(cur.y - sent.y)) < YAW_EPS && Math.abs(cur.s - sent.s) < SPEED_EPS
    && !(cur.s === 0 && sent.s !== 0)) return; // (always say so when they stop)
  if (send('player:move', { ...cur, ts: Math.round(performance.now()) })) sent = cur;
}

// ---------- incoming ----------

function addPeer(p: Omit<Peer, 'track' | 'jumps'>) {
  peers.set(p.id, { ...p, track: newTrack(), jumps: 0 });
}

function onMessage(m: ServerMsg) {
  switch (m.t) {
    case 'room:snapshot': {
      const { players, ...shared } = m.room;
      retries = 0;
      mp.selfId = m.self;
      mp.room = shared.id;
      mp.hostId = shared.hostId;
      mp.shared = shared;
      peers.clear();
      for (const p of players) if (p.id !== m.self) addPeer(p);
      sent = null; // tell the room where we are straight away
      setStatus('online');
      break;
    }
    case 'player:join':
      addPeer(m.p);
      emit({ type: 'join', id: m.p.id, name: m.p.name });
      break;
    case 'player:leave': {
      const p = peers.get(m.id);
      if (p) { peers.delete(p.id); emit({ type: 'leave', id: p.id, name: p.name }); }
      break;
    }
    case 'room:moves': {
      const now = performance.now();
      for (const [id, x, f, z, y, s, ts] of m.u) {
        const p = peers.get(id);
        if (!p) continue;
        if (Math.hypot(x - p.x, z - p.z, f - p.f) > JUMP) p.jumps++;
        Object.assign(p, { x, f, z, y, s });
        pushSample(p.track, { ts, x, f, z, y, s }, now);
      }
      break;
    }
    case 'room:host':
      mp.hostId = m.hostId;
      emit();
      break;
    case 'room:full':
      setStatus('full');
      break;
    case 'room:error':
      console.warn('[multiplayer]', m.reason);
      break;
  }
  handlers.get(m.t)?.forEach((fn) => fn(m));
}

function open() {
  clearTimeout(retryTimer);
  setStatus('connecting');
  let sock: WebSocket;
  try { sock = new WebSocket(serverUrl()); } catch { setStatus('offline'); return; }
  ws = g.__mpSock = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: 'room:join', room: mp.room, name: mp.selfName, key: clientKey } satisfies ClientMsg));
  sock.onmessage = (ev) => {
    let m: ServerMsg;
    try { m = JSON.parse(String(ev.data)); } catch { return; }
    onMessage(m);
  };
  sock.onclose = () => {
    if (ws !== sock || g.__mpSock !== sock) return; // replaced, closed on purpose, or left over from a hot reload
    ws = null;
    peers.clear();
    if (mp.status === 'full') { emit(); return; }
    setStatus('offline');
    retryTimer = setTimeout(open, Math.min(15000, 1000 * 2 ** retries++)); // back off, keep trying
  };
}

/** Enter a room ('public' or a private code) under this name. Without a relay the page just stays solo. */
export function connect(name: string, room: string = PUBLIC_ROOM) {
  disconnect();
  mp.selfName = name;
  mp.room = roomId(room) ?? PUBLIC_ROOM;
  retries = 0;
  open();
  sendTimer = setInterval(sendPosition, 1000 / MOVE_HZ);
}

/** Leave (back to the intro screen). */
export function disconnect() {
  clearTimeout(retryTimer);
  clearInterval(sendTimer);
  const sock = ws;
  ws = g.__mpSock = null;
  if (sock?.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: 'room:leave' } satisfies ClientMsg));
  sock?.close();
  peers.clear();
  mp.selfId = '';
  mp.hostId = null;
  mp.shared = null;
  if (mp.status !== 'off') setStatus('off');
}

// leaving the page (or putting it in the back/forward cache) closes the socket right away, so nobody lingers
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (ws) disconnect(); });

// ---------- the API features use ----------

type ClientType = ClientMsg['t'];
type ServerType = ServerMsg['t'];
type Body<K extends ClientType> = Omit<Extract<ClientMsg, { t: K }>, 't'>;
export type MsgOf<K extends ServerType> = Extract<ServerMsg, { t: K }>;

const handlers = new Map<ServerType, Set<(m: ServerMsg) => void>>();

/** Send a protocol message to the relay. False (and nothing sent) while not connected: solo play just carries on. */
export function send<K extends ClientType>(t: K, data: Body<K>): boolean {
  if (ws?.readyState !== WebSocket.OPEN || mp.status !== 'online') return false;
  ws.send(JSON.stringify({ t, ...data }));
  return true;
}

/** Hear every `t` message from the relay (after this module has applied it). Returns the unsubscribe. */
export function on<K extends ServerType>(t: K, fn: (m: MsgOf<K>) => void): () => void {
  let set = handlers.get(t);
  if (!set) handlers.set(t, (set = new Set()));
  const h = fn as (m: ServerMsg) => void;
  set.add(h);
  return () => { set!.delete(h); };
}

/** Tell everyone else in the room something (e.g. sendRoomEvent('door:open', { id })). */
export function sendRoomEvent(name: string, data?: unknown) {
  if (!EVENT_NAME.test(name)) throw new Error(`bad room event name: ${name}`);
  return send('room:event', { name, data });
}

/** Hear a room event by name, with who sent it. */
export function onRoomEvent<T = unknown>(name: string, fn: (data: T, from: string) => void) {
  return on('room:event', (m) => { if (m.name === name) fn(m.data as T, m.from); });
}

// ---------- React ----------

export interface MpView {
  status: MpStatus; room: string; selfId: string; selfName: string; hostId: string | null;
  isHost: boolean;
  /** Everyone else, for lists (positions: read `peers` in a frame loop instead). */
  peers: { id: string; name: string; color: string }[];
}
let view: MpView | null = null;
function getView(): MpView {
  return (view ??= {
    status: mp.status, room: mp.room, selfId: mp.selfId, selfName: mp.selfName, hostId: mp.hostId,
    isHost: !!mp.selfId && mp.hostId === mp.selfId,
    peers: [...peers.values()].map(({ id, name, color }) => ({ id, name, color })),
  });
}
const subscribe = (fn: () => void) => onMpChange(() => fn());

/** Connection status, room, host and who is here (re-renders on joins, leaves, status and host changes), plus the API. */
export function useMultiplayer() {
  const state = useSyncExternalStore(subscribe, getView, getView);
  return { ...state, send, on, sendRoomEvent, onRoomEvent };
}

/** Subscribe to one relay message type for as long as the component is mounted. */
export function useMpMessage<K extends ServerType>(t: K, fn: (m: MsgOf<K>) => void) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => on(t, (m) => ref.current(m)), [t]);
}

/** Subscribe to one room event by name for as long as the component is mounted. */
export function useRoomEvent<T = unknown>(name: string, fn: (data: T, from: string) => void) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => onRoomEvent<T>(name, (d, from) => ref.current(d, from)), [name]);
}

// ---------- room links: ?room=CODE ----------

/** The private room a shared link points at, if any. */
export function linkedRoom(): string | null {
  if (typeof window === 'undefined') return null;
  const id = roomId(new URLSearchParams(window.location.search).get('room'));
  return id && id !== PUBLIC_ROOM ? id : null;
}

/** Puts the room into the address bar (and takes it out for the public room), so the link brings people here. */
export function rememberRoom(room: string) {
  try {
    const u = new URL(window.location.href);
    if (room === PUBLIC_ROOM) u.searchParams.delete('room');
    else u.searchParams.set('room', room);
    window.history.replaceState(null, '', u.toString());
  } catch { /* ignore */ }
}

/** A link that opens this page in `room`. */
export function roomLink(room: string) {
  const u = new URL(window.location.href);
  u.searchParams.set('room', room);
  return u.toString();
}
