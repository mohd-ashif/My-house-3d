// Tiny generated sounds (no audio files): footsteps and a door creak. Starts muted.
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
export const sound = { enabled: false };

function audio(): AudioContext | null {
  if (!sound.enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Call from a user gesture (the sound toggle) so iOS lets audio start. */
export function setSound(on: boolean) {
  sound.enabled = on;
  if (on) audio();
}

export function footstep(volume = 0.25) {
  const a = audio();
  if (!a || !noise) return;
  const src = a.createBufferSource(); src.buffer = noise; src.playbackRate.value = 0.7 + Math.random() * 0.3;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650 + Math.random() * 250;
  const g = a.createGain(); g.gain.value = volume;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

export function doorCreak() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(320, t + 0.35); o.frequency.exponentialRampToValueAtTime(240, t + 0.6);
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
  o.connect(f).connect(g).connect(a.destination);
  o.start(t); o.stop(t + 0.7);
}

export function uiClick() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(); o.frequency.value = 1400;
  const g = a.createGain(); g.gain.setValueAtTime(0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.06);
}
