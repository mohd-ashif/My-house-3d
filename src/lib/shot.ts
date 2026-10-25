// Fixed-camera "dollhouse" views for screenshots and presentations, read from the URL:
//   ?view=x,y,z,tx,ty,tz   camera position and the point it looks at (metres, plan coordinates)
//   &cut=6.2               clip everything above this height (roofs, upper walls) for a cutaway look
// With a view set, the intro and HUD are hidden and the camera stays put.
export interface Shot { pos: [number, number, number]; target: [number, number, number]; cut: number | null }

function read(): Shot | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const v = q.get('view')?.split(',').map(Number);
  if (!v || v.length !== 6 || v.some((n) => Number.isNaN(n))) return null;
  const cut = q.get('cut');
  return { pos: [v[0], v[1], v[2]], target: [v[3], v[4], v[5]], cut: cut != null && !Number.isNaN(Number(cut)) ? Number(cut) : null };
}

export const shot = read();
