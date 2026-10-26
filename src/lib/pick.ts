// Lets the DOM touch layer raycast into the 3D scene (tap-to-walk) without living inside <Canvas>.
import * as THREE from 'three';

export const sceneRefs: { camera: THREE.Camera | null; pickables: THREE.Object3D | null; size: { w: number; h: number } } = {
  camera: null, pickables: null, size: { w: 1, h: 1 },
};

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const nrm = new THREE.Vector3();

/** First floor-like hit under a screen point: { x, y, z } or null. Walls give the floor point at their foot. */
export function pickFloor(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number; z: number; wall: boolean } | null {
  const { camera, pickables } = sceneRefs;
  if (!camera || !pickables) return null;
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  ray.far = 60;
  const hits = ray.intersectObject(pickables, true);
  for (const h of hits) {
    const m = h.object as THREE.Mesh;
    const mat = m.material as THREE.Material & { transparent?: boolean };
    if (mat?.transparent) continue; // glass, railings
    if (!h.face) continue;
    nrm.copy(h.face.normal).transformDirection(m.matrixWorld);
    if (nrm.y > 0.6) return { x: h.point.x, y: h.point.y, z: h.point.z, wall: false };
    // a wall or furniture side: aim at the floor just in front of it
    return { x: h.point.x + nrm.x * 0.35, y: h.point.y, z: h.point.z + nrm.z * 0.35, wall: true };
  }
  return null;
}
