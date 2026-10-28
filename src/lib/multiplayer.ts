// Multiplayer client: shares this visitor's position and keeps everyone else's (see server/multiplayer.mjs).
// Peer positions live in a module-level Map so the 3D scene can read them every frame without re-rendering React.
import { player } from './player';

export interface Peer {
  id: string; name: string; color: string;
  /** Latest position from the server; the avatar eases towards it. */
  x: number; f: number; z: number; y: number; s: number;
}
export type MpStatus = 'off' | 'connecting' | 'online' | 'offline' | 'full';
export type MpEvent = { type: 'join' | 'leave'; name: string };

export const peers = new Map<string, Peer>();
export const mp = { status: 'off' as MpStatus, selfId: '', selfName: '' };

const listeners = new Set<(e?: MpEvent) => void>();
/** Called when someone joins/leaves or the connection status changes. */
export function onMpChange(fn: (e?: MpEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = (e?: MpEvent) => listeners.forEach((f) => f(e));
const setStatus = (s: MpStatus) => { mp.status = s; emit(); };

let ws: WebSocket | null = null;
let sendTimer: ReturnType<typeof setInterval> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retries = 0;
let last = '';

function serverUrl() {
  const env = process.env.NEXT_PUBLIC_MP_URL;
  if (env) return env;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:3001`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function sendPosition() {
  if (ws?.readyState !== WebSocket.OPEN) return;
  const msg = JSON.stringify({ t: 'p', x: r2(player.x), f: r2(player.feet), z: r2(player.z), y: r2(player.bodyYaw), s: r2(Math.min(player.speed, 20)) });
  if (msg === last) return; // standing still: nothing to send
  last = msg;
  ws.send(msg);
}

function open() {
  clearTimeout(retryTimer);
  setStatus('connecting');
  let sock: WebSocket;
  try { sock = new WebSocket(serverUrl()); } catch { setStatus('offline'); return; }
  ws = sock;
  sock.onopen = () => { sock.send(JSON.stringify({ t: 'hello', name: mp.selfName })); };
  sock.onmessage = (ev) => {
    let m: { t: string; [k: string]: unknown };
    try { m = JSON.parse(String(ev.data)); } catch { return; }
    if (m.t === 'welcome') {
      retries = 0;
      mp.selfId = m.id as string;
      peers.clear();
      for (const p of m.players as Peer[]) peers.set(p.id, p);
      last = '';
      setStatus('online');
    } else if (m.t === 'join') {
      const p = m.p as Peer;
      peers.set(p.id, p);
      emit({ type: 'join', name: p.name });
    } else if (m.t === 'leave') {
      const p = peers.get(m.id as string);
      if (p) { peers.delete(p.id); emit({ type: 'leave', name: p.name }); }
    } else if (m.t === 's') {
      for (const [id, x, f, z, y, s] of m.u as [string, number, number, number, number, number][]) {
        const p = peers.get(id);
        if (p) Object.assign(p, { x, f, z, y, s });
      }
    } else if (m.t === 'full') {
      setStatus('full');
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return; // replaced or closed on purpose
    ws = null;
    peers.clear();
    if (mp.status === 'full') { emit(); return; }
    setStatus('offline');
    retryTimer = setTimeout(open, Math.min(15000, 1000 * 2 ** retries++)); // back off, keep trying
  };
}

/** Enter the shared house under this name. */
export function connect(name: string) {
  disconnect();
  mp.selfName = name;
  retries = 0;
  open();
  sendTimer = setInterval(sendPosition, 100);
}

/** Leave (back to the intro screen). */
export function disconnect() {
  clearTimeout(retryTimer);
  clearInterval(sendTimer);
  const sock = ws;
  ws = null;
  sock?.close();
  peers.clear();
  mp.selfId = '';
  if (mp.status !== 'off') setStatus('off');
}
