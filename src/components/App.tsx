'use client';
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import houseJson from '@/data/house.json';
import type { HouseConfig, Room } from '@/lib/types';
import { buildWorld } from '@/lib/world';
import { groundHeight } from '@/lib/physics';
import { player, keys, teleport, look, stopAuto, cinematic } from '@/lib/player';
import { STYLES, styleById, rememberStyle, nextStyle } from '@/lib/styles';
import { house, useHouse, setStyle, toggleNight } from '@/lib/houseState';
import { setTextureDetail } from '@/lib/materials';
import { roomAt } from '@/lib/physics';
import { sceneRefs } from '@/lib/pick';
import { shot } from '@/lib/shot';
import { freeSpot } from '@/lib/nav';
import { doorEvents } from '@/lib/events';
import { setSound, doorCreak, uiClick } from '@/lib/sound';
import {
  detectTier, isCoarsePointer, fullscreenAvailable, isFullscreen, enterFullscreen, exitFullscreen, lockLandscape, haptic, storage, type Tier,
} from '@/lib/device';
import Scene, { type Quality } from './Scene';
import type { HudInfo, ViewMode } from './Player';
import { useTour, stopSize, tour as tourData } from './useTour';
import DesktopHud from './ui/DesktopHud';
import MobileHud, { RotateHint, type MobileSettings } from './ui/MobileHud';
import TouchControls from './ui/TouchControls';
import { Loader, NoWebGL, ContextLost, Onboarding, TourCard, AwayCard, Intro } from './ui/Overlays';
import { DesignPanel, Toast } from './ui/Design';
import { OnlinePanel, FollowPill } from './ui/Online';
import { EmoteWheel, EmoteMenu, SelfReactions } from './ui/Emotes';
import { playEmote, react, EMOTES, REACTIONS, type Emote } from '@/lib/emotes';
import { startFollowing, stopFollowing, following, useFollowing, onFollowEnd } from '@/lib/follow';
import { connect, disconnect, onMpChange, linkedRoom, rememberRoom, newRoomCode, roomId, send, peers, mp, useMultiplayer, useMpMessage, PUBLIC_ROOM } from '@/lib/multiplayer';
import { useGroupTour, groupRole, setTourMoves, startGroupTour, leaveGroup, rejoinGroup, onGroupNotice } from '@/lib/groupTour';

const cfg = houseJson as unknown as HouseConfig;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
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

export default function App() {
  const [webgl] = useState(() => hasWebGL());
  return webgl ? <SceneErrorBoundary><Walkthrough /></SceneErrorBoundary> : <NoWebGL />;
}

const DEFAULT_SETTINGS = (mobile: boolean): MobileSettings => ({ sound: false, gyro: false, headBob: mobile });

