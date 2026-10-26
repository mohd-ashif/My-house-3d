'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { World } from '@/lib/world';
import type { Room, StyleDef } from '@/lib/types';
import { DesignCards } from './Design';
import { player } from '@/lib/player';
import type { Quality } from '../Scene';
import type { ViewMode } from '../Player';
import {
  IconMenu, IconClose, IconFullscreen, IconCamera, IconSun, IconMoon, IconGauge, IconGyro, IconSound,
  IconRestart, IconHome, IconBob, Phone, RoomIcon,
} from './icons';

export interface MobileSettings { sound: boolean; gyro: boolean; headBob: boolean }

const roomFill = (r: Room) => ((r.kind ?? 'room') === 'void' ? 'none' : (r.kind ?? 'room') === 'outdoor' ? 'rgba(120,170,110,.35)' : 'rgba(255,255,255,.16)');

/** Round radar that turns with the player (forward is always up). Tap to open the full plan. */
function Radar({ world, floor, onOpen }: { world: World; floor: number; onOpen: () => void }) {
  const g = useRef<SVGGElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      g.current?.setAttribute('transform', `rotate(${(player.yaw * 180) / Math.PI}) translate(${-player.x} ${-player.z})`);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  const rooms = world.cfg.rooms.filter((r) => r.floor === floor);
  return (
    <button className="radar glass" onClick={onOpen} aria-label="Open the floor plan">
      <svg viewBox="-7 -7 14 14" aria-hidden="true">
        <g ref={g}>
          {rooms.map((r) => (
            <rect key={r.id} x={r.x1} y={r.z1} width={r.x2 - r.x1} height={r.z2 - r.z1} fill={roomFill(r)}
              stroke="rgba(255,255,255,.75)" strokeWidth={0.08} strokeDasharray={(r.kind ?? 'room') === 'void' ? '0.3 0.2' : undefined} />
          ))}
        </g>
        <path d="M0 -0.9 L0.55 0.45 L0 0.15 L-0.55 0.45 Z" fill="#ffcf5a" />
      </svg>
    </button>
  );
}

