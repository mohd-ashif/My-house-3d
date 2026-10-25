'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { World, Piece, DoorInst, GlassInst } from '@/lib/world';
import { getMaterial, materialForPiece } from '@/lib/materials';
import { player } from '@/lib/player';

const unitBox = new THREE.BoxGeometry(1, 1, 1);

function PieceMesh({ p, shadows }: { p: Piece; shadows: boolean }) {
  const mat = useMemo(() => materialForPiece(p), [p]);
  if (p.material === 'none') return null;
  const isGlass = p.material === 'glass';
  return (
    <mesh
      geometry={unitBox}
      material={mat}
      position={[p.x, p.y + p.h / 2, p.z]}
      scale={[p.w, p.h, p.d]}
      castShadow={shadows && !isGlass}
      receiveShadow={shadows && !isGlass}
    />
  );
}

function Pane({ len, h, t = 0.025 }: { len: number; h: number; t?: number }) {
  const f = 0.045;
  const frame = getMaterial('blackMetal');
  return (
    <group>
      <mesh geometry={unitBox} material={getMaterial('glass')} scale={[len - f, h - f, t]} position={[0, h / 2, 0]} />
      <mesh geometry={unitBox} material={frame} scale={[len, f, t + 0.02]} position={[0, f / 2, 0]} />
      <mesh geometry={unitBox} material={frame} scale={[len, f, t + 0.02]} position={[0, h - f / 2, 0]} />
      <mesh geometry={unitBox} material={frame} scale={[f, h, t + 0.02]} position={[-len / 2 + f / 2, h / 2, 0]} />
      <mesh geometry={unitBox} material={frame} scale={[f, h, t + 0.02]} position={[len / 2 - f / 2, h / 2, 0]} />
    </group>
  );
}

/** Wall-aligned group: local +x runs along the wall from a to b. */
function along(axis: 'x' | 'z', a: number, c: number, y: number) {
  return axis === 'x'
    ? { position: [a, y, c] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
    : { position: [c, y, a] as [number, number, number], rotation: [0, -Math.PI / 2, 0] as [number, number, number] };
}

function Window({ g }: { g: GlassInst }) {
  const len = g.b - g.a;
  const h = g.y1 - g.y0;
  const tf = along(g.axis, g.a, g.c, g.y0);
  const panes = Math.max(1, Math.round(len / 0.9));
  return (
    <group position={tf.position} rotation={tf.rotation}>
      {Array.from({ length: panes }, (_, i) => (
        <group key={i} position={[(len / panes) * (i + 0.5), 0, 0]}>
          <Pane len={len / panes} h={h} />
        </group>
      ))}
    </group>
  );
}

function Door({ d }: { d: DoorInst }) {
  const leaf = useRef<THREE.Group>(null);
  const slide = useRef<THREE.Group>(null);
  const open = useRef(0);
  const len = d.b - d.a;
  const mid = (d.a + d.b) / 2;
  const cx = d.axis === 'x' ? mid : d.c;
  const cz = d.axis === 'x' ? d.c : mid;
  const tf = along(d.axis, d.a, d.c, d.y);

  useFrame((_, dt) => {
    const near = Math.hypot(player.x - cx, player.z - cz) < 1.8 && Math.abs(player.feet - d.y) < 1.3;
    open.current += ((near ? 1 : 0) - open.current) * Math.min(1, dt * 3.5);
    if (leaf.current) leaf.current.rotation.y = -open.current * 1.5;
    if (slide.current) slide.current.position.x = len * 0.75 - open.current * len * 0.48;
  });

  if (d.type === 'sliding') {
    return (
      <group position={tf.position} rotation={tf.rotation}>
        <group position={[len * 0.25, 0, 0.03]}><Pane len={len / 2 + 0.04} h={d.h} /></group>
        <group ref={slide} position={[len * 0.75, 0, -0.03]}><Pane len={len / 2 + 0.04} h={d.h} /></group>
      </group>
    );
  }
  const wood = getMaterial(d.main ? 'darkWood' : 'doorWood', 1, 2);
  const metal = getMaterial('metal');
  return (
    <group position={tf.position} rotation={tf.rotation}>
      {/* frame */}
      <mesh geometry={unitBox} material={getMaterial('darkWood')} scale={[0.05, d.h, 0.22]} position={[0.025, d.h / 2, 0]} />
      <mesh geometry={unitBox} material={getMaterial('darkWood')} scale={[0.05, d.h, 0.22]} position={[len - 0.025, d.h / 2, 0]} />
      <mesh geometry={unitBox} material={getMaterial('darkWood')} scale={[len, 0.05, 0.22]} position={[len / 2, d.h - 0.025, 0]} />
      <group ref={leaf} position={[0.05, 0, 0]}>
        <mesh geometry={unitBox} material={wood} scale={[len - 0.1, d.h - 0.06, 0.045]} position={[(len - 0.1) / 2, (d.h - 0.06) / 2, 0]} castShadow />
        <mesh geometry={unitBox} material={metal} scale={[0.14, 0.025, 0.06]} position={[len - 0.22, 1.0, 0.04]} />
        <mesh geometry={unitBox} material={metal} scale={[0.14, 0.025, 0.06]} position={[len - 0.22, 1.0, -0.04]} />
        {d.main && <mesh geometry={unitBox} material={metal} scale={[0.03, 1.2, 0.05]} position={[len - 0.25, 1.05, 0.05]} />}
      </group>
    </group>
  );
}

export default function House({ world, shadows }: { world: World; shadows: boolean }) {
  return (
    <group>
      {world.pieces.map((p, i) => <PieceMesh key={i} p={p} shadows={shadows} />)}
      {world.glass.map((g, i) => <Window key={`g${i}`} g={g} />)}
      {world.doors.map((d, i) => <Door key={`d${i}`} d={d} />)}
    </group>
  );
}
