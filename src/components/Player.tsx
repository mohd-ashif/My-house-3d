'use client';
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { World } from '@/lib/world';
import { player, keys } from '@/lib/player';
import { groundHeight, resolve, pointBlocked, roomAt } from '@/lib/physics';
import { shot } from '@/lib/shot';

export type ViewMode = 'third' | 'first';
export interface HudInfo { room: string; floor: number }

const skin = new THREE.MeshStandardMaterial({ color: '#b27b57', roughness: 0.6 });
const shirt = new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.9 });
const jeans = new THREE.MeshStandardMaterial({ color: '#2f3d55', roughness: 0.9 });
const shoe = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.6 });
const hair = new THREE.MeshStandardMaterial({ color: '#16110d', roughness: 0.8 });

const tmp = new THREE.Vector3();
const head = new THREE.Vector3();

export default function Player({ world, entered, view, onHud }: {
  world: World; entered: boolean; view: ViewMode; onHud: (h: HudInfo) => void;
}) {
  const { camera } = useThree();
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const hudT = useRef(0);
  const camDist = useRef(3.2);
  const lastHud = useRef('');

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);

    if (shot) {
      camera.position.set(...shot.pos);
      camera.lookAt(...shot.target);
      if (body.current) body.current.visible = false;
      return;
    }
    if (!entered) {
      // cinematic orbit before entering
      const t = state.clock.elapsedTime * 0.07;
      const R = world.radius * 1.9 + 6;
      camera.position.set(world.center[0] + Math.sin(t) * R, R * 0.5, world.center[1] + Math.cos(t) * R);
      camera.lookAt(world.center[0], 2.5, world.center[1]);
      if (body.current) body.current.visible = false;
      return;
    }

    // ---------- input ----------
    const k = (c: string) => keys.has(c);
    let fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) - player.joy.y;
    let str = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0) + player.joy.x;
    const turn = (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0);
    player.yaw += turn * dt * 1.8;
    const len = Math.hypot(fwd, str);
    if (len > 1) { fwd /= len; str /= len; }
    const run = k('ShiftLeft') || k('ShiftRight');
    const speed = (run ? 4.2 : 1.9) * Math.min(1, Math.hypot(fwd, str));

    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    let mx = (fx * fwd + rx * str), mz = (fz * fwd + rz * str);
    const ml = Math.hypot(mx, mz);
    if (ml > 1e-4) { mx = (mx / ml) * speed * dt; mz = (mz / ml) * speed * dt; } else { mx = 0; mz = 0; }

    // ---------- move + collide (sub-steps keep thin walls solid) ----------
    const sub = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.08));
    let x = player.x, z = player.z;
    for (let i = 0; i < sub; i++) {
      [x, z] = resolve(world, x + mx / sub, z + mz / sub, player.feet);
      const g = groundHeight(world, x, z, player.feet);
      if (g >= player.feet) { player.feet = g; player.vy = 0; }
    }
    const moved = Math.hypot(x - player.x, z - player.z);
    player.speed = moved / Math.max(dt, 1e-4);
    player.x = x; player.z = z;

    // ---------- gravity ----------
    const g = groundHeight(world, x, z, player.feet);
    if (g < player.feet) {
      player.vy -= 9.81 * dt;
      player.feet = Math.max(g, player.feet + player.vy * dt);
      if (player.feet === g) player.vy = 0;
    }
    player.eye += (player.feet + 1.62 - player.eye) * (1 - Math.exp(-dt * 14));

    // ---------- character ----------
    if (ml > 1e-4) {
      const target = Math.atan2(-mx, -mz);
      let diff = target - player.bodyYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.bodyYaw += diff * Math.min(1, dt * 10);
    }
    const walkAmt = Math.min(1, player.speed / 2);
    phase.current += dt * (2 + player.speed * 2.4);
    const swing = Math.sin(phase.current) * 0.55 * walkAmt;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.8;
    if (armR.current) armR.current.rotation.x = swing * 0.8;
    if (body.current) {
      body.current.visible = view === 'third';
      body.current.position.set(x, player.eye - 1.62 + Math.abs(Math.sin(phase.current)) * 0.03 * walkAmt, z);
      body.current.rotation.y = player.bodyYaw;
    }

    // ---------- camera ----------
    const e = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ');
    if (view === 'first') {
      camera.position.set(x, player.eye, z);
      camera.quaternion.setFromEuler(e);
    } else {
      const pitch = Math.max(-0.9, Math.min(0.75, player.pitch));
      head.set(x, player.eye + 0.05, z);
      const dir = tmp.set(Math.sin(player.yaw) * Math.cos(pitch), -Math.sin(pitch) + 0.18, Math.cos(player.yaw) * Math.cos(pitch)).normalize();
      // shorten the boom when a wall or ceiling is in the way
      let d = 0.35;
      while (d < 3.2 && !pointBlocked(world, head.x + dir.x * d, head.y + dir.y * d, head.z + dir.z * d)) d += 0.1;
      const want = Math.max(0.35, d - 0.2);
      camDist.current += (want - camDist.current) * (want < camDist.current ? 1 : 1 - Math.exp(-dt * 4));
      camera.position.set(head.x + dir.x * camDist.current, head.y + dir.y * camDist.current, head.z + dir.z * camDist.current);
      camera.lookAt(head.x, head.y - 0.1, head.z);
      if (body.current) body.current.visible = camDist.current > 0.7;
    }

    // ---------- HUD (5x per second) ----------
    hudT.current += dt;
    if (hudT.current > 0.2) {
      hudT.current = 0;
      const { room, floor } = roomAt(world, x, z, player.feet);
      const name = room ? room.name : 'Garden';
      const key = `${name}|${floor}`;
      if (key !== lastHud.current) { lastHud.current = key; onHud({ room: name, floor }); }
    }
  });

  return (
    <group ref={body}>
      {/* legs (pivot at hip) */}
      <group ref={legL} position={[-0.1, 0.92, 0]}>
        <mesh material={jeans} position={[0, -0.43, 0]} castShadow><capsuleGeometry args={[0.075, 0.72, 4, 10]} /></mesh>
        <mesh material={shoe} position={[0, -0.88, -0.05]} castShadow><boxGeometry args={[0.12, 0.08, 0.27]} /></mesh>
      </group>
      <group ref={legR} position={[0.1, 0.92, 0]}>
        <mesh material={jeans} position={[0, -0.43, 0]} castShadow><capsuleGeometry args={[0.075, 0.72, 4, 10]} /></mesh>
        <mesh material={shoe} position={[0, -0.88, -0.05]} castShadow><boxGeometry args={[0.12, 0.08, 0.27]} /></mesh>
      </group>
      {/* torso */}
      <mesh material={jeans} position={[0, 0.98, 0]} castShadow><capsuleGeometry args={[0.16, 0.08, 4, 12]} /></mesh>
      <mesh material={shirt} position={[0, 1.24, 0]} castShadow scale={[1, 1, 0.72]}><capsuleGeometry args={[0.19, 0.34, 6, 14]} /></mesh>
      {/* arms (pivot at shoulder) */}
      <group ref={armL} position={[-0.25, 1.45, 0]}>
        <mesh material={shirt} position={[0, -0.14, 0]} castShadow><capsuleGeometry args={[0.06, 0.22, 4, 8]} /></mesh>
        <mesh material={skin} position={[0, -0.42, 0]} castShadow><capsuleGeometry args={[0.048, 0.3, 4, 8]} /></mesh>
      </group>
      <group ref={armR} position={[0.25, 1.45, 0]}>
        <mesh material={shirt} position={[0, -0.14, 0]} castShadow><capsuleGeometry args={[0.06, 0.22, 4, 8]} /></mesh>
        <mesh material={skin} position={[0, -0.42, 0]} castShadow><capsuleGeometry args={[0.048, 0.3, 4, 8]} /></mesh>
      </group>
      {/* head */}
      <mesh material={skin} position={[0, 1.56, 0]} castShadow><capsuleGeometry args={[0.04, 0.06, 4, 8]} /></mesh>
      <mesh material={skin} position={[0, 1.7, 0]} castShadow scale={[0.9, 1.05, 1]}><sphereGeometry args={[0.115, 20, 16]} /></mesh>
      <mesh material={hair} position={[0, 1.75, 0.015]} castShadow scale={[0.95, 0.75, 1.02]}><sphereGeometry args={[0.12, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
    </group>
  );
}
