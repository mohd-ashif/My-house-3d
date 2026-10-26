// Device capabilities for the mobile experience. Everything feature-detects and fails silently.
export type Tier = 'low' | 'mid' | 'high';

const w = () => (typeof window === 'undefined' ? null : window);

/** Primary input is a finger (phones, tablets). Touch-screen laptops keep the desktop UI. */
export function isCoarsePointer(): boolean {
  const win = w();
  return !!win && !!win.matchMedia && win.matchMedia('(pointer: coarse)').matches;
}

function gpuRenderer(): string {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return s;
  } catch { return ''; }
}

/** Rough GPU/CPU tier from cores, memory, the GPU name and the screen. */
export function detectTier(): Tier {
  const win = w();
  if (!win) return 'high';
  const q = new URLSearchParams(win.location.search).get('tier');
  if (q === 'low' || q === 'mid' || q === 'high') return q;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const gpu = gpuRenderer().toLowerCase();
  const mobile = isCoarsePointer();
  const weakGpu = /swiftshader|llvmpipe|software|mali-4|mali-t|adreno \(tm\) [2-5]\d\d|powervr|sgx|videocore/.test(gpu);
  if (!mobile) return weakGpu ? 'low' : 'high'; // desktops keep the full-quality renderer
  if (weakGpu || mem <= 3 || cores <= 4) return 'low';
  const big = Math.max(screen.width, screen.height) * (win.devicePixelRatio || 1);
  const strong = /apple gpu|adreno \(tm\) [67]\d\d|mali-g7\d|mali-g6\d\d|xclipse|immortalis/.test(gpu);
  return strong && mem >= 6 && big <= 2800 ? 'high' : 'mid';
}

// ---------- fullscreen + orientation ----------
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export function fullscreenAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}
export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}
export async function enterFullscreen(): Promise<void> {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
  } catch { /* not allowed here */ }
}
export async function exitFullscreen(): Promise<void> {
  const d = document as FsDoc;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } catch { /* ignore */ }
}
export async function lockLandscape(): Promise<void> {
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch { /* iPhone Safari and most browsers outside fullscreen */ }
}

// ---------- haptics ----------
export function haptic(ms = 10) {
  try { if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms); } catch { /* iOS */ }
}

// ---------- storage (private mode safe) ----------
export const storage = {
  get(k: string) { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
};
