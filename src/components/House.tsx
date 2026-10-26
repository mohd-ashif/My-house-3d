'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World, Piece, DoorInst, GlassInst } from '@/lib/world';
import type { MaterialName } from '@/lib/types';
import { getMaterial, pieceRepeat } from '@/lib/materials';
import { player } from '@/lib/player';
import { doorEvents, renderFlags } from '@/lib/events';
import MergeStatic from './MergeStatic';

const unitBox = new THREE.BoxGeometry(1, 1, 1);

/**
 * All static boxes (walls, floors, furniture, façade) merged into one mesh per material, with each
 * piece's texture tiling baked into its UVs. ~800 draw calls become ~35.
 */
function useMergedPieces(pieces: Piece[]) {
  const meshes = useMemo(() => {
    const byMat = new Map<string, THREE.BufferGeometry[]>();
    for (const p of pieces) {
      if (p.material === 'none' || p.role) continue; // role pieces (compound wall) are dressed by the style layer
      const g = new THREE.BoxGeometry(p.w, p.h, p.d);
      const rep = pieceRepeat(p);
      if (rep) {
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep[0], uv.getY(i) * rep[1]);
      }
      g.translate(p.x, p.y + p.h / 2, p.z);
      const list = byMat.get(p.material) ?? [];
      list.push(g); byMat.set(p.material, list);
    }
    const out: { mesh: THREE.Mesh; glass: boolean }[] = [];
    byMat.forEach((geos, name) => {
      const geo = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (geo) out.push({ mesh: new THREE.Mesh(geo, getMaterial(name as Piece['material'], 1, 1)), glass: name === 'glass' });
    });
    return out;
  }, [pieces]);
  useEffect(() => () => meshes.forEach((m) => m.mesh.geometry.dispose()), [meshes]);
  return meshes;
}

function Pane({ len, h, t = 0.025, frameMat = 'blackMetal' }: { len: number; h: number; t?: number; frameMat?: MaterialName }) {
  const f = frameMat === 'blackMetal' || frameMat === 'metal' ? 0.045 : 0.07; // timber frames are chunkier
  const frame = getMaterial(frameMat);
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

const frameOf = (own: 'black' | 'teak' | undefined, override?: MaterialName): MaterialName => override ?? (own === 'teak' ? 'teak' : 'blackMetal');

function Window({ g, frameMat }: { g: GlassInst; frameMat?: MaterialName }) {
  const len = g.b - g.a;
  const h = g.y1 - g.y0;
  const tf = along(g.axis, g.a, g.c, g.y0);
  const panes = Math.max(1, Math.round(len / 0.9));
  return (
    <group position={tf.position} rotation={tf.rotation}>
      {Array.from({ length: panes }, (_, i) => (
        <group key={i} position={[(len / panes) * (i + 0.5), 0, 0]}>
          <Pane len={len / panes} h={h} frameMat={frameOf(g.frame, frameMat)} />
        </group>
      ))}
    </group>
  );
}

function Door({ d, frameMat, doorMat }: { d: DoorInst; frameMat?: MaterialName; doorMat?: MaterialName }) {
  const leaf = useRef<THREE.Group>(null);
  const slide = useRef<THREE.Group>(null);
  const open = useRef(0);
  const len = d.b - d.a;
  const mid = (d.a + d.b) / 2;
  const cx = d.axis === 'x' ? mid : d.c;
  const cz = d.axis === 'x' ? d.c : mid;
  const tf = along(d.axis, d.a, d.c, d.y);

  const wasNear = useRef(false);
  useFrame((_, dt) => {
    const near = Math.hypot(player.x - cx, player.z - cz) < 1.8 && Math.abs(player.feet - d.y) < 1.3;
    if (near && !wasNear.current && open.current < 0.1) doorEvents.emit(); // creak + haptic
    wasNear.current = near;
    const before = open.current;
    open.current += ((near ? 1 : 0) - open.current) * Math.min(1, dt * 3.5);
    if (Math.abs(open.current - before) > 1e-3) renderFlags.shadowDirty = true; // a swinging leaf moves its shadow
    if (leaf.current) leaf.current.rotation.y = -open.current * 1.5;
    if (slide.current) slide.current.position.x = len * 0.75 - open.current * len * 0.48;
  });

  if (d.type === 'sliding') {
    return (
      <group position={tf.position} rotation={tf.rotation}>
        <group position={[len * 0.25, 0, 0.03]}><Pane len={len / 2 + 0.04} h={d.h} frameMat={frameOf(d.frame, frameMat)} /></group>
        <group ref={slide} position={[len * 0.75, 0, -0.03]}><Pane len={len / 2 + 0.04} h={d.h} frameMat={frameOf(d.frame, frameMat)} /></group>
      </group>
    );
  }
  const wood = getMaterial(d.main ? doorMat ?? 'teak' : 'doorWood', 1, 2);
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

/** The plan: walls, floors, furniture, windows, doors. Exterior styles only swap window-frame and main-door finishes here. */
export default function House({ world, shadows, frameMat, doorMat }: { world: World; shadows: boolean; frameMat?: MaterialName; doorMat?: MaterialName }) {
  const merged = useMergedPieces(world.pieces);
  return (
    <group>
      {merged.map(({ mesh, glass }) => (
        <primitive key={mesh.uuid} object={mesh} castShadow={shadows && !glass} receiveShadow={shadows && !glass} />
      ))}
      <MergeStatic key={frameMat ?? 'own'}>
        {world.glass.map((g, i) => <Window key={`g${i}`} g={g} frameMat={frameMat} />)}
      </MergeStatic>
      {world.doors.map((d, i) => <Door key={`d${i}`} d={d} frameMat={frameMat} doorMat={doorMat} />)}
    </group>
  );
}
