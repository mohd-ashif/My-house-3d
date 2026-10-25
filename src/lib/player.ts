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
  joy: { x: 0, y: 0 }, // touch joystick, -1..1
};

export const keys = new Set<string>();

export function teleport(x: number, z: number, feet: number, yaw?: number) {
  player.x = x;
  player.z = z;
  player.feet = feet;
  player.eye = feet + 1.6;
  player.vy = 0;
  if (yaw !== undefined) { player.yaw = yaw; player.bodyYaw = yaw; }
}

export function look(dx: number, dy: number, sensitivity = 0.0024) {
  player.yaw -= dx * sensitivity;
  player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - dy * sensitivity));
}