/** Full-screen floor plan: tap a room to go there. */
function FloorPlan({ world, floor: initial, onGo, onClose }: { world: World; floor: number; onGo: (r: Room) => void; onClose: () => void }) {
  const [floor, setFloor] = useState(initial);
  const dot = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [pxPerM, setPxPerM] = useState(30);
  const rooms = world.cfg.rooms.filter((r) => r.floor === floor);
  const all = world.cfg.rooms;
  const minX = Math.min(...all.map((r) => r.x1)) - 0.6, maxX = Math.max(...all.map((r) => r.x2)) + 0.6;
  const minZ = Math.min(...all.map((r) => r.z1)) - 0.6, maxZ = Math.max(...all.map((r) => r.z2)) + 0.6;
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      dot.current?.setAttribute('transform', `translate(${player.x} ${player.z}) rotate(${(-player.yaw * 180) / Math.PI})`);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  // labels are sized from the real on-screen scale: never under 12 px, and only where the name fits
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPxPerM(Math.min(r.width / (maxX - minX), r.height / (maxZ - minZ)) || 30);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minX, maxX, minZ, maxZ]);
  const label = (r: Room) => {
    const font = Math.max(12 / pxPerM, Math.min(0.42, 16 / pxPerM));
    const fits = r.name.length * font * 0.56 <= r.x2 - r.x1 - 0.12 && font * 1.2 <= r.z2 - r.z1;
    return fits ? font : 0;
  };
  const here = Math.abs(player.feet - (world.cfg.floors[floor]?.y ?? 0)) < 1.5;
  return (
    <div className="plan-overlay" role="dialog" aria-label="Floor plan">
      <div className="plan-head">
        <div className="tabs" role="tablist">
          {world.cfg.floors.map((f, i) => (
            <button key={f.name} role="tab" aria-selected={i === floor} className={i === floor ? 'on' : ''} onClick={() => setFloor(i)}>
              {i === 0 ? 'GF' : 'FF'}<span> · {f.name}</span>
            </button>
          ))}
        </div>
        <button className="icon-btn glass" onClick={onClose} aria-label="Close the floor plan"><IconClose /></button>
      </div>
      <p className="plan-tip">Tap a room to go there</p>
      <svg ref={svg} className="plan-svg" viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`} role="group" aria-label={`${world.cfg.floors[floor]?.name} plan`}>
        {rooms.map((r) => {
          const kind = r.kind ?? 'room';
          const go = kind !== 'void';
          return (
            <g key={r.id} className={go ? 'plan-room' : ''} onClick={go ? () => onGo(r) : undefined}
              role={go ? 'button' : undefined} aria-label={go ? `Go to ${r.name}` : undefined}>
              <rect x={r.x1} y={r.z1} width={r.x2 - r.x1} height={r.z2 - r.z1} fill={roomFill(r)}
                stroke="rgba(255,255,255,.8)" strokeWidth={0.06} strokeDasharray={kind === 'void' ? '0.3 0.2' : undefined} />
              {r.menu !== false && label(r) > 0 && (
                <text x={(r.x1 + r.x2) / 2} y={(r.z1 + r.z2) / 2} fontSize={label(r)} fill="#fff" textAnchor="middle" dominantBaseline="middle">
                  {r.name}
                </text>
              )}
            </g>
          );
        })}
        {here && <g ref={dot}><circle r={0.3} fill="#ffcf5a" /><path d="M0 -0.8 L0.3 -0.2 L-0.3 -0.2 Z" fill="#ffcf5a" /></g>}
      </svg>
    </div>
  );
}

function Toggle({ icon, label, value, on, onClick }: { icon: ReactNode; label: string; value: string; on?: boolean; onClick: () => void }) {
  return (
    <button className={`setting${on ? ' on' : ''}`} onClick={onClick} aria-label={`${label}: ${value}`} aria-pressed={on}>
      {icon}<span className="s-label">{label}</span><span className="s-value">{value}</span>
    </button>
  );
}

/** Bottom sheet: rooms + settings. Drag the sheet down to close it. */
function Sheet(props: {
  world: World; view: ViewMode; night: boolean; quality: Quality; settings: MobileSettings; fs: boolean; fsAvailable: boolean;
  onClose: () => void; onRoom: (r: Room) => void; onOutside: () => void; onView: () => void; onNight: () => void; onQuality: (q: Quality) => void;
  onSetting: (k: keyof MobileSettings) => void; onFullscreen: () => void; onRestartTour: () => void; onIntro: () => void;
  styles: StyleDef[]; styleId: string; thumbs: Record<string, string>; onStyle: (id: string) => void;
}) {
  const { world } = props;
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const onDown = (e: React.PointerEvent) => { start.current = e.clientY; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ } };
  const onMove = (e: React.PointerEvent) => { if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current)); };
  const onUp = () => { if (drag > 80) props.onClose(); setDrag(0); start.current = null; };
  const floors = world.cfg.floors.map((f, i) => ({ f, rooms: world.cfg.rooms.filter((r) => r.floor === i && (r.kind ?? 'room') !== 'void' && r.menu !== false) }));
  return (
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}
        style={{ transform: `translateY(${drag}px)`, transition: start.current === null ? undefined : 'none' }}>
        <div className="sheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <i />
          <button className="icon-btn" onClick={props.onClose} aria-label="Close the menu"><IconClose /></button>
        </div>
        <div className="sheet-body">
          <h2>🏠 Design</h2>
          <DesignCards styles={props.styles} active={props.styleId} thumbs={props.thumbs} onPick={props.onStyle} variant="row" />
          <h2>Go to room</h2>
          <button className="room-card wide" onClick={props.onOutside} aria-label="Go outside to the front gate"><IconHome /><span>Outside · front gate</span></button>
          {floors.map(({ f, rooms }) => (
            <section key={f.name}>
              <h3>{f.name}</h3>
              <div className="room-grid">
                {rooms.map((r) => (
                  <button key={r.id} className="room-card" onClick={() => props.onRoom(r)} aria-label={`Go to ${r.name}, ${f.name}`}>
                    <RoomIcon name={r.name} /><span>{r.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <h2>Settings</h2>
          <div className="settings">
            <Toggle icon={<IconCamera />} label="Camera" value={props.view === 'first' ? '1st person' : '3rd person'} onClick={props.onView} />
            <Toggle icon={props.night ? <IconMoon /> : <IconSun />} label="Light" value={props.night ? 'Night' : 'Day'} on={props.night} onClick={props.onNight} />
            <div className="setting seg" role="group" aria-label="Quality">
              <IconGauge /><span className="s-label">Quality</span>
              <span className="seg-btns">
                {(['auto', 'high', 'low'] as Quality[]).map((q) => (
                  <button key={q} className={props.quality === q ? 'on' : ''} onClick={() => props.onQuality(q)} aria-pressed={props.quality === q} aria-label={`Quality ${q}`}>
                    {q[0].toUpperCase() + q.slice(1)}
                  </button>
                ))}
              </span>
            </div>
            <Toggle icon={<IconGyro />} label="Gyro look" value={props.settings.gyro ? 'On' : 'Off'} on={props.settings.gyro} onClick={() => props.onSetting('gyro')} />
            <Toggle icon={<IconBob />} label="Head bob" value={props.settings.headBob ? 'On' : 'Off'} on={props.settings.headBob} onClick={() => props.onSetting('headBob')} />
            <Toggle icon={<IconSound on={props.settings.sound} />} label="Sound" value={props.settings.sound ? 'On' : 'Off'} on={props.settings.sound} onClick={() => props.onSetting('sound')} />
            {props.fsAvailable && <Toggle icon={<IconFullscreen on={props.fs} />} label="Fullscreen" value={props.fs ? 'On' : 'Off'} on={props.fs} onClick={props.onFullscreen} />}
            <Toggle icon={<IconRestart />} label="Guided tour" value="Restart" onClick={props.onRestartTour} />
            <Toggle icon={<IconHome />} label="Back to intro" value="Exit" onClick={props.onIntro} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RotateHint({ onClose }: { onClose: () => void }) {
  return (
    <div className="rotate-hint glass" role="status">
      <span className="rot-phone"><Phone /></span>
      <span>Rotate your phone for the best view</span>
      <button className="icon-btn" onClick={onClose} aria-label="Dismiss the rotate hint"><IconClose /></button>
    </div>
  );
}

export default function MobileHud(props: {
  world: World; floorName: string; room: string; floor: number; view: ViewMode; night: boolean; quality: Quality;
  settings: MobileSettings; fs: boolean; fsAvailable: boolean; menuOpen: boolean; mapOpen: boolean;
  setMenu: (o: boolean) => void; setMap: (o: boolean) => void;
  onRoom: (r: Room) => void; onOutside: () => void; onView: () => void; onNight: () => void; onQuality: (q: Quality) => void;
  onSetting: (k: keyof MobileSettings) => void; onFullscreen: () => void; onRestartTour: () => void; onIntro: () => void;
  styles: StyleDef[]; styleId: string; thumbs: Record<string, string>; onStyle: (id: string) => void;
}) {
  const { world } = props;
  return (
    <>
      <div className="m-top">
        <Radar world={world} floor={props.floor} onOpen={() => props.setMap(true)} />
        <div className="m-pill glass" key={`${props.room}|${props.floor}`} aria-live="polite">
          <span>{props.floorName}</span>
          <b>{props.room}</b>
        </div>
        <div className="m-actions">
          {props.fsAvailable && (
            <button className="icon-btn glass" onClick={props.onFullscreen} aria-label={props.fs ? 'Exit fullscreen' : 'Enter fullscreen'}>
              <IconFullscreen on={props.fs} />
            </button>
          )}
          <button className="icon-btn glass" onClick={() => props.setMenu(true)} aria-label="Open the menu" aria-expanded={props.menuOpen}>
            <IconMenu />
          </button>
        </div>
      </div>
      {props.mapOpen && (
        <FloorPlan world={world} floor={props.floor} onClose={() => props.setMap(false)} onGo={(r) => { props.setMap(false); props.onRoom(r); }} />
      )}
      {props.menuOpen && (
        <Sheet {...props} onClose={() => props.setMenu(false)}
          onRoom={(r) => { props.setMenu(false); props.onRoom(r); }}
          onOutside={() => { props.setMenu(false); props.onOutside(); }}
          onRestartTour={() => { props.setMenu(false); props.onRestartTour(); }}
          onIntro={() => { props.setMenu(false); props.onIntro(); }} />
      )}
    </>
  );
}
