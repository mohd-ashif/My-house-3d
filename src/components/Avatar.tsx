'use client';
import { forwardRef, useRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';

// The procedural man, shared by this visitor's character and everyone else's.
const skin = new THREE.MeshStandardMaterial({ color: '#b27b57', roughness: 0.6 });
export const defaultShirt = new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.9 });
const jeans = new THREE.MeshStandardMaterial({ color: '#2f3d55', roughness: 0.9 });
const shoe = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.6 });
const hair = new THREE.MeshStandardMaterial({ color: '#16110d', roughness: 0.8 });

export interface Limbs { legL: RefObject<THREE.Group>; legR: RefObject<THREE.Group>; armL: RefObject<THREE.Group>; armR: RefObject<THREE.Group> }

export function useLimbs(): Limbs {
  return { legL: useRef<THREE.Group>(null), legR: useRef<THREE.Group>(null), armL: useRef<THREE.Group>(null), armR: useRef<THREE.Group>(null) };
}

/** Walk cycle: `swing` is sin(phase) * stride amount. */
export function poseLimbs(l: Limbs, swing: number) {
  if (l.legL.current) l.legL.current.rotation.x = swing;
  if (l.legR.current) l.legR.current.rotation.x = -swing;
  if (l.armL.current) l.armL.current.rotation.x = -swing * 0.8;
  if (l.armR.current) l.armR.current.rotation.x = swing * 0.8;
}

export const Avatar = forwardRef<THREE.Group, { limbs: Limbs; shirt?: THREE.Material; shadows?: boolean; children?: ReactNode }>(
  function Avatar({ limbs, shirt = defaultShirt, shadows = true, children }, ref) {
    const cs = shadows;
    return (
      <group ref={ref}>
        {/* legs (pivot at hip) */}
        <group ref={limbs.legL} position={[-0.1, 0.92, 0]}>
          <mesh material={jeans} position={[0, -0.43, 0]} castShadow={cs}><capsuleGeometry args={[0.075, 0.72, 4, 10]} /></mesh>
          <mesh material={shoe} position={[0, -0.88, -0.05]} castShadow={cs}><boxGeometry args={[0.12, 0.08, 0.27]} /></mesh>
        </group>
        <group ref={limbs.legR} position={[0.1, 0.92, 0]}>
          <mesh material={jeans} position={[0, -0.43, 0]} castShadow={cs}><capsuleGeometry args={[0.075, 0.72, 4, 10]} /></mesh>
          <mesh material={shoe} position={[0, -0.88, -0.05]} castShadow={cs}><boxGeometry args={[0.12, 0.08, 0.27]} /></mesh>
        </group>
        {/* torso */}
        <mesh material={jeans} position={[0, 0.98, 0]} castShadow={cs}><capsuleGeometry args={[0.16, 0.08, 4, 12]} /></mesh>
        <mesh material={shirt} position={[0, 1.24, 0]} castShadow={cs} scale={[1, 1, 0.72]}><capsuleGeometry args={[0.19, 0.34, 6, 14]} /></mesh>
        {/* arms (pivot at shoulder) */}
        <group ref={limbs.armL} position={[-0.25, 1.45, 0]}>
          <mesh material={shirt} position={[0, -0.14, 0]} castShadow={cs}><capsuleGeometry args={[0.06, 0.22, 4, 8]} /></mesh>
          <mesh material={skin} position={[0, -0.42, 0]} castShadow={cs}><capsuleGeometry args={[0.048, 0.3, 4, 8]} /></mesh>
        </group>
        <group ref={limbs.armR} position={[0.25, 1.45, 0]}>
          <mesh material={shirt} position={[0, -0.14, 0]} castShadow={cs}><capsuleGeometry args={[0.06, 0.22, 4, 8]} /></mesh>
          <mesh material={skin} position={[0, -0.42, 0]} castShadow={cs}><capsuleGeometry args={[0.048, 0.3, 4, 8]} /></mesh>
        </group>
        {/* head */}
        <mesh material={skin} position={[0, 1.56, 0]} castShadow={cs}><capsuleGeometry args={[0.04, 0.06, 4, 8]} /></mesh>
        <mesh material={skin} position={[0, 1.7, 0]} castShadow={cs} scale={[0.9, 1.05, 1]}><sphereGeometry args={[0.115, 20, 16]} /></mesh>
        <mesh material={hair} position={[0, 1.75, 0.015]} castShadow={cs} scale={[0.95, 0.75, 1.02]}><sphereGeometry args={[0.12, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        {children}
      </group>
    );
  },
);
