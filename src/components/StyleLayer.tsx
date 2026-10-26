'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import * as THREE from 'three';
import type { StyleDef } from '@/lib/types';
import type { World } from '@/lib/world';
import type { Tier } from '@/lib/device';
import { getMaterial } from '@/lib/materials';
import { buildStyleGeometry, type StyleGeometry } from '@/lib/styleGeometry';
import Plants from './Plants';
import MergeStatic from './MergeStatic';

// Style geometry is built the first time a style is shown, then cached.
const cache = new Map<string, StyleGeometry>();
export function styleGeometry(world: World, style: StyleDef) {
  let g = cache.get(style.id);
  if (!g) { g = buildStyleGeometry(world, style); cache.set(style.id, g); }
  return g;
}
/** Free a style's geometry (low-memory phones, when it is no longer shown). */
export function dropStyleGeometry(id: string) {
  const g = cache.get(id);
  if (!g) return;
  g.byMaterial.forEach((geo) => geo.dispose());
  g.creepers?.dispose();
  cache.delete(id);
}

// Creeper curtain: leaves sway with a tiny vertex shader (frozen on the low tier).
const swayTime = { value: 0 };
export function creeperMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#4f7f2c', roughness: 0.85, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = swayTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = sway * sway;
        transformed.x += sin(uTime * 1.3 + position.x * 1.7 + position.y * 2.1) * 0.07 * k;
        transformed.z += cos(uTime * 1.1 + position.x * 2.3) * 0.05 * k;`);
  };
  return m;
}

/**
 * One exterior style on top of the plan. It fades + rises in when it becomes active and fades + sinks
 * out when it stops being active, then calls onGone. Its colliders go into world.extraObstacles.
 */
export default function StyleLayer({ world, style, active, tier, shadows, onGone, groupRef, instant = false }: {
  world: World; style: StyleDef; active: boolean; tier: Tier; shadows: boolean; onGone?: () => void;
  groupRef?: (g: THREE.Group | null) => void; instant?: boolean; // instant: no fade-in (offscreen thumbnails)
}) {
  const geo = useMemo(() => styleGeometry(world, style), [world, style]);
  const group = useRef<THREE.Group | null>(null);
  const fade = useRef(instant ? 1 : 0);
  const gone = useRef(false);

  // our own material instances, so this layer can fade without touching the rest of the house
  const meshes = useMemo(() => {
    const out: THREE.Mesh[] = [];
    geo.byMaterial.forEach((g, name) => {
      const mat = getMaterial(name, 1, 1).clone();
      const m = new THREE.Mesh(g, mat);
      m.userData.glass = name === 'glass' || name === 'sheer';
      out.push(m);
    });
    if (geo.creepers) out.push(new THREE.Mesh(geo.creepers, creeperMaterial()));
    // already our own instances: the fade must not clone them again (a clone would drop the sway shader)
    out.forEach((m) => { const mat = m.material as THREE.Material; m.userData.ownMat = true; m.userData.baseOpacity = mat.opacity; m.userData.baseTransparent = mat.transparent; });
    return out;
  }, [geo]);
  useEffect(() => () => meshes.forEach((m) => (m.material as THREE.Material).dispose()), [meshes]);
  useEffect(() => {
    meshes.forEach((m) => { m.castShadow = shadows && !m.userData.glass; m.receiveShadow = shadows && !m.userData.glass; });
  }, [meshes, shadows]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05); // a build/compile hitch must not skip the fade
    if (tier !== 'low') swayTime.value += dt;
    const g = group.current;
    if (!g) return;
    const target = active ? 1 : 0;
    const before = fade.current;
    fade.current = Math.max(0, Math.min(1, fade.current + Math.sign(target - fade.current) * (dt / 1.2)));
    const f = fade.current;
    g.position.y = active ? -0.6 * (1 - f) * (1 - f) : -0.3 * (1 - f);
    if (tier === 'low') {
      // low tier: no opacity fade (switching every material to transparent recompiles its shader);
      // the old façade just disappears and the new one rises into place
      g.visible = active || f > 0.999;
      if (!active && f <= 0 && !gone.current) { gone.current = true; onGone?.(); }
      return;
    }
    if (before !== f || f < 1) {
      // fade every material under this layer (cloned on first use, so plants elsewhere are untouched)
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.userData.noFade) return;
        if (!m.userData.ownMat) { m.material = (m.material as THREE.Material).clone(); m.userData.ownMat = true; m.userData.baseOpacity = (m.material as THREE.Material).opacity; m.userData.baseTransparent = (m.material as THREE.Material).transparent; }
        const mat = m.material as THREE.Material;
        mat.opacity = (m.userData.baseOpacity as number) * f;
        const tr = f < 0.999 || !!m.userData.baseTransparent;
        if (mat.transparent !== tr) { mat.transparent = tr; mat.needsUpdate = true; }
        mat.depthWrite = f > 0.5 && !m.userData.baseTransparent;
      });
    }
    if (!active && f <= 0 && !gone.current) { gone.current = true; onGone?.(); }
  });

  const road = style.landscape.road;
  // wet road: a true planar mirror under a translucent asphalt layer. three's Reflector renders inside
  // the mesh's onBeforeRender and restores the active target, so it is safe with the post-processing composer.
  const mirror = useMemo(() => {
    if (!road?.reflect || tier === 'low') return null;
    const res = tier === 'high' ? 512 : 256;
    const r = new Reflector(new THREE.PlaneGeometry(road.x2 - road.x1, road.z2 - road.z1), { textureWidth: res, textureHeight: res, color: 0x8a9099 });
    r.rotation.x = -Math.PI / 2;
    r.position.set((road.x1 + road.x2) / 2, 0.006, (road.z1 + road.z2) / 2);
    r.userData.noFade = true;
    return r;
  }, [road, tier]);
  useEffect(() => () => { mirror?.getRenderTarget().dispose(); mirror?.geometry.dispose(); (mirror?.material as THREE.Material | undefined)?.dispose(); }, [mirror]);
  return (
    <group ref={(g) => { group.current = g; groupRef?.(g); }}>
      {meshes.map((m) => <primitive key={m.uuid} object={m} />)}
      <MergeStatic castShadow={shadows} receiveShadow={shadows}>
        <Plants plants={style.landscape.plants} />
      </MergeStatic>
      {mirror && <primitive object={mirror} />}
      {road && (
        <mesh rotation-x={-Math.PI / 2} position={[(road.x1 + road.x2) / 2, 0.012, (road.z1 + road.z2) / 2]} receiveShadow>
          <planeGeometry args={[road.x2 - road.x1, road.z2 - road.z1]} />
          {mirror
            ? <meshStandardMaterial color="#25282c" roughness={0.3} metalness={0.2} transparent opacity={0.62} />
            : <meshStandardMaterial color="#2b2e33" roughness={0.25} metalness={0.3} />}
        </mesh>
      )}
    </group>
  );
}
