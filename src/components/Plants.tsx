'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import type { Plant } from '@/lib/types';
import { getMaterial } from '@/lib/materials';

const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b5844', roughness: 0.95 });
const leafMats = ['#3e6b26', '#4d7d2e', '#355f22', '#5a8a35'].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide, flatShading: true }),
);
const potMat = new THREE.MeshStandardMaterial({ color: '#b46a45', roughness: 0.8 });

function frondGeometry() {
  // A drooping palm frond: a strip of leaflets along a curved spine.
  const g = new THREE.PlaneGeometry(2.6, 0.7, 12, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 1.3; // 0..2.6 along the frond
    const y = pos.getY(i);
    const width = Math.sin((x / 2.6) * Math.PI) * 0.9 + 0.1;
    pos.setXYZ(i, x, -0.12 * x * x + Math.abs(y) * 0.25, y * width);
  }
  g.computeVertexNormals();
  return g;
}

function Palm({ p }: { p: Plant }) {
  const s = p.scale ?? 1;
  const frond = useMemo(frondGeometry, []);
  const segs = 8;
  const height = 5.5 * s;
  const lean = 0.35 * s;
  const top = new THREE.Vector3(lean, height, 0);
  return (
    <group position={[p.x, p.y ?? 0, p.z]} rotation={[0, (p.x * 7 + p.z * 3) % 6.28, 0]}>
      {Array.from({ length: segs }, (_, i) => {
        const t = (i + 0.5) / segs;
        return (
          <mesh key={i} material={trunkMat} castShadow position={[lean * t * t, height * t, 0]} rotation={[0, 0, -lean * 0.25 * t]}>
            <cylinderGeometry args={[0.13 - 0.03 * t, 0.16 - 0.03 * t, height / segs + 0.02, 8]} />
          </mesh>
        );
      })}
      <group position={top.toArray()}>
        {Array.from({ length: 11 }, (_, i) => (
          <mesh key={i} geometry={frond} material={leafMats[i % 4]} castShadow
            rotation={[((i % 3) - 1) * 0.15, (i / 11) * Math.PI * 2, 0.35 - (i % 2) * 0.25]} scale={s} />
        ))}
        <mesh material={trunkMat}><sphereGeometry args={[0.22 * s, 8, 8]} /></mesh>
      </group>
    </group>
  );
}

function Tree({ p }: { p: Plant }) {
  const s = p.scale ?? 1;
  return (
    <group position={[p.x, p.y ?? 0, p.z]} scale={s}>
      <mesh material={trunkMat} position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.12, 0.2, 2.4, 8]} /></mesh>
      <mesh material={leafMats[0]} position={[0, 3.0, 0]} castShadow><icosahedronGeometry args={[1.5, 1]} /></mesh>
      <mesh material={leafMats[1]} position={[0.8, 2.6, 0.3]} castShadow><icosahedronGeometry args={[1.0, 1]} /></mesh>
      <mesh material={leafMats[3]} position={[-0.7, 2.7, -0.4]} castShadow><icosahedronGeometry args={[1.1, 1]} /></mesh>
    </group>
  );
}

function Shrub({ p }: { p: Plant }) {
  const s = p.scale ?? 1;
  return (
    <group position={[p.x, p.y ?? 0, p.z]} scale={s}>
      <mesh material={leafMats[1]} position={[0, 0.4, 0]} castShadow><icosahedronGeometry args={[0.5, 1]} /></mesh>
      <mesh material={leafMats[3]} position={[0.3, 0.3, 0.2]} castShadow><icosahedronGeometry args={[0.35, 1]} /></mesh>
    </group>
  );
}

function Hedge({ p }: { p: Plant }) {
  const w = p.w ?? 1, d = p.d ?? 0.6;
  return (
    <mesh material={leafMats[2]} position={[p.x, (p.y ?? 0) + 0.5, p.z]} castShadow receiveShadow>
      <boxGeometry args={[w, 1, d, Math.ceil(w * 3), 3, 2]} />
    </mesh>
  );
}

function Potted({ p }: { p: Plant }) {
  const s = p.scale ?? 1;
  return (
    <group position={[p.x, p.y ?? 0, p.z]} scale={s}>
      <mesh material={potMat} position={[0, 0.22, 0]} castShadow><cylinderGeometry args={[0.2, 0.15, 0.44, 16]} /></mesh>
      <mesh material={leafMats[1]} position={[0, 0.75, 0]} castShadow><icosahedronGeometry args={[0.38, 1]} /></mesh>
      <mesh material={leafMats[3]} position={[0.1, 1.05, 0.05]} castShadow><icosahedronGeometry args={[0.25, 1]} /></mesh>
    </group>
  );
}

export default function Plants({ plants }: { plants: Plant[] }) {
  return (
    <group>
      {plants.map((p, i) => {
        switch (p.type) {
          case 'palm': return <Palm key={i} p={p} />;
          case 'tree': return <Tree key={i} p={p} />;
          case 'hedge': return <Hedge key={i} p={p} />;
          case 'potted': return <Potted key={i} p={p} />;
          default: return <Shrub key={i} p={p} />;
        }
      })}
    </group>
  );
}

export function Ground() {
  const mat = useMemo(() => getMaterial('grass', 50, 50), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow material={mat}>
      <planeGeometry args={[150, 150]} />
    </mesh>
  );
}
