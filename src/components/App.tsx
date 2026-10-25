'use client';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdaptiveDpr, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import houseJson from '@/data/house.json';
import type { HouseConfig } from '@/lib/types';
import { buildWorld, type World } from '@/lib/world';
import { groundHeight } from '@/lib/physics';
import { player, keys, teleport, look } from '@/lib/player';
import { shot } from '@/lib/shot';
import Scene, { type Quality } from './Scene';
import type { HudInfo, ViewMode } from './Player';

const cfg = houseJson as unknown as HouseConfig;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const storage = {
  get(k: string) { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function NoWebGL() {
  return (
    <div className="fatal">
      <h1>Your browser can&apos;t show 3D</h1>
      <p>This walkthrough needs WebGL. Try an up-to-date Chrome, Edge, Safari or Firefox, and check that hardware acceleration is turned on.</p>
    </div>
  );
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('[3D]', err); }
  render() { return this.state.failed ? <NoWebGL /> : this.props.children; }
}

/** Marks the scene ready once a few frames have been drawn (shaders compiled, textures uploaded). */
function FirstFrames({ onReady }: { onReady: () => void }) {
  const n = useRef(0);
  useFrame(() => { if (++n.current === 3) onReady(); });
  return null;
}

function Loader({ ready }: { ready: boolean }) {
  const { progress, active } = useProgress();
  const [gone, setGone] = useState(false);
  const done = ready && !active;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setGone(true), 450);
    return () => clearTimeout(t);
  }, [done]);
  if (gone) return null;
  const pct = done ? 100 : Math.min(90, Math.max(12, progress * 0.9));
  return (
    <div className={`loader${done ? ' done' : ''}`}>
      <span>Building the house…</span>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function TouchTutorial({ onClose }: { onClose: () => void }) {
  return (
    <div className="tutorial" onClick={onClose}>
      <div>
        <h2>How to walk around</h2>
        <p><b>Left thumb:</b> drag the circle to walk.</p>
        <p><b>Right side:</b> drag to look around.</p>
        <p><b>Go to room…</b> at the top jumps straight to any room.</p>
        <button className="btn primary" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

function Minimap({ world, floor }: { world: World; floor: number }) {
  const dot = useRef<SVGGElement>(null);
  const rooms = world.cfg.rooms.filter((r) => r.floor === floor);
  const all = world.cfg.rooms;
  const pl = world.cfg.plot;
  const minX = Math.min(...all.map((r) => r.x1), pl?.x1 ?? Infinity) - 0.5, maxX = Math.max(...all.map((r) => r.x2), pl?.x2 ?? -Infinity) + 0.5;
  const minZ = Math.min(...all.map((r) => r.z1), pl?.z1 ?? Infinity) - 0.5, maxZ = Math.max(...all.map((r) => r.z2), pl?.z2 ?? -Infinity) + 0.5;
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (dot.current) dot.current.setAttribute('transform', `translate(${player.x} ${player.z}) rotate(${(-player.yaw * 180) / Math.PI})`);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="minimap">
      <svg viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`}>
        {rooms.map((r) => {
          const kind = r.kind ?? 'room';
          return (
            <g key={r.id}>
              <rect x={r.x1} y={r.z1} width={r.x2 - r.x1} height={r.z2 - r.z1}
                fill={kind === 'void' ? 'none' : kind === 'outdoor' ? 'rgba(120,170,110,.35)' : 'rgba(255,255,255,.14)'}
                stroke="rgba(255,255,255,.7)" strokeWidth={0.08} strokeDasharray={kind === 'void' ? '0.3 0.2' : undefined} />
              {(r.x2 - r.x1) > 1.6 && (
                <text x={(r.x1 + r.x2) / 2} y={(r.z1 + r.z2) / 2} fontSize={0.55} fill="rgba(255,255,255,.85)" textAnchor="middle" dominantBaseline="middle">
                  {r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name}
                </text>
              )}
            </g>
          );
        })}
        {pl && <rect x={pl.x1} y={pl.z1} width={pl.x2 - pl.x1} height={pl.z2 - pl.z1} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={0.1} />}
        <g ref={dot}>
          <circle r={0.35} fill="#ffcf5a" />
          <path d="M0 -0.9 L0.35 -0.2 L-0.35 -0.2 Z" fill="#ffcf5a" />
        </g>
      </svg>
    </div>
  );
}

function TouchControls() {
  const joy = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const lookStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const setKnob = (dx: number, dy: number) => { if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`; };
  return (
    <>
      <div className="lookpad"
        onTouchStart={(e) => { const t = e.changedTouches[0]; lookStart.current = { x: t.clientX, y: t.clientY, id: t.identifier }; }}
        onTouchMove={(e) => {
          for (const t of Array.from(e.changedTouches)) {
            if (lookStart.current && t.identifier === lookStart.current.id) {
              look((t.clientX - lookStart.current.x) * 1.6, (t.clientY - lookStart.current.y) * 1.6);
              lookStart.current = { x: t.clientX, y: t.clientY, id: t.identifier };
            }
          }
        }}
        onTouchEnd={() => { lookStart.current = null; }} />
      <div className="joy" ref={joy}
        onTouchStart={(e) => { const t = e.changedTouches[0]; start.current = { x: t.clientX, y: t.clientY, id: t.identifier }; }}
        onTouchMove={(e) => {
          for (const t of Array.from(e.changedTouches)) {
            if (!start.current || t.identifier !== start.current.id) continue;
            let dx = t.clientX - start.current.x, dy = t.clientY - start.current.y;
            const d = Math.hypot(dx, dy), max = 45;
            if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
            setKnob(dx, dy);
            player.joy.x = dx / max; player.joy.y = dy / max;
          }
        }}
        onTouchEnd={() => { start.current = null; setKnob(0, 0); player.joy.x = 0; player.joy.y = 0; }}>
        <i ref={knob} />
      </div>
    </>
  );
}

export default function App() {
  const [webgl] = useState(() => hasWebGL());
  return webgl ? <SceneErrorBoundary><Walkthrough /></SceneErrorBoundary> : <NoWebGL />;
}

function Walkthrough() {
  const world = useMemo(() => buildWorld(cfg), []);
  const [entered, setEntered] = useState(false);
  const [ready, setReady] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [view, setView] = useState<ViewMode>('third');
  const [night, setNight] = useState(false);
  const [quality, setQuality] = useState<Quality>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('q') === 'low' ? 'low' : 'high');
  const [hud, setHud] = useState<HudInfo>({ room: '', floor: 0 });
  const [locked, setLocked] = useState(false);
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  useEffect(() => {
    if (world.warnings.length) console.warn('[house.json]', world.warnings);
    // handy for debugging in the browser console: __house.player, __house.world
    (window as unknown as { __house: unknown }).__house = { player, world };
    const { x, z, yaw } = cfg.spawn;
    teleport(x, z, groundHeight(world, x, z, 0.6), yaw ?? 0);
  }, [world]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === 'KeyC') setView((v) => (v === 'first' ? 'third' : 'first'));
      if (e.code === 'KeyN') setNight((n) => !n);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    const move = (e: MouseEvent) => { if (document.pointerLockElement) look(e.movementX, e.movementY); };
    const lockChange = () => setLocked(!!document.pointerLockElement);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('mousemove', move);
    document.addEventListener('pointerlockchange', lockChange);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('pointerlockchange', lockChange);
    };
  }, []);

  const requestLock = useCallback(() => {
    if (isTouch || !canvasEl.current) return;
    try {
      const r = canvasEl.current.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    } catch { /* ignored */ }
  }, [isTouch]);

  const toSpawn = () => {
    const { x, z, yaw } = cfg.spawn;
    teleport(x, z, groundHeight(world, x, z, 0.6), yaw ?? 0);
  };

  const enter = () => {
    toSpawn();
    setEntered(true);
    requestLock();
    if (isTouch && !storage.get('house-tutorial-seen')) setTutorial(true);
  };

  const exit = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    keys.clear();
    setEntered(false);
  };

  const closeTutorial = () => { storage.set('house-tutorial-seen', '1'); setTutorial(false); };

  const goTo = (id: string) => {
    if (id === '__outside') { toSpawn(); return; }
    const r = cfg.rooms.find((q) => q.id === id);
    if (!r) return;
    teleport((r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2, cfg.floors[r.floor].y);
  };

  return (
    <div className="root">
      <Canvas
        shadows={quality === 'high'}
        dpr={[1, quality === 'high' ? 2 : 1.25]}
        camera={{ fov: 62, near: 0.05, far: 400, position: [world.center[0] + 25, 15, world.center[1] + 25] }}
        gl={{ antialias: quality !== 'high', powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          canvasEl.current = gl.domElement;
          if (shot?.cut != null) gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), shot.cut)];
        }}
        onClick={() => { if (entered) requestLock(); }}
      >
        <Suspense fallback={null}>
          <Scene world={world} entered={entered} view={view} night={night} quality={quality} onHud={setHud} />
          <FirstFrames onReady={() => setReady(true)} />
        </Suspense>
        <AdaptiveDpr pixelated />
      </Canvas>

      <Loader ready={ready} />
      {shot ? null : !entered ? (
        <div className="intro">
          <h1>{cfg.name}</h1>
          <p>Walk through every room in 3D. Ground floor, first floor, the stairs, the courtyard: everything is built from the architect&apos;s plan.</p>
          <button className="btn primary" onClick={enter} disabled={!ready}>{ready ? 'Enter the house' : 'Loading…'}</button>
        </div>
      ) : (
        <>
          <div className="hud-top">
            <div className="room">
              <span>{cfg.floors[hud.floor]?.name ?? ''}</span>
              <b>{hud.room}</b>
            </div>
            <div className="controls">
              <select value="" onChange={(e) => goTo(e.target.value)} aria-label="Teleport to a room">
                <option value="" disabled>Go to room…</option>
                <option value="__outside">Outside: front gate</option>
                {cfg.rooms.filter((r) => (r.kind ?? 'room') !== 'void' && r.menu !== false).map((r) => (
                  <option key={r.id} value={r.id}>{cfg.floors[r.floor]?.name}: {r.name}</option>
                ))}
              </select>
              <button className="btn" onClick={() => setView((v) => (v === 'first' ? 'third' : 'first'))}>{view === 'first' ? '3rd person' : '1st person'} (C)</button>
              <button className="btn" onClick={() => setNight((n) => !n)}>{night ? 'Day' : 'Night'} (N)</button>
              <button className="btn" onClick={() => setQuality((q) => (q === 'high' ? 'low' : 'high'))}>Quality: {quality}</button>
              <button className="btn" onClick={exit}>Exit</button>
            </div>
          </div>
          <Minimap world={world} floor={hud.floor} />
          {view === 'first' && <div className="crosshair" />}
          {tutorial && <TouchTutorial onClose={closeTutorial} />}
          {isTouch ? <TouchControls /> : (
            <div className="hint">
              {locked ? 'WASD walk · Shift run · Mouse look · C camera · N night · Esc free mouse' : 'Click to look around with the mouse · WASD to walk'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
