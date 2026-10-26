'use client';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Renders its (static) children once, then replaces them with one merged mesh per material,
 * cutting hundreds of draw calls to a handful. Children must not animate.
 */
export default function MergeStatic({ children, castShadow = false, receiveShadow = false }: {
  children: ReactNode; castShadow?: boolean; receiveShadow?: boolean;
}) {
  const src = useRef<THREE.Group>(null);
  const [merged, setMerged] = useState<THREE.Mesh[] | null>(null);

  useLayoutEffect(() => {
    const root = src.current;
    if (!root || merged) return;
    root.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
      const key = `${m.material.uuid}|${m.castShadow}`;
      let e = groups.get(key);
      if (!e) { e = { mat: m.material, cast: m.castShadow, geos: [] }; groups.set(key, e); }
      e.geos.push(g);
    });
    const out: THREE.Mesh[] = [];
    groups.forEach((e) => {
      const geo = mergeGeometries(e.geos, false);
      e.geos.forEach((g) => g.dispose());
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, e.mat);
      mesh.userData.cast = e.cast;
      mesh.castShadow = castShadow && e.cast;
      mesh.receiveShadow = receiveShadow;
      out.push(mesh);
    });
    setMerged(out);
  }, [merged, castShadow, receiveShadow]);

  useLayoutEffect(() => {
    merged?.forEach((m) => { m.castShadow = castShadow && !!m.userData.cast; m.receiveShadow = receiveShadow; });
  }, [merged, castShadow, receiveShadow]);

  useLayoutEffect(() => () => { merged?.forEach((m) => m.geometry.dispose()); }, [merged]);

  if (merged) return <group>{merged.map((m) => <primitive key={m.uuid} object={m} />)}</group>;
  return <group ref={src}>{children}</group>;
}
