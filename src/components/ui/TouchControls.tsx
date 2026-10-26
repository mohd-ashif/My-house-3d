'use client';
import { useEffect, useRef, useState } from 'react';
import type { World } from '@/lib/world';
import { player, touchLook, stopAuto } from '@/lib/player';
import { pickFloor } from '@/lib/pick';
import { findPath, levelOf } from '@/lib/nav';
import { haptic } from '@/lib/device';
import { IconRun } from './icons';

const JOY_ZONE = 0.4;      // left 40 % of the screen spawns the joystick
const TAP_MS = 200, TAP_PX = 10, DOUBLE_MS = 300;

/** Walk to a screen point on the floor (tap-to-walk). Returns false when there is no way there. */
export function walkToScreenPoint(world: World, clientX: number, clientY: number, rect: DOMRect): boolean {
  const hit = pickFloor(clientX, clientY, rect);
  if (!hit) return false;
  const level = levelOf(world, player.feet);
  if (!hit.wall && Math.abs(hit.y - level) > 0.8 && hit.y > 0.05) return false; // another floor (through the cutout)
  const path = findPath(world, player.x, player.z, player.feet, hit.x, hit.z);
  if (!path || !path.length) return false;
  player.lookAt = null;
  player.auto = { path, i: 0, speed: 1.9, stuck: 0 };
  player.marker = { x: hit.x, y: hit.wall ? level : hit.y, z: hit.z, t: 0 };
  return true;
}

interface Ptr { id: number; x: number; y: number; sx: number; sy: number; t0: number }

export default function TouchControls({ world, onManualMove, onToggleView }: {
  world: World; onManualMove: () => void; onToggleView: () => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });
  const edgeSince = useRef(0);
  const looks = useRef(new Map<number, Ptr>());
  const pinch = useRef<{ d: number; zoom: number } | null>(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const pendingTap = useRef<number | null>(null);
  const [joy, setJoy] = useState<{ x: number; y: number; kx: number; ky: number } | null>(null);
  const [running, setRunning] = useState(false);

  // run detection runs on a timer so holding still at the edge also counts
  useEffect(() => {
    const t = setInterval(() => {
      const r = joyId.current !== null && edgeSince.current > 0 && performance.now() - edgeSince.current > 1000;
      if (r !== player.run) { player.run = r; setRunning(r); if (r) haptic(15); }
    }, 100);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => { if (pendingTap.current) clearTimeout(pendingTap.current); }, []);

  const radius = () => Math.max(42, Math.min(64, Math.min(window.innerWidth, window.innerHeight) * 0.12));

  const down = (e: React.PointerEvent) => {
    const el = layer.current;
    if (!el) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    const w = window.innerWidth;
    if (e.clientX < w * JOY_ZONE && joyId.current === null) {
      joyId.current = e.pointerId;
      joyOrigin.current = { x: e.clientX, y: e.clientY };
      setJoy({ x: e.clientX, y: e.clientY, kx: 0, ky: 0 });
      onManualMove(); // pauses a running tour first, so the cancelled walk isn't read as "stuck"
      stopAuto();
      return;
    }
    // input timestamps, not handler time: on a janky low-end phone handlers run late but taps are still quick
    looks.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: e.timeStamp });
    touchLook.active = true; touchLook.vx = 0; touchLook.vy = 0;
    if (looks.current.size === 2) {
      const [a, b] = Array.from(looks.current.values());
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: player.camZoom };
    }
  };

  const move = (e: React.PointerEvent) => {
    if (e.pointerId === joyId.current) {
      const R = radius();
      let dx = e.clientX - joyOrigin.current.x, dy = e.clientY - joyOrigin.current.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      const mag = Math.min(1, d / R);
      // a little dead zone, then analog speed
      const k = mag < 0.12 ? 0 : (mag - 0.12) / 0.88 / Math.max(mag, 1e-3);
      player.joy.x = (dx / R) * k * (mag > 0 ? 1 : 0); player.joy.y = (dy / R) * k;
      if (mag > 0.95) { if (!edgeSince.current) edgeSince.current = performance.now(); }
      else if (mag < 0.7) edgeSince.current = 0;
      setJoy((j) => (j ? { ...j, kx: dx, ky: dy } : j));
      return;
    }
    const p = looks.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch.current && looks.current.size >= 2) {
      const [a, b] = Array.from(looks.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      player.camZoom = Math.max(1.2, Math.min(4, pinch.current.zoom * (pinch.current.d / Math.max(20, d))));
      return;
    }
    // ~one full turn per 1.2 screen widths, whatever the screen size
    const sens = (Math.PI * 2) / (1.2 * window.innerWidth) / 0.0024;
    touchLook.pendX += dx * sens;
    touchLook.pendY += dy * sens * 0.8;
  };

  const up = (e: React.PointerEvent) => {
    if (e.pointerId === joyId.current) {
      joyId.current = null; edgeSince.current = 0;
      player.joy.x = 0; player.joy.y = 0; player.run = false; setRunning(false);
      setJoy(null);
      return;
    }
    const p = looks.current.get(e.pointerId);
    if (!p) return;
    looks.current.delete(e.pointerId);
    const wasPinch = !!pinch.current;
    if (looks.current.size < 2) pinch.current = null;
    if (!looks.current.size) touchLook.active = false;
    if (wasPinch || e.type === 'pointercancel') return;
    const quick = e.timeStamp - p.t0 < TAP_MS && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < TAP_PX;
    if (!quick) return;
    touchLook.vx = 0; touchLook.vy = 0; // a tap is not a fling
    const now = e.timeStamp, lt = lastTap.current;
    if (now - lt.t < DOUBLE_MS && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 40) {
      if (pendingTap.current) { clearTimeout(pendingTap.current); pendingTap.current = null; }
      lastTap.current = { t: 0, x: 0, y: 0 };
      haptic(10);
      onToggleView();
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    const { clientX, clientY } = e;
    const rect = layer.current!.getBoundingClientRect();
    pendingTap.current = window.setTimeout(() => {
      pendingTap.current = null;
      onManualMove();
      if (walkToScreenPoint(world, clientX, clientY, rect)) haptic(10);
    }, DOUBLE_MS - 40);
  };

  return (
    <div ref={layer} className="touch-layer" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()} role="application" aria-label="Walk with the left thumb, look with the right">
      {joy && (
        <div className="joy-float" style={{ left: joy.x, top: joy.y }} aria-hidden="true">
          <i style={{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }} />
        </div>
      )}
      {running && joy && <div className="run-badge" style={{ left: joy.x, top: joy.y }} aria-label="Running"><IconRun /></div>}
    </div>
  );
}
