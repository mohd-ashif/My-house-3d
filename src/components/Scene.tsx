'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import type { World } from '@/lib/world';
import type { StyleDef } from '@/lib/types';
import type { Tier } from '@/lib/device';
import { setLampGlow } from '@/lib/materials';
import { renderFlags } from '@/lib/events';
import { player } from '@/lib/player';
import { sceneRefs } from '@/lib/pick';
import { clearNav } from '@/lib/nav';
import { styleById } from '@/lib/styles';
import House from './House';
import Plants, { Ground } from './Plants';
import MergeStatic from './MergeStatic';
import Player, { type HudInfo, type ViewMode } from './Player';
import StyleLayer, { styleGeometry, dropStyleGeometry, creeperMaterial } from './StyleLayer';
import { getMaterial } from '@/lib/materials';
import StyleLighting, { lightingApi } from './StyleLighting';

/** User setting; 'auto' picks a tier from the device and steps down if the frame rate drops. */
export type Quality = 'auto' | 'high' | 'low';

/** Interior + façade point lights. The low tier keeps only the two that matter most. */
function Lights({ world, style, night, tier }: { world: World; style: StyleDef; night: boolean; tier: Tier }) {
  const fill = tier === 'high' || night; // the cheaper tiers skip the daytime fill lights
  const [cx, cz] = world.center;
  const roomLights = useMemo(() => world.cfg.rooms
    .filter((r) => (r.kind ?? 'room') === 'room')
    .map((r) => ({ r, area: (r.x2 - r.x1) * (r.z2 - r.z1) }))
    .sort((a, b) => b.area - a.area)
    .slice(0, 8)
    .map(({ r }) => {
      const f = world.cfg.floors[r.floor];
      return { x: (r.x1 + r.x2) / 2, z: (r.z1 + r.z2) / 2, y: f.y + f.height - world.cfg.slabThickness - 0.35 };
    }), [world]);
  const chandeliers = useMemo(() => (world.cfg.furniture ?? []).filter((f) => f.type === 'chandelier').map((f) => {
    const fy = world.cfg.floors[f.floor]?.y ?? 0;
    return { x: f.x, z: f.z, y: fy + (f.d ?? 2.95) - (f.w ?? 2.2) * 0.6 };
  }), [world]);

  useEffect(() => { setLampGlow(night ? 4 : 1.2); }, [night]);

  type PL = { key: string; pos: [number, number, number]; intensity: number; distance: number; decay: number; color: string };
  const points: PL[] = [];
  if (fill) roomLights.forEach((l, i) => points.push({ key: `r${i}`, pos: [l.x, l.y, l.z], intensity: night ? 9 : 3.5, distance: night ? 9 : 7, decay: 1.6, color: night ? '#ffd29a' : '#fff6ea' }));
  chandeliers.forEach((c, i) => points.splice(night ? points.length : 0, 0, { key: `ch${i}`, pos: [c.x, c.y, c.z], intensity: night ? 16 : 3, distance: 9, decay: 1.6, color: '#ffd28c' }));
  if (night) points.push({ key: 'yard', pos: [cx, 3, cz + 8], intensity: 20, distance: 18, decay: 2, color: '#ffcf8a' });
  (style.lighting.facadeLights ?? []).forEach((l, i) => points.push({ key: `${style.id}-l${i}`, pos: [l.x, l.y, l.z], intensity: (l.intensity ?? 3) * (night ? 3 : 1), distance: l.distance ?? 4, decay: 1.8, color: l.color ?? '#ffcf8a' }));
  const shown = tier === 'low' ? points.slice(0, 2) : points;
  return <>{shown.map((p) => <pointLight key={p.key} position={p.pos} intensity={p.intensity} distance={p.distance} decay={p.decay} color={p.color} />)}</>;
}

/** Shadow maps are drawn only when something changes (sun, doors) and, at a low rate, while the character walks. */
function ShadowFreezer({ tier, night, styleId, liveCharacter }: { tier: Tier; night: boolean; styleId: string; liveCharacter: boolean }) {
  const gl = useThree((s) => s.gl);
  const t = useRef(0);
  const settle = useRef(0);
  useEffect(() => { gl.shadowMap.autoUpdate = false; renderFlags.shadowDirty = true; settle.current = 1.6; }, [gl, tier, night, styleId]);
  useFrame((_, dt) => {
    t.current += dt;
    settle.current = Math.max(0, settle.current - dt); // keep redrawing while a new façade rises into place
    const walking = liveCharacter && player.speed > 0.05 && t.current > 0.1;
    if (renderFlags.shadowDirty || walking || settle.current > 0) { gl.shadowMap.needsUpdate = true; renderFlags.shadowDirty = false; t.current = 0; }
  });
  return null;
}