function Walkthrough() {
  const world = useMemo(() => buildWorld(cfg), []);
  const [mobile, setMobile] = useState(() => isCoarsePointer());
  const [entered, setEntered] = useState(false);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewMode>('third');
  const night = useHouse((s) => s.night);
  const [quality, setQuality] = useState<Quality>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('q') === 'low' ? 'low' : 'auto');
  const [autoTier, setAutoTier] = useState<Tier>(() => {
    const t = detectTier();
    setTextureDetail(t === 'low' ? 0.5 : 1); // low-tier phones get half-size procedural textures
    return t;
  });
  const tier: Tier = quality === 'auto' ? autoTier : quality === 'high' ? 'high' : 'low';
  const [hud, setHud] = useState<HudInfo>({ room: '', floor: 0 });
  const [locked, setLocked] = useState(false);
  const [menuOpen, setMenu] = useState(false);
  const [mapOpen, setMap] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  const [fs, setFs] = useState(false);
  const [fsOk] = useState(() => fullscreenAvailable());
  const [lost, setLost] = useState(false);
  const [frameloop, setFrameloop] = useState<'always' | 'demand'>('always');
  const [settings, setSettings] = useState<MobileSettings>(() => {
    const base = DEFAULT_SETTINGS(isCoarsePointer());
    try { return { ...base, ...JSON.parse(storage.get('house-settings') ?? '{}'), gyro: false }; } catch { return base; }
  });
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const pendingTour = useRef(false);
  const pendingGroup = useRef(false); // "Start group tour" on the intro: start it once we are the new room's host
  // ---------- exterior design ----------
  const styleId = useHouse((s) => s.styleId);
  const [designOpen, setDesignOpen] = useState(false);
  const [toast, setToast] = useState({ text: '', stamp: 0 });
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => {
    const t: Record<string, string> = {};
    for (const st of STYLES) { const v = storage.get(`house-thumb-v1-${st.id}`); if (v) t[st.id] = v; }
    return t;
  });
  const [playerName, setPlayerName] = useState(() => storage.get('house-name') ?? '');
  // multiplayer room: 'public', or a private code (a ?room= link fills in the join box)
  const [room, setRoom] = useState(PUBLIC_ROOM);
  const [joinCode, setJoinCode] = useState(() => linkedRoom() ?? '');
  // a group tour's followers walk it without a clock of their own: the host's updates move them on (lib/groupTour.ts)
  const group = useGroupTour();
  const tour = useTour(world, { clock: group.role !== 'follower' });
  const tourRef = useRef(tour); tourRef.current = tour;
  useEffect(() => { setTourMoves({ hop: tour.hop, toStart: tour.toStart }); return () => setTourMoves(null); }, [tour.hop, tour.toStart]);
  const startGroup = () => startGroupTour(tourRef.current.start);
  /** Walking yourself pauses the tour, or, following a group tour, leaves the group. */
  const interruptTour = () => { if (groupRole() === 'follower') leaveGroup(); else tourRef.current.pause(); };
  const interruptRef = useRef(interruptTour); interruptRef.current = interruptTour;

  const selectStyle = setStyle;
  const styleRef = useRef(styleId); styleRef.current = styleId;
  const enteredRef = useRef(entered); enteredRef.current = entered;
  const selectRef = useRef(selectStyle); selectRef.current = selectStyle;
  // a new design, from any source: remember it, say so, and fly out to its hero shot when outside
  const shownStyle = useRef(styleId);
  useEffect(() => {
    if (styleId === shownStyle.current) return;
    shownStyle.current = styleId;
    rememberStyle(styleId);
    const st = styleById(styleId);
    setToast({ text: `${st.name} · ${st.subtitle}`, stamp: Date.now() });
    // outside (or on the intro) the camera flies out to the new design's hero shot; inside, only the façade swaps
    const { room } = roomAt(world, player.x, player.z, player.feet);
    if (enteredRef.current && (!room || (room.kind ?? 'room') === 'outdoor')) cinematic.remaining = 2.6;
  }, [styleId, world]);

  // thumbnails: rendered offscreen once per design, kept in localStorage
  const wantThumbs = ready && (designOpen || menuOpen || (!entered && tier !== 'low'));
  const thumbQueue = useMemo(() => (wantThumbs ? STYLES.map((st) => st.id).filter((id) => !thumbs[id]) : []), [wantThumbs, thumbs]);
  const onThumb = useCallback((id: string, url: string) => {
    storage.set(`house-thumb-v1-${id}`, url);
    setThumbs((t) => ({ ...t, [id]: url }));
  }, []);

  useEffect(() => {
    if (world.warnings.length) console.warn('[house.json]', world.warnings);
    // handy for debugging in the browser console: __house.player, __house.world, __house.state.get()
    const w = window as unknown as { __house?: Record<string, unknown> };
    w.__house = Object.assign(w.__house ?? {}, { player, world, cinematic, sceneRefs, state: house });
    const { x, z, yaw } = cfg.spawn;
    teleport(x, z, groundHeight(world, x, z, 0.6), yaw ?? 0);
  }, [world]);

  // ---------- device / page wiring ----------
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const onMq = () => setMobile(mq.matches);
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    const onFs = () => setFs(isFullscreen());
    const onVis = () => setFrameloop(document.hidden ? 'demand' : 'always'); // stop rendering in background tabs
    const noGesture = (e: Event) => e.preventDefault(); // iOS pinch-zoom of the page
    mq.addEventListener?.('change', onMq);
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('gesturestart', noGesture, { passive: false } as AddEventListenerOptions);
    return () => {
      mq.removeEventListener?.('change', onMq);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('gesturestart', noGesture);
    };
  }, []);

  useEffect(() => {
    player.headBob = settings.headBob;
    setSound(settings.sound);
    storage.set('house-settings', JSON.stringify({ sound: settings.sound, headBob: settings.headBob }));
  }, [settings]);

  // doors: creak + a tap of haptics
  useEffect(() => doorEvents.on(() => { doorCreak(); if (mobile) haptic(10); }), [mobile]);
  // a new room: haptic tick
  const lastRoom = useRef('');
  useEffect(() => {
    const key = `${hud.room}|${hud.floor}`;
    if (entered && mobile && lastRoom.current && key !== lastRoom.current) haptic(10);
    lastRoom.current = key;
  }, [hud, entered, mobile]);

  // ---------- keyboard + mouse (desktop, unchanged) ----------
  useEffect(() => {
    const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return; // typing a name, not walking
      keys.add(e.code);
      if (MOVE.has(e.code)) interruptRef.current(); // walking yourself pauses the guided tour (or leaves the group)
      if (e.code === 'KeyC') setView((v) => (v === 'first' ? 'third' : 'first'));
      if (e.code === 'KeyN') toggleNight();
      if (e.code === 'KeyV' && !e.repeat) selectRef.current(nextStyle(styleRef.current)); // V cycles designs
      // 1-5 emote, 6-0 react
      const digit = /^Digit\d$/.test(e.code) && !e.repeat && enteredRef.current ? (Number(e.code[5]) + 9) % 10 : -1;
      if (digit >= 0) { if (digit < EMOTES.length) emoteRef.current(EMOTES[digit]); else react(REACTIONS[digit - EMOTES.length]); }
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

  // ---------- gyroscope look (opt-in) ----------
  useEffect(() => {
    if (!settings.gyro) return;
    let last: { a: number; b: number; g: number } | null = null;
    const onOri = (e: DeviceOrientationEvent) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      const cur = { a: e.alpha, b: e.beta, g: e.gamma };
      if (last) {
        const d = (x: number) => ((x + 540) % 360) - 180;
        const landscape = Math.abs((screen.orientation?.angle ?? 0) % 180) === 90;
        player.yaw += (d(cur.a - last.a) * Math.PI) / 180;
        const tilt = landscape ? -(cur.g - last.g) * Math.sign(screen.orientation?.angle || 90) : cur.b - last.b;
        player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch + (tilt * Math.PI) / 180));
      }
      last = cur;
    };
    window.addEventListener('deviceorientation', onOri);
    return () => window.removeEventListener('deviceorientation', onOri);
  }, [settings.gyro]);

  const requestLock = useCallback(() => {
    if (mobile || !canvasEl.current) return;
    try {
      const r = canvasEl.current.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {});
    } catch { /* ignored */ }
  }, [mobile]);

  const press = (fn: () => void) => () => { if (mobile) haptic(8); uiClick(); fn(); };

  // ---------- emotes + reactions ----------
  const emote = (e: Emote) => {
    if (playEmote(e) === 'moving') setToast({ text: 'Stand still to emote', stamp: Date.now() });
  };
  const emoteRef = useRef(emote); emoteRef.current = emote;

  const toSpawn = () => {
    const { x, z, yaw } = cfg.spawn;
    teleport(x, z, groundHeight(world, x, z, 0.6), yaw ?? 0);
  };

  // ---------- multiplayer: join/leave notices, follow mode ----------
  useEffect(() => onMpChange((e) => {
    if (e?.type === 'leave' && following()?.id === e.id) { stopFollowing('left'); return; } // its own notice, below
    if (e) setToast({ text: e.type === 'join' ? `${e.name} entered the house` : `${e.name} left`, stamp: Date.now() });
  }), []);
  useEffect(() => onFollowEnd((why, name) => {
    if (why === 'left') setToast({ text: `${name} left · stopped following`, stamp: Date.now() });
  }), []);
  useEffect(() => () => { stopFollowing(); disconnect(); }, []);
  useEffect(() => onGroupNotice((n) => {
    setToast({ text: n.type === 'started' ? `${n.by || 'The host'} started a group tour` : 'The group tour has ended', stamp: Date.now() });
  }), []);
  useMpMessage('room:host', (m) => {
    if (m.reason === 'back' || mp.room === PUBLIC_ROOM || !m.hostId) return;
    const who = m.hostId === mp.selfId ? 'You are' : `${peers.get(m.hostId)?.name ?? 'Someone'} is`;
    setToast({ text: `${who} now the host${m.reason === 'left' ? ' (the host left)' : ''}`, stamp: Date.now() });
  });
  const mpView = useMultiplayer();
  // "Start group tour" from the intro: once the new room says we are its host (and any first-time tips are closed)
  useEffect(() => {
    if (pendingGroup.current && group.canLead && !onboarding) { pendingGroup.current = false; startGroup(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.canLead, onboarding]);
  const followed = useFollowing();
  const follow = (id: string) => {
    interruptTour(); // the tour and the follower would both steer
    stopAuto();
    startFollowing(world, id);
  };

  const enter = (mode: 'free' | 'tour', to: string = PUBLIC_ROOM) => {
    if (mobile) { void enterFullscreen().then(lockLandscape); haptic(10); }
    toSpawn();
    setEntered(true);
    let name = playerName.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) { name = `Guest ${Math.floor(100 + Math.random() * 900)}`; setPlayerName(name); }
    storage.set('house-name', name);
    connect(name, to);
    setRoom(to);
    rememberRoom(to);
    requestLock();
    const firstTime = mobile && !storage.get('house-onboarding-seen');
    if (firstTime) setOnboarding(true);
    if (mode === 'tour') { if (firstTime) pendingTour.current = true; else tour.start(); }
  };

  const createGroupTour = () => {
    pendingGroup.current = true;
    createRoom();
  };
  const createRoom = () => {
    const code = newRoomCode();
    setJoinCode(code);
    enter('free', code);
  };
  const joinRoom = () => {
    const id = roomId(joinCode);
    if (id) enter('free', id);
  };

  const closeOnboarding = () => {
    storage.set('house-onboarding-seen', '1');
    setOnboarding(false);
    if (pendingTour.current) { pendingTour.current = false; tour.start(); }
  };

  const exit = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    keys.clear();
    stopFollowing();
    disconnect(); // first: a host walking out leaves the group tour running for the next host, rather than ending it
    tour.exit();
    pendingGroup.current = false;
    setMenu(false); setMap(false);
    setEntered(false);
  };

  const goRoom = (r: Room) => {
    interruptTour();
    stopAuto();
    stopFollowing('manual');
    const level = cfg.floors[r.floor].y;
    const [x, z] = freeSpot(world, (r.x1 + r.x2) / 2, (r.z1 + r.z2) / 2, level);
    teleport(x, z, level);
  };
  const goTo = (id: string) => {
    if (id === '__outside') { interruptTour(); stopFollowing('manual'); toSpawn(); return; }
    const r = cfg.rooms.find((q) => q.id === id);
    if (r) goRoom(r);
  };

  const toggleFs = () => { if (isFullscreen()) void exitFullscreen(); else void enterFullscreen().then(lockLandscape); };
  const toggleSetting = async (k: keyof MobileSettings) => {
    if (k === 'gyro' && !settings.gyro) {
      // iOS asks for motion permission, and only from a tap
      const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      try { if (DOE?.requestPermission && (await DOE.requestPermission()) !== 'granted') return; } catch { return; }
    }
    setSettings((s) => ({ ...s, [k]: !s[k] }));
  };

  const stopInfo = tour.state.active ? tour.stop : null;
  const awayStop = group.role === 'away' ? tourData.stops[group.step] : null;
  // the guided-tour entry in the phone menu: lead a group tour as host, rejoin one, or a solo tour
  const tourAction = group.canLead
    ? { label: 'Group tour', value: group.active ? 'Restart' : 'Start', run: startGroup }
    : group.role === 'away' ? { label: 'Group tour', value: 'Rejoin', run: rejoinGroup }
      : group.role === 'follower' ? null : { label: 'Guided tour', value: 'Restart', run: () => tour.start() };

  return (
    <div className={`root${mobile ? ' is-touch' : ''}${followed ? ' following' : ''}${stopInfo || awayStop ? ' touring' : ''}`} data-tier={tier} data-quality={quality} onContextMenu={mobile ? (e) => e.preventDefault() : undefined}>
      <Canvas
        frameloop={frameloop}
        shadows={tier !== 'low'}
        dpr={tier === 'high' ? [1, 2] : tier === 'mid' ? [1, 1.5] : 1}
        camera={{ fov: 62, near: 0.05, far: 400, position: [world.center[0] + 25, 15, world.center[1] + 25] }}
        gl={{ antialias: tier !== 'high', powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          canvasEl.current = gl.domElement;
          const w = window as unknown as { __house?: Record<string, unknown> };
          w.__house = Object.assign(w.__house ?? {}, { gl }); // debug: __house.gl.info.render
          if (shot?.cut != null) gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), shot.cut)];
          gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setLost(true); });
        }}
        onClick={() => { if (entered) requestLock(); }}
      >
        {quality === 'auto' && (
          <PerformanceMonitor ms={250} iterations={8} bounds={() => [30, 1000]} flipflops={2}
            onDecline={() => setAutoTier((t) => (t === 'high' ? 'mid' : 'low'))} />
        )}
        <Suspense fallback={null}>
          <Scene world={world} entered={entered} view={view} night={night} tier={tier} mobile={mobile} onHud={setHud}
            styleId={styleId} thumbQueue={thumbQueue} onThumb={onThumb} />
          <FirstFrames onReady={() => setReady(true)} />
        </Suspense>
        <AdaptiveDpr pixelated />
      </Canvas>

      <Loader ready={ready} />
      <Toast text={toast.text} stamp={toast.stamp} />
      {lost && <ContextLost />}
      {shot ? null : !entered ? (
        <Intro name={cfg.name} ready={ready} mobile={mobile} onTour={() => enter('tour')} onFree={() => enter('free')}
          styles={STYLES} styleId={styleId} thumbs={thumbs} onStyle={selectStyle} playerName={playerName} onPlayerName={setPlayerName}
          joinCode={joinCode} onJoinCode={setJoinCode} onCreateRoom={createRoom} onJoinRoom={joinRoom} onGroupTour={createGroupTour} />
      ) : (
        <>
          {mobile ? (
            <>
              <TouchControls world={world} onManualMove={() => { interruptTour(); stopFollowing('manual'); }} onToggleView={() => setView((v) => (v === 'first' ? 'third' : 'first'))} />
              {view === 'first' && <div className="crosshair" />}
              <MobileHud world={world} floorName={cfg.floors[hud.floor]?.name ?? ''} room={hud.room} floor={hud.floor} view={view} night={night}
                quality={quality} settings={settings} fs={fs} fsAvailable={fsOk} menuOpen={menuOpen} mapOpen={mapOpen}
                setMenu={(o) => { if (o) { haptic(8); uiClick(); } setMenu(o); }} setMap={(o) => { if (o) haptic(8); setMap(o); }}
                onRoom={goRoom} onOutside={() => goTo('__outside')}
                onView={press(() => setView((v) => (v === 'first' ? 'third' : 'first')))} onNight={press(() => toggleNight())}
                onQuality={(q) => { haptic(8); setQuality(q); if (q === 'auto') setAutoTier(detectTier()); }}
                onSetting={(k) => { haptic(8); void toggleSetting(k); }} onFullscreen={press(toggleFs)}
                tourAction={tourAction && { label: tourAction.label, value: tourAction.value }}
                onRestartTour={press(() => tourAction?.run())} onIntro={press(exit)}
                styles={STYLES} styleId={styleId} thumbs={thumbs} onStyle={(id) => { haptic(8); setMenu(false); selectStyle(id); }} roomCode={room} />
              {!menuOpen && !mapOpen && <EmoteWheel onEmote={(e) => { haptic(8); uiClick(); emote(e); }} onReact={(r) => { haptic(8); uiClick(); react(r); }} />}
              {portrait && !rotateDismissed && !onboarding && !menuOpen && !mapOpen && <RotateHint onClose={() => setRotateDismissed(true)} />}
            </>
          ) : (
            <DesktopHud world={world} cfg={cfg} hud={hud} view={view} night={night} quality={quality} locked={locked}
              onGo={goTo} onView={() => setView((v) => (v === 'first' ? 'third' : 'first'))} onNight={() => toggleNight()}
              onQuality={() => setQuality((q) => (q === 'auto' ? 'high' : q === 'high' ? 'low' : 'auto'))} onExit={exit}
              designOpen={designOpen} onDesign={() => setDesignOpen((o) => !o)} roomCode={room}>
              {group.canLead && <button className="btn" onClick={startGroup}>👥 {group.active ? 'Restart group tour' : 'Start group tour'}</button>}
              <EmoteMenu onEmote={emote} onReact={(r) => { react(r); }} />
            </DesktopHud>
          )}
          {!mobile && designOpen && (
            <DesignPanel styles={STYLES} active={styleId} thumbs={thumbs} onPick={(id) => selectStyle(id)} onClose={() => setDesignOpen(false)} />
          )}
          {stopInfo && !menuOpen && !mapOpen && (
            <TourCard title={stopInfo.title} size={stopSize(world, stopInfo)} text={stopInfo.text} index={tour.state.index} count={tour.count}
              phase={tour.state.phase} paused={tour.state.paused}
              group={group.role === 'host' || group.role === 'follower' ? { role: group.role, hostName: group.hostName, guests: mpView.peers.length } : undefined}
              onPause={press(tour.pause)} onResume={press(tour.resume)} onNext={press(tour.next)} onExit={press(tour.exit)}
              onRestart={press(group.role === 'host' ? startGroup : tour.start)} onLeave={press(leaveGroup)} />
          )}
          {awayStop && !menuOpen && !mapOpen && (
            <AwayCard title={awayStop.title} index={group.step} count={tour.count} hostName={group.hostName} done={group.phase === 'done'} onRejoin={press(rejoinGroup)} />
          )}
          {!menuOpen && !mapOpen && <OnlinePanel selfName={playerName} max={mobile ? 3 : 8} followingId={followed?.id ?? null}
            onFollow={(id) => { if (mobile) haptic(8); uiClick(); follow(id); }} onUnfollow={press(() => stopFollowing())}
            onMakeHost={(id) => { if (mobile) haptic(8); uiClick(); send('room:host', { id }); }} />}
          {followed && !menuOpen && !mapOpen && <FollowPill name={followed.name} onStop={press(() => stopFollowing())} />}
          {view === 'first' && <SelfReactions />}
          {onboarding && <Onboarding onDone={closeOnboarding} />}
        </>
      )}
    </div>
  );
}
