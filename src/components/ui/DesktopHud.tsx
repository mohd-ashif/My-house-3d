'use client';
import { useEffect, useRef } from 'react';
import type { World } from '@/lib/world';
import type { HouseConfig } from '@/lib/types';
import { player } from '@/lib/player';
import type { Quality } from '../Scene';
import type { ViewMode } from '../Player';

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

/** The original desktop HUD (unchanged layout): room card, button row, minimap, hint bar. */
export default function DesktopHud({ world, cfg, hud, view, night, quality, locked, onGo, onView, onNight, onQuality, onExit, designOpen, onDesign }: {
  world: World; cfg: HouseConfig; hud: { room: string; floor: number }; view: ViewMode; night: boolean; quality: Quality; locked: boolean;
  onGo: (id: string) => void; onView: () => void; onNight: () => void; onQuality: () => void; onExit: () => void;
  designOpen: boolean; onDesign: () => void;
}) {
  return (
    <>
      <div className="hud-top">
        <div className="room">
          <span>{cfg.floors[hud.floor]?.name ?? ''}</span>
          <b>{hud.room}</b>
        </div>
        <div className="controls">
          <select value="" onChange={(e) => onGo(e.target.value)} aria-label="Teleport to a room">
            <option value="" disabled>Go to room…</option>
            <option value="__outside">Outside: front gate</option>
            {cfg.rooms.filter((r) => (r.kind ?? 'room') !== 'void' && r.menu !== false).map((r) => (
              <option key={r.id} value={r.id}>{cfg.floors[r.floor]?.name}: {r.name}</option>
            ))}
          </select>
          <button className="btn" onClick={onView}>{view === 'first' ? '3rd person' : '1st person'} (C)</button>
          <button className="btn" onClick={onNight}>{night ? 'Day' : 'Night'} (N)</button>
          <button className="btn" onClick={onDesign} aria-expanded={designOpen} aria-label="Exterior design (V)">🏠 Design</button>
          <button className="btn" onClick={onQuality}>Quality: {quality}</button>
          <button className="btn" onClick={onExit}>Exit</button>
        </div>
      </div>
      <Minimap world={world} floor={hud.floor} />
      {view === 'first' && <div className="crosshair" />}
      <div className="hint">
        {locked ? 'WASD walk · Shift run · Mouse look · C camera · N night · Esc free mouse' : 'Click to look around with the mouse · WASD to walk'}
      </div>
    </>
  );
}