/** Ring that pulses where the floor was tapped. */
function TapMarker() {
  const ring = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, depthWrite: false, side: THREE.DoubleSide }), []);
  useFrame((_, dt) => {
    const m = player.marker, r = ring.current;
    if (!r) return;
    if (!m) { r.visible = false; return; }
    m.t += dt;
    const k = Math.min(1, m.t / 1.4);
    r.visible = k < 1;
    r.position.set(m.x, m.y + 0.03, m.z);
    r.scale.setScalar(0.6 + 0.6 * k);
    mat.opacity = 0.9 * (1 - k);
    if (k >= 1 && !player.auto) player.marker = null;
  });
  return (
    <mesh ref={ring} rotation-x={-Math.PI / 2} material={mat} visible={false}>
      <ringGeometry args={[0.32, 0.42, 40]} />
    </mesh>
  );
}

const layerGroups = new Map<string, THREE.Group>();
/** <= 2 GB devices: keep only the shown design's geometry (no pre-build, free the old one after its fade). */
const tightMemory = () => typeof navigator !== 'undefined' && ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4) <= 2;

/** Keeps the outgoing style alive while the incoming one rises in, then drops it. */
function StyleManager({ world, styleId, tier, shadows }: { world: World; styleId: string; tier: Tier; shadows: boolean }) {
  const { gl, scene, camera } = useThree();
  const [layers, setLayers] = useState<string[]>([styleId]);
  // build the other designs' geometry in idle time (not on the low tier: memory), so switching is quick
  useEffect(() => {
    if (tightMemory()) return;
    // spaced timeouts (not requestIdleCallback: Safari lacks it), one design per slot
    const ids = ['modern-tropical', 'concrete-gable', 'kerala-tile'].filter((i) => i !== styleId);
    const low = tier === 'low';
    const handles = ids.map((id, k) => window.setTimeout(() => {
      const geo = styleGeometry(world, styleById(id));
      if (low) return; // low tier: geometry only (shader warm-up would hold more GPU memory)
      // warm the shader programs too (against the live scene's lights), so the switch itself doesn't stall
      const tmp = new THREE.Scene();
      const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
      geo.byMaterial.forEach((_, name) => { const m = new THREE.Mesh(box, getMaterial(name, 1, 1)); m.castShadow = m.receiveShadow = shadows; tmp.add(m); });
      if (geo.creepers) tmp.add(new THREE.Mesh(box, creeperMaterial()));
      const done = () => box.dispose();
      const r = gl as THREE.WebGLRenderer & { compileAsync?: (o: THREE.Object3D, c: THREE.Camera, t: THREE.Scene) => Promise<unknown> };
      if (r.compileAsync) r.compileAsync(tmp, camera, scene).then(done, done); else { gl.compile(tmp, camera, scene); done(); }
    }, (low ? 6000 : 2500) + k * (low ? 2500 : 1200)));
    return () => handles.forEach((h) => clearTimeout(h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, tier]);
  useEffect(() => {
    setLayers((ls) => (ls.includes(styleId) ? ls : [...ls, styleId]));
    // swap only the style's colliders; the plan's physics never rebuilds
    world.extraObstacles = styleGeometry(world, styleById(styleId)).obstacles;
    clearNav();
  }, [styleId, world]);
  return (
    <>
      {layers.map((id) => (
        <StyleLayer key={id} world={world} style={styleById(id)} active={id === styleId} tier={tier} shadows={shadows}
          groupRef={(g) => { if (g) layerGroups.set(id, g); else layerGroups.delete(id); }}
          onGone={() => { setLayers((ls) => ls.filter((x) => x !== id)); if (tightMemory()) dropStyleGeometry(id); }} />
      ))}
    </>
  );
}

/**
 * Renders each requested style once, offscreen, from its hero camera at 320x180 (for the design
 * cards). The style is mounted hidden, drawn into a render target with its own light, read back
 * (with tone mapping + sRGB done in JS, since render targets skip them) and handed to onThumb.
 */
function ThumbnailMaker({ world, activeId, queue, tier, onThumb }: {
  world: World; activeId: string; queue: string[]; tier: Tier; onThumb: (id: string, url: string) => void;
}) {
  const { gl, scene } = useThree();
  const id = queue[0];
  const frames = useRef(0);
  const group = useRef<THREE.Group | null>(null);
  const rt = useMemo(() => new THREE.WebGLRenderTarget(320, 180, { samples: 4 }), []);
  const cam = useMemo(() => new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400), []);
  useEffect(() => () => rt.dispose(), [rt]);
  useEffect(() => { frames.current = 0; }, [id]);
  useFrame(() => {
    if (!id) return;
    const s = styleById(id);
    if (++frames.current < 4) return; // let the hidden layer mount and merge its plants
    const own = group.current;
    if (!own) return;
    const hidden: THREE.Object3D[] = [];
    layerGroups.forEach((g, k) => { if (g !== own && g.visible) { g.visible = false; hidden.push(g); } });
    const wasVisible = own.visible; own.visible = true; own.position.y = 0;
    const restore = lightingApi.apply?.(s.lighting);
    cam.position.set(...s.introCamera.pos); cam.lookAt(...s.introCamera.target); cam.updateMatrixWorld();
    const exposure = s.lighting.exposure;
    gl.setRenderTarget(rt); gl.clear(); gl.render(scene, cam); gl.setRenderTarget(null);
    restore?.();
    own.visible = wasVisible;
    hidden.forEach((g) => { g.visible = true; });
    const px = new Uint8Array(320 * 180 * 4);
    gl.readRenderTargetPixels(rt, 0, 0, 320, 180, px);
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const ctx = c.getContext('2d')!, img = ctx.createImageData(320, 180);
    const tone = (v: number) => { // linear -> ACES-ish filmic -> sRGB
      const x = (v / 255) * exposure * 1.1;
      const a = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
      const l = Math.max(0, Math.min(1, a));
      return 255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);
    };
    for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
      const si = ((179 - y) * 320 + x) * 4, di = (y * 320 + x) * 4;
      img.data[di] = tone(px[si]); img.data[di + 1] = tone(px[si + 1]); img.data[di + 2] = tone(px[si + 2]); img.data[di + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    onThumb(id, c.toDataURL('image/jpeg', 0.82));
    frames.current = 0;
  });
  if (!id) return null;
  return (
    <StyleLayer key={`thumb-${id}`} world={world} style={styleById(id)} active instant tier={tier} shadows={false}
      groupRef={(g) => { group.current = g; if (g) g.visible = false; }} />
  );
}

export default function Scene({ world, entered, view, night, tier, mobile, styleId, thumbQueue, onThumb, onHud }: {
  world: World; entered: boolean; view: ViewMode; night: boolean; tier: Tier; mobile: boolean; styleId: string;
  thumbQueue: string[]; onThumb: (id: string, url: string) => void; onHud: (h: HudInfo) => void;
}) {
  const style = styleById(styleId);
  const sun = style.lighting.sun;
  const shadows = tier !== 'low';
  const pick = useRef<THREE.Group>(null);
  useLayoutEffect(() => { sceneRefs.pickables = pick.current; return () => { sceneRefs.pickables = null; }; }, []);
  return (
    <>
      <color attach="background" args={[style.lighting.background]} />
      <fog attach="fog" args={[style.lighting.fog, tier === 'low' ? 40 : 60, tier === 'low' ? 110 : 180]} />
      <StyleLighting world={world} lighting={style.lighting} night={night} tier={tier} />
      <Environment resolution={tier === 'low' ? 64 : 256} frames={1}>
        <Lightformer form="rect" intensity={night ? 0.2 : 2.2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={night ? 0.1 : 1.2} position={[-20, 6, 10]} rotation-y={Math.PI / 2} scale={[30, 8, 1]} color="#ffe2b8" />
        <Lightformer form="rect" intensity={night ? 0.1 : 0.8} position={[20, 6, -10]} rotation-y={-Math.PI / 2} scale={[30, 8, 1]} color="#cfe3ff" />
        <Lightformer form="ring" intensity={night ? 0 : 3} position={[sun[0], sun[1], sun[2]]} scale={6} color="#fff3d0" />
      </Environment>
      <Lights world={world} style={style} night={night} tier={tier} />
      {shadows && <ShadowFreezer tier={tier} night={night} styleId={styleId} liveCharacter={view === 'third'} />}
      {!shadows && <ContactShadows key={styleId} frames={1} position={[world.center[0], 0.01, world.center[1]]} scale={world.radius * 3} opacity={0.5} blur={2.5} far={6} resolution={512} />}
      <group ref={pick}>
        <Ground />
        <House world={world} shadows={shadows} frameMat={style.materials.windowFrame} doorMat={style.materials.doorMain} />
        <StyleManager world={world} styleId={styleId} tier={tier} shadows={shadows} />
      </group>
      <MergeStatic castShadow={shadows} receiveShadow={shadows}>
        <Plants plants={world.cfg.plants ?? []} />
      </MergeStatic>
      <ThumbnailMaker world={world} activeId={styleId} queue={thumbQueue} tier={tier} onThumb={onThumb} />
      <TapMarker />
      <Player world={world} entered={entered} view={view} mobile={mobile} hero={style.introCamera} onHud={onHud} />
      {tier === 'high' && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <N8AO aoRadius={0.8} intensity={2.2} distanceFalloff={0.8} halfRes quality="medium" />
          <Bloom luminanceThreshold={0.92} intensity={night ? 0.9 : 0.25} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <SMAA />
        </EffectComposer>
      )}
      {tier === 'mid' && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom luminanceThreshold={0.92} intensity={night ? 0.9 : 0.25} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
      )}
    </>
  );
}
