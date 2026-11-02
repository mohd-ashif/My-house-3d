'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { peers, useMultiplayer } from '@/lib/multiplayer';
import { sampleTrack, type Pose } from '@/lib/interp';
import { newEmoteAnim, stepEmote, STILL } from '@/lib/emotes';
import { Avatar, useLimbs, poseLimbs } from './Avatar';
import { HeadReactions } from './Reactions';

const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// speeds (m/s) as the local player moves: walking 1.9, running 4.2
const IDLE_BELOW = 0.2, RUN_FROM = 2.6, RUN_FULL = 3.8;

/** Everyone else in the house, walking where they walk, with their name over their head. */
export default function RemotePlayers() {
  const { peers: list } = useMultiplayer();
  return <>{list.map((p) => <RemoteAvatar key={p.id} id={p.id} />)}</>;
}

function RemoteAvatar({ id }: { id: string }) {
  const peer = peers.get(id);
  const body = useRef<THREE.Group>(null);
  const limbs = useLimbs();
  const pose = useRef<Pose>({ x: 0, f: 0, z: 0, y: 0, s: 0 });
  const anim = useRef({ phase: Math.random() * 6, stride: 0, run: 0, idle: Math.random() * 6 });
  const emote = useRef(newEmoteAnim());
  const shirt = useMemo(() => new THREE.MeshStandardMaterial({ color: peer?.color ?? '#888888', roughness: 0.9 }), [peer?.color]);
  useEffect(() => () => shirt.dispose(), [shirt]);
  useEffect(() => { if (body.current) body.current.rotation.order = 'YXZ'; }, []); // lean forward in the body's own frame

  useFrame((_, rawDt) => {
    const p = peers.get(id);
    const g = body.current;
    if (!p || !g) return;
    const dt = Math.min(rawDt, 0.05);
    const c = pose.current;
    // ~100 ms behind, blended between buffered updates (lib/interp.ts); before the first one, where they joined
    if (!sampleTrack(p.track, performance.now(), c)) { c.x = p.x; c.f = p.f; c.z = p.z; c.y = p.y; c.s = p.s; }

    // idle / walk / run from their speed, eased so a change of pace never pops
    const a = anim.current;
    const moving = c.s > IDLE_BELOW;
    a.stride += ((moving ? Math.min(1, c.s / 1.9) : 0) - a.stride) * ease(8, dt);
    a.run += (clamp01((c.s - RUN_FROM) / (RUN_FULL - RUN_FROM)) - a.run) * ease(6, dt);
    a.phase += dt * (2 + c.s * 2.4); // the local player's cadence (Player.tsx)
    a.idle += dt;
    const swing = Math.sin(a.phase) * (0.55 + 0.35 * a.run) * a.stride;
    const breathe = (1 - a.stride) * Math.sin(a.idle * 1.7) * 0.05; // arms drift a little while standing
    // an emote over the top, started in step with their (delayed) walking; seeing them walk off ends it
    const w = stepEmote(emote.current, id, performance.now(), dt, c.s > STILL);
    const ep = emote.current.pose;
    poseLimbs(limbs, swing + breathe, ep, w);
    const bob = Math.abs(Math.sin(a.phase)) * (0.03 + 0.03 * a.run) * a.stride;
    g.position.set(c.x, c.f + bob - ep.drop * w, c.z);
    g.rotation.set(-0.14 * a.run, c.y + ep.yaw * w, 0);
  });

  if (!peer) return null;
  return (
    // no shadow casting: shadow maps are frozen between redraws, a moving shadow would smear
    <Avatar ref={body} limbs={limbs} shirt={shirt} shadows={false}>
      <Html position={[0, 2.12, 0]} center distanceFactor={9} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="nametag" style={{ borderColor: peer.color }}>{peer.name}</div>
      </Html>
      <HeadReactions id={id} />
    </Avatar>
  );
}
