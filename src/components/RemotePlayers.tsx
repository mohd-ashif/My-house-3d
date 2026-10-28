'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { peers, onMpChange, type Peer } from '@/lib/multiplayer';
import { Avatar, useLimbs, poseLimbs } from './Avatar';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Everyone else in the house, walking where they walk, with their name over their head. */
export default function RemotePlayers() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setIds([...peers.keys()]);
    sync();
    return onMpChange(sync);
  }, []);
  return <>{ids.map((id) => <RemoteAvatar key={id} id={id} />)}</>;
}

function RemoteAvatar({ id }: { id: string }) {
  const peer = peers.get(id) as Peer | undefined;
  const body = useRef<THREE.Group>(null);
  const limbs = useLimbs();
  const shown = useRef<{ x: number; f: number; z: number; y: number } | null>(null);
  const phase = useRef(Math.random() * 6);
  const shirt = useMemo(() => new THREE.MeshStandardMaterial({ color: peer?.color ?? '#888888', roughness: 0.9 }), [peer?.color]);
  useEffect(() => () => shirt.dispose(), [shirt]);

  useFrame((_, rawDt) => {
    const p = peers.get(id);
    const g = body.current;
    if (!p || !g) return;
    const dt = Math.min(rawDt, 0.05);
    // updates arrive 10x per second: glide towards the latest one, snap on teleports
    const s = shown.current;
    if (!s || Math.hypot(p.x - s.x, p.z - s.z) > 3 || Math.abs(p.f - s.f) > 2) shown.current = { x: p.x, f: p.f, z: p.z, y: p.y };
    else {
      const k = ease(12, dt);
      s.x += (p.x - s.x) * k; s.z += (p.z - s.z) * k; s.f += (p.f - s.f) * k;
      s.y += wrap(p.y - s.y) * ease(10, dt);
    }
    const c = shown.current!;
    const walkAmt = Math.min(1, p.s / 2);
    phase.current += dt * (2 + p.s * 2.4);
    poseLimbs(limbs, Math.sin(phase.current) * 0.55 * walkAmt);
    g.position.set(c.x, c.f + Math.abs(Math.sin(phase.current)) * 0.03 * walkAmt, c.z);
    g.rotation.y = c.y;
  });

  if (!peer) return null;
  return (
    // no shadow casting: shadow maps are frozen between redraws, a moving shadow would smear
    <Avatar ref={body} limbs={limbs} shirt={shirt} shadows={false}>
      <Html position={[0, 2.12, 0]} center distanceFactor={9} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="nametag" style={{ borderColor: peer.color }}>{peer.name}</div>
      </Html>
    </Avatar>
  );
}
