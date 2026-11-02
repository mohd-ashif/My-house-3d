'use client';
import { Html } from '@react-three/drei';
import { useFloaters, REACTION_EMOJI, type Floater } from '@/lib/emotes';

/** Emoji drifting up from a spot and fading (CSS animation, FLOAT_MS long). Shared by the 3D tags and the first-person overlay. */
export function FloaterStack({ list }: { list: Floater[] }) {
  return (
    <div className="reactions" aria-hidden="true">
      {list.map((f) => (
        // consecutive reactions drift up side by side instead of on top of each other
        <span key={f.key} className="react-float" style={{ left: `${((f.key % 5) - 2) * 14}px` }}>{REACTION_EMOJI[f.r]}</span>
      ))}
    </div>
  );
}

/** Reactions over an avatar's head; put it inside the avatar's group. Nothing in the DOM while there are none. */
export function HeadReactions({ id }: { id: string }) {
  const list = useFloaters(id);
  if (!list.length) return null;
  return (
    <Html position={[0, 2.4, 0]} center distanceFactor={9} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
      <FloaterStack list={list} />
    </Html>
  );
}
