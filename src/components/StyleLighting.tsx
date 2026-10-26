'use client';
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky, Clouds, Cloud } from '@react-three/drei';
import * as THREE from 'three';
import type { StyleLighting as SL } from '@/lib/types';
import type { World } from '@/lib/world';
import type { Tier } from '@/lib/device';
import { renderFlags } from '@/lib/events';

interface LS {
  sunDir: THREE.Vector3; skySun: THREE.Vector3; sunColor: THREE.Color; sunI: number;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemiI: number; amb: number; exposure: number;
  turb: number; ray: number; mie: number; mieG: number; bg: THREE.Color; fog: THREE.Color;
}

function targetOf(l: SL, night: boolean, tier: Tier): LS {
  const dir = new THREE.Vector3(...l.sun).normalize();
  return {
    sunDir: dir,
    skySun: night ? new THREE.Vector3(l.sun[0], -6, l.sun[2]) : new THREE.Vector3(...l.sun),
    sunColor: new THREE.Color(night ? '#9fb4ff' : l.sunColor),
    sunI: night ? 0.06 : l.sunIntensity,
    hemiSky: new THREE.Color(night ? '#1a2440' : l.hemi[0]),
    hemiGround: new THREE.Color(night ? '#0b0d10' : l.hemi[1]),
    hemiI: night ? 0.15 : l.hemi[2],
    amb: night ? 0.04 : l.ambient + (tier === 'low' ? 0.1 : 0),
    exposure: night ? 1 : l.exposure,
    turb: night ? 2 : l.sky.turbidity, ray: night ? 0.3 : l.sky.rayleigh,
    mie: l.sky.mieCoefficient, mieG: l.sky.mieDirectionalG,
    bg: new THREE.Color(night ? '#05070d' : l.background), fog: new THREE.Color(night ? '#05070d' : l.fog),
  };
}

const clone = (s: LS): LS => ({ ...s, sunDir: s.sunDir.clone(), skySun: s.skySun.clone(), sunColor: s.sunColor.clone(),
  hemiSky: s.hemiSky.clone(), hemiGround: s.hemiGround.clone(), bg: s.bg.clone(), fog: s.fog.clone() });

/** Handles for the thumbnail renderer: apply another style's light for one offscreen render. */
export const lightingApi: { apply: ((l: SL) => () => void) | null } = { apply: null };

let cloudUrl: string | null = null;
function cloudTexture() {
  if (cloudUrl) return cloudUrl;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 9; i++) { // a soft puff made of overlapping blobs
    const x = 34 + Math.random() * 60, y = 44 + Math.random() * 40, r = 22 + Math.random() * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  }
  cloudUrl = c.toDataURL();
  return cloudUrl;
}

export default function StyleLighting({ world, lighting, night, tier }: { world: World; lighting: SL; night: boolean; tier: Tier }) {
  const { gl, scene } = useThree();
  const shadows = tier !== 'low';
  const [cx, cz] = world.center;
  const R = world.radius + 8;
  const mapSize = tier === 'high' ? 2048 : 1024;
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const sky = useRef<THREE.Mesh>(null);
  const target = useMemo(() => { const o = new THREE.Object3D(); o.position.set(cx, 0, cz); return o; }, [cx, cz]);
  const want = useMemo(() => targetOf(lighting, night, tier), [lighting, night, tier]);
  const cur = useRef<LS | null>(null);

  const push = (s: LS) => {
    if (sun.current) { sun.current.position.set(cx + s.sunDir.x * 45, s.sunDir.y * 45, cz + s.sunDir.z * 45); sun.current.color.copy(s.sunColor); sun.current.intensity = s.sunI; }
    if (hemi.current) { hemi.current.color.copy(s.hemiSky); hemi.current.groundColor.copy(s.hemiGround); hemi.current.intensity = s.hemiI; }
    if (amb.current) amb.current.intensity = s.amb;
    const u = (sky.current?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (u) { u.sunPosition.value.copy(s.skySun); u.turbidity.value = s.turb; u.rayleigh.value = s.ray; u.mieCoefficient.value = s.mie; u.mieDirectionalG.value = s.mieG; }
    if (scene.background instanceof THREE.Color) scene.background.copy(s.bg); else scene.background = s.bg.clone();
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(s.fog);
    gl.toneMappingExposure = s.exposure;
  };

  lightingApi.apply = (l: SL) => {
    const before = cur.current ? clone(cur.current) : null;
    push(targetOf(l, false, tier));
    return () => { if (before) push(before); };
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (!cur.current) { cur.current = clone(want); push(cur.current); renderFlags.shadowDirty = true; return; }
    const c = cur.current, k = 1 - Math.exp(-dt * 3.2);
    const moved = c.sunDir.angleTo(want.sunDir) > 1e-3;
    c.sunDir.lerp(want.sunDir, k).normalize(); c.skySun.lerp(want.skySun, k);
    c.sunColor.lerp(want.sunColor, k); c.hemiSky.lerp(want.hemiSky, k); c.hemiGround.lerp(want.hemiGround, k);
    c.bg.lerp(want.bg, k); c.fog.lerp(want.fog, k);
    c.sunI += (want.sunI - c.sunI) * k; c.hemiI += (want.hemiI - c.hemiI) * k; c.amb += (want.amb - c.amb) * k;
    c.exposure += (want.exposure - c.exposure) * k; c.turb += (want.turb - c.turb) * k; c.ray += (want.ray - c.ray) * k;
    c.mie += (want.mie - c.mie) * k; c.mieG += (want.mieG - c.mieG) * k;
    push(c);
    if (moved) renderFlags.shadowDirty = true; // the sun moved: redraw the frozen shadow map
  });

  const clouds = lighting.clouds && tier !== 'low' && !night ? lighting.clouds : null;
  const cloudSpots = useMemo(() => {
    if (!clouds) return [];
    let seed = clouds.count * 7919;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: clouds.count }, (_, i) => {
      const a = (i / clouds.count) * Math.PI * 2 + rnd() * 0.6, r = 45 + rnd() * 35;
      return { pos: [cx + Math.cos(a) * r, (clouds.height ?? 32) + rnd() * 10, cz + Math.sin(a) * r - 10] as [number, number, number], seed: i + 1 };
    });
  }, [clouds, cx, cz]);

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={sun}
        key={`sun-${tier}`}
        target={target}
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-R}
        shadow-camera-right={R}
        shadow-camera-top={R}
        shadow-camera-bottom={-R}
        shadow-camera-near={1}
        shadow-camera-far={110}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
      />
      <hemisphereLight ref={hemi} />
      <ambientLight ref={amb} />
      <Sky ref={sky as never} sunPosition={lighting.sun} turbidity={lighting.sky.turbidity} rayleigh={lighting.sky.rayleigh}
        mieCoefficient={lighting.sky.mieCoefficient} mieDirectionalG={lighting.sky.mieDirectionalG} />
      {clouds && (
        <Clouds texture={cloudTexture()} material={THREE.MeshBasicMaterial} limit={clouds.count * 24}>
          {cloudSpots.map((c) => (
            <Cloud key={c.seed} seed={c.seed} position={c.pos} segments={tier === 'high' ? 22 : 12} bounds={[14, 3, 6]} volume={12}
              color={clouds.color ?? '#ffffff'} opacity={clouds.opacity} fade={80} speed={0.08} growth={4} />
          ))}
        </Clouds>
      )}
    </>
  );
}
