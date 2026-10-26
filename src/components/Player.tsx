'use client';
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { World } from '@/lib/world';
import { player, keys, touchLook, look, stopAuto, cinematic } from '@/lib/player';
import { groundHeight, resolve, pointBlocked, roomAt } from '@/lib/physics';
import { shot } from '@/lib/shot';
import { sceneRefs } from '@/lib/pick';
import { footstep } from '@/lib/sound';

export type ViewMode = 'third' | 'first';
export interface HudInfo { room: string; floor: number }

const skin = new THREE.MeshStandardMaterial({ color: '#b27b57', roughness: 0.6 });
const shirt = new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.9 });
const jeans = new THREE.MeshStandardMaterial({ color: '#2f3d55', roughness: 0.9 });
const shoe = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.6 });
const hair = new THREE.MeshStandardMaterial({ color: '#16110d', roughness: 0.8 });

const tmp = new THREE.Vector3();
const head = new THREE.Vector3();
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export default function Player({ world, entered, view, mobile, hero, onHud }: {
  world: World; entered: boolean; view: ViewMode; mobile: boolean; onHud: (h: HudInfo) => void;
  hero?: { pos: [number, number, number]; target: [number, number, number] }; // the active design's hero shot
}) {
  const { camera, size } = useThree();
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const hudT = useRef(0);
  const camDist = useRef(3.2);
  const camHead = useRef(new THREE.Vector3());
  const lastHud = useRef('');
  const autoProgress = useRef({ t: 0, d: Infinity });
  const shoulder = useRef(0); // over-the-shoulder offset used while the tour frames a room
  const introPos = useRef<THREE.Vector3 | null>(null);
  const introTgt = useRef(new THREE.Vector3());
  const fly = useRef(0); // 0 = normal camera, 1 = at the hero shot

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    sceneRefs.camera = camera;
    sceneRefs.size = { w: size.width, h: size.height };

    // touch devices: wider lens in portrait so rooms feel less cramped
    const persp = camera as THREE.PerspectiveCamera;
    const portrait = size.height > size.width;
    const fov = mobile ? (portrait ? 75 : 65) : 62;
    if (persp.isPerspectiveCamera && Math.abs(persp.fov - fov) > 0.01) { persp.fov = fov; persp.updateProjectionMatrix(); }

    if (shot) {
      camera.position.set(...shot.pos);
      camera.lookAt(...shot.target);
      if (body.current) body.current.visible = false;
      return;
    }
    if (!entered) {
      const t = state.clock.elapsedTime;
      if (hero) {
        // the chosen design's hero shot, drifting gently; a new design glides the camera across
        const want = new THREE.Vector3(hero.pos[0] + Math.sin(t * 0.15) * 0.9, hero.pos[1] + Math.sin(t * 0.11) * 0.15, hero.pos[2]);
        if (!introPos.current) { introPos.current = want.clone(); introTgt.current.set(...hero.target); }
        introPos.current.lerp(want, ease(1.8, dt));
        introTgt.current.lerp(tmp.set(...hero.target), ease(1.8, dt));
        camera.position.copy(introPos.current);
        camera.lookAt(introTgt.current);
      } else {
        const R = world.radius * 1.9 + 6, a = t * 0.07;
        camera.position.set(world.center[0] + Math.sin(a) * R, R * 0.5, world.center[1] + Math.cos(a) * R);
        camera.lookAt(world.center[0], 2.5, world.center[1]);
      }
      if (body.current) body.current.visible = false;
      camHead.current.set(player.x, player.eye, player.z);
      return;
    }

    // ---------- touch look: smoothing + a little inertia after the finger lifts ----------
    {
      const k = ease(18, dt);
      let ax = touchLook.pendX * k, ay = touchLook.pendY * k;
      touchLook.pendX -= ax; touchLook.pendY -= ay;
      if (touchLook.active) { touchLook.vx = ax / dt; touchLook.vy = ay / dt; }
      else {
        ax += touchLook.vx * dt; ay += touchLook.vy * dt;
        const decay = Math.exp(-dt * 7);
        touchLook.vx *= decay; touchLook.vy *= decay;
      }
      if (ax || ay) look(ax, ay);
    }

    // ---------- input ----------
    const k = (c: string) => keys.has(c);
    let fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) - player.joy.y;
    let str = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0) + player.joy.x;
    const turn = (k('ArrowLeft') ? 1 : 0) - (k('ArrowRight') ? 1 : 0);
    player.yaw += turn * dt * 1.8;
    if (Math.hypot(fwd, str) > 0.08 || turn) stopAuto(); // manual input always wins over auto-walk
    const len = Math.hypot(fwd, str);
    if (len > 1) { fwd /= len; str /= len; }
    const run = k('ShiftLeft') || k('ShiftRight') || player.run;
    let speed = (run ? 4.2 : 1.9) * Math.min(1, Math.hypot(fwd, str)); // analog: a small push walks slowly

    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    let mx = (fx * fwd + rx * str), mz = (fz * fwd + rz * str);

    // ---------- auto-walk (tap-to-walk, guided tour) ----------
    const auto = player.auto;
    if (auto) {
      let tgt = auto.path[auto.i];
      while (tgt && Math.hypot(tgt[0] - player.x, tgt[1] - player.z) < 0.18) { auto.i++; tgt = auto.path[auto.i]; autoProgress.current = { t: 0, d: Infinity }; }
      if (!tgt) { player.auto = null; auto.onDone?.(true); }
      else {
        mx = tgt[0] - player.x; mz = tgt[1] - player.z;
        const left = Math.hypot(mx, mz);
        speed = auto.speed * (auto.i === auto.path.length - 1 ? Math.min(1, 0.35 + left) : 1); // ease into the stop
        // the follow camera swings round behind the walking direction
        if (!player.lookAt) player.yaw += wrap(Math.atan2(-mx, -mz) - player.yaw) * ease(2.5, dt);
        player.pitch += (-0.08 - player.pitch) * ease(2, dt);
        // stuck: no real progress for a second -> give up
        const pr = autoProgress.current;
        if (left < pr.d - 0.05) { pr.d = left; pr.t = 0; } else if ((pr.t += dt) > 1.2) { autoProgress.current = { t: 0, d: Infinity }; stopAuto(); }
      }
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1e-4 && speed > 0) { mx = (mx / ml) * speed * dt; mz = (mz / ml) * speed * dt; } else { mx = 0; mz = 0; }

    // ---------- tour framing: ease the view onto a point ----------
    if (player.lookAt) {
      const [tx, ty, tz] = player.lookAt;
      const dx = tx - player.x, dz = tz - player.z;
      player.yaw += wrap(Math.atan2(-dx, -dz) - player.yaw) * ease(3, dt);
      // 3rd person tilts up less: a steep look-up would put the camera right behind the head
      const want = Math.max(-0.6, Math.min(view === 'third' ? 0.22 : 0.7, Math.atan2(ty - player.eye, Math.hypot(dx, dz))));
      player.pitch += (want - player.pitch) * ease(3, dt);
    }

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
    player.eye += (player.feet + 1.62 - player.eye) * ease(14, dt); // smooth stair climbing

    // ---------- character ----------
    if (ml > 1e-4) {
      const target = Math.atan2(-mx, -mz);
      player.bodyYaw += wrap(target - player.bodyYaw) * Math.min(1, dt * 10);
    }
    const walkAmt = Math.min(1, player.speed / 2);
    const prevPhase = phase.current;
    phase.current += dt * (2 + player.speed * 2.4);
    if (walkAmt > 0.3 && Math.floor(phase.current / Math.PI) !== Math.floor(prevPhase / Math.PI)) footstep(0.12 + 0.12 * walkAmt);
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
      const bob = player.headBob ? Math.sin(phase.current * 2) * 0.025 * walkAmt : 0;
      camera.position.set(x, player.eye + bob, z);
      camera.quaternion.setFromEuler(e);
      camHead.current.set(x, player.eye, z);
    } else {
      // spring-damped follow of the head, so starts, stops and stairs feel soft
      const lift = mobile && portrait ? 0.2 : 0;
      head.set(x, player.eye + 0.05 + lift, z);
      const ch = camHead.current;
      if (ch.distanceTo(head) > 3) ch.copy(head); // teleports snap
      else ch.lerp(head, ease(12, dt));
      const pitch = Math.max(-0.9, Math.min(0.75, player.pitch));
      const up = 0.18 + (mobile && portrait ? 0.08 : 0);
      const dir = tmp.set(Math.sin(player.yaw) * Math.cos(pitch), -Math.sin(pitch) + up, Math.cos(player.yaw) * Math.cos(pitch)).normalize();
      // shorten the boom when a wall or ceiling is in the way
      const maxD = Math.max(1.2, Math.min(4, player.camZoom));
      let d = 0.35;
      while (d < maxD && !pointBlocked(world, ch.x + dir.x * d, ch.y + dir.y * d, ch.z + dir.z * d)) d += 0.1;
      const want = Math.max(0.35, Math.min(maxD, d - 0.2));
      camDist.current += (want - camDist.current) * ease(want < camDist.current ? 22 : 4, dt);
      // tour framing: slide over the right shoulder so the room, not the back of the head, fills the view
      shoulder.current += ((player.lookAt ? 0.6 : 0) - shoulder.current) * ease(3, dt);
      let sx = Math.cos(player.yaw) * shoulder.current, sz = -Math.sin(player.yaw) * shoulder.current;
      if (shoulder.current > 0.01 && pointBlocked(world, ch.x + sx + dir.x * camDist.current, ch.y + dir.y * camDist.current, ch.z + sz + dir.z * camDist.current)) { sx = 0; sz = 0; }
      camera.position.set(ch.x + sx + dir.x * camDist.current, ch.y + dir.y * camDist.current, ch.z + sz + dir.z * camDist.current);
      camera.lookAt(ch.x + sx * 0.7, ch.y - 0.1, ch.z + sz * 0.7);
      if (body.current) body.current.visible = camDist.current > 0.7;
    }

    // ---------- design switch outside: blend out to the hero shot and back ----------
    const flying = cinematic.remaining > 0;
    cinematic.remaining = Math.max(0, cinematic.remaining - dt); // dt is clamped to 50 ms above
    fly.current += ((flying ? 1 : 0) - fly.current) * ease(2.4, dt);
    if (fly.current > 0.002 && hero) {
      const b = fly.current * fly.current * (3 - 2 * fly.current);
      const nPos = camera.position.clone(), dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const nTgt = nPos.clone().addScaledVector(dir, 6);
      camera.position.lerpVectors(nPos, tmp.set(...hero.pos), b);
      camera.lookAt(nTgt.lerp(new THREE.Vector3(...hero.target), b));
      if (body.current && view === 'third') body.current.visible = true;
    }
    introPos.current = null; // the next intro starts from wherever the camera is

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
