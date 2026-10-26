// Mutable, module-level state shared between the 3D scene and the DOM overlay.
// (Kept outside React state so 60fps updates never re-render the UI.)
export const player = {
  x: 0,
  z: 0,
  feet: 0,
  eye: 1.6,       // smoothed eye height (absolute)
  vy: 0,
  yaw: 0,         // 0 = looking towards -z (up the drawing)
  pitch: -0.05,
  bodyYaw: 0,
  speed: 0,       // current horizontal speed (for walk animation)
  joy: { x: 0, y: 0 }, // touch joystick, -1..1 (analog: a small push walks slowly)
  run: false,     // touch: joystick held at the edge for a second
  camZoom: 3.2,   // 3rd-person boom length; pinch changes it (1.2 - 4 m)
  headBob: false, // first-person head bob while walking
  /** Walk automatically along these points (tap-to-walk, guided tour). Cleared by any manual input. */
  auto: null as null | { path: [number, number][]; i: number; speed: number; stuck: number; onDone?: (ok: boolean) => void },
  /** Ease the camera to look at this point (guided-tour framing). */
  lookAt: null as null | [number, number, number],
  /** Tap-to-walk ring marker. */
  marker: null as null | { x: number; y: number; z: number; t: number },
};

export const keys = new Set<string>();

/** Design switch while outside: the camera holds the style's hero shot for `remaining` seconds of
 *  frame time (clamped per frame, so a shader-compile hitch can't use it up), then flies back. */
export const cinematic = { remaining: 0 };

/** Touch look: pending drag deltas, smoothed + given a little inertia by the Player each frame. */
export const touchLook = { pendX: 0, pendY: 0, vx: 0, vy: 0, active: false };

export function teleport(x: number, z: number, feet: number, yaw?: number) {
  player.x = x;
  player.z = z;
  player.feet = feet;
  player.eye = feet + 1.6;
  player.vy = 0;
  player.auto = null;
  if (yaw !== undefined) { player.yaw = yaw; player.bodyYaw = yaw; }
}

export function look(dx: number, dy: number, sensitivity = 0.0024) {
  player.yaw -= dx * sensitivity;
  player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - dy * sensitivity));
}

/** Cancel tap-to-walk / tour walking (manual input wins). */
export function stopAuto() {
  const a = player.auto;
  if (!a) return;
  player.auto = null;
  a.onDone?.(false);
}
