'use client';
import { useEffect, useMemo } from 'react';
import { Sky, Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import type { World } from '@/lib/world';
import { setLampGlow } from '@/lib/materials';
import House from './House';
import Plants, { Ground } from './Plants';
import Player, { type HudInfo, type ViewMode } from './Player';

export type Quality = 'high' | 'low';

function Lights({ world, night, shadows }: { world: World; night: boolean; shadows: boolean }) {
  const fill = shadows || night; // low quality skips the daytime fill lights
  const [cx, cz] = world.center;
  const sun = world.cfg.sun ?? [-30, 40, 25];
  const target = useMemo(() => { const o = new THREE.Object3D(); o.position.set(cx, 0, cz); return o; }, [cx, cz]);
  const len = Math.hypot(...sun);
  const dist = 45;
  const sunPos: [number, number, number] = [cx + (sun[0] / len) * dist, (sun[1] / len) * dist, cz + (sun[2] / len) * dist];
  const R = world.radius + 8;

  // Warm interior lights in the biggest rooms (night mode)
  const roomLights = useMemo(() => {
    return world.cfg.rooms
      .filter((r) => (r.kind ?? 'room') === 'room')
      .map((r) => ({ r, area: (r.x2 - r.x1) * (r.z2 - r.z1) }))
      .sort((a, b) => b.area - a.area)
      .slice(0, 8)
      .map(({ r }) => {
        const f = world.cfg.floors[r.floor];
        return { x: (r.x1 + r.x2) / 2, z: (r.z1 + r.z2) / 2, y: f.y + f.height - world.cfg.slabThickness - 0.35 };
      });
  }, [world]);

  // a warm light at the heart of each chandelier
  const chandeliers = useMemo(() => (world.cfg.furniture ?? []).filter((f) => f.type === 'chandelier').map((f) => {
    const fy = world.cfg.floors[f.floor]?.y ?? 0;
    return { x: f.x, z: f.z, y: fy + (f.d ?? 2.95) - (f.w ?? 2.2) * 0.6 };
  }), [world]);

  useEffect(() => { setLampGlow(night ? 4 : 1.2); }, [night]);

  return (
    <>
      <primitive object={target} />
      <directionalLight
        position={sunPos}
        target={target}
        intensity={night ? 0.06 : 3.2}
        color={night ? '#9fb4ff' : '#fff1d6'}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-R}
        shadow-camera-right={R}
        shadow-camera-top={R}
        shadow-camera-bottom={-R}
        shadow-camera-near={1}
        shadow-camera-far={110}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
      />
      <hemisphereLight args={[night ? '#1a2440' : '#d6e8ff', night ? '#0b0d10' : '#4a5a35', night ? 0.15 : 0.55]} />
      <ambientLight intensity={night ? 0.04 : 0.12} />
      {/* interior fill (daylight bouncing in) by day, warm lamps by night */}
      {fill && roomLights.map((l, i) => (
        <pointLight key={i} position={[l.x, l.y, l.z]} intensity={night ? 9 : 3.5} distance={night ? 9 : 7} decay={1.6} color={night ? '#ffd29a' : '#fff6ea'} />
      ))}
      {night && <pointLight position={[cx, 3, cz + 8]} intensity={20} distance={18} color="#ffcf8a" />}
      {chandeliers.map((c, i) => (
        <pointLight key={`ch${i}`} position={[c.x, c.y, c.z]} intensity={night ? 16 : 3} distance={9} decay={1.6} color="#ffd28c" />
      ))}
    </>
  );
}

export default function Scene({ world, entered, view, night, quality, onHud }: {
  world: World; entered: boolean; view: ViewMode; night: boolean; quality: Quality; onHud: (h: HudInfo) => void;
}) {
  const high = quality === 'high';
  const sun = world.cfg.sun ?? [-30, 40, 25];
  return (
    <>
      <color attach="background" args={[night ? '#05070d' : '#bcd4ea']} />
      <fog attach="fog" args={[night ? '#05070d' : '#cfdbe6', 60, 180]} />
      {night
        ? <Sky sunPosition={[sun[0], -6, sun[2]]} turbidity={2} rayleigh={0.3} />
        : <Sky sunPosition={sun} turbidity={5} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={night ? 0.2 : 2.2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={night ? 0.1 : 1.2} position={[-20, 6, 10]} rotation-y={Math.PI / 2} scale={[30, 8, 1]} color="#ffe2b8" />
        <Lightformer form="rect" intensity={night ? 0.1 : 0.8} position={[20, 6, -10]} rotation-y={-Math.PI / 2} scale={[30, 8, 1]} color="#cfe3ff" />
        <Lightformer form="ring" intensity={night ? 0 : 3} position={[sun[0], sun[1], sun[2]]} scale={6} color="#fff3d0" />
      </Environment>
      <Lights world={world} night={night} shadows={high} />
      <Ground />
      {!high && <ContactShadows position={[world.center[0], 0.01, world.center[1]]} scale={world.radius * 3} opacity={0.5} blur={2.5} far={6} />}
      <House world={world} shadows={high} />
      <Plants plants={world.cfg.plants ?? []} />
      <Player world={world} entered={entered} view={view} onHud={onHud} />
      {high && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <N8AO aoRadius={0.8} intensity={2.2} distanceFalloff={0.8} halfRes quality="medium" />
          <Bloom luminanceThreshold={0.92} intensity={night ? 0.9 : 0.25} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <SMAA />
        </EffectComposer>
      )}
    </>
  );
}
