// Small cross-cutting signals between the 3D scene and the UI (no React re-renders).
export const renderFlags = {
  /** Shadow maps are frozen; set this to redraw them once (sun moved, a door swung, ...). */
  shadowDirty: true,
};

type Fn = () => void;
const doorListeners = new Set<Fn>();
export const doorEvents = {
  on(fn: Fn) { doorListeners.add(fn); return () => { doorListeners.delete(fn); }; },
  emit() { doorListeners.forEach((f) => f()); },
};
