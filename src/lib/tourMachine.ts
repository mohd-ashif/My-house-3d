// The guided tour as a pure state machine: (state, event) -> state. No timers, no walking, no camera.
// useTour (components/useTour.ts) performs the side effects and, when it owns the clock, sends the timed
// events itself; anything else (a host over the network, a test) can drive the same machine instead.

export type TourPhase = 'walking' | 'framing' | 'caption' | 'done';
export interface TourState {
  active: boolean;
  /** The stop being walked to / shown. */
  index: number;
  phase: TourPhase;
  paused: boolean;
  /** Bumped whenever the character should (re)start walking to `index`: start, next, resume mid-walk. */
  leg: number;
}

export type TourEvent =
  | { type: 'start' }
  | { type: 'arrived'; index: number } // reached the stop (or hopped there)
  | { type: 'framed'; index: number }  // the camera has settled on the stop: show its caption
  | { type: 'next' }                   // caption time is up, or the Next button
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'exit' };

export const TOUR_IDLE: TourState = { active: false, index: 0, phase: 'walking', paused: false, leg: 0 };

/** Seconds the camera takes to frame a stop before its caption shows. */
export const FRAMING_SECONDS = 1.1;

export function tourReduce(s: TourState, e: TourEvent, count: number): TourState {
  switch (e.type) {
    case 'start':
      return { active: true, index: 0, phase: 'walking', paused: false, leg: s.leg + 1 };
    case 'exit':
      return s.active ? { ...TOUR_IDLE, leg: s.leg } : s;
    case 'arrived':
      return s.active && !s.paused && s.phase === 'walking' && s.index === e.index ? { ...s, phase: 'framing' } : s;
    case 'framed':
      return s.active && !s.paused && s.phase === 'framing' && s.index === e.index ? { ...s, phase: 'caption' } : s;
    case 'next': {
      if (!s.active || s.phase === 'done') return s;
      const index = s.index + 1;
      if (index >= count) return { ...s, phase: 'done', paused: false };
      return { ...s, index, phase: 'walking', paused: false, leg: s.leg + 1 };
    }
    case 'pause':
      return s.active && !s.paused && s.phase !== 'done' ? { ...s, paused: true } : s;
    case 'resume':
      if (!s.active || !s.paused) return s;
      // mid-walk: walk on; mid-framing: straight to the caption
      return s.phase === 'walking' ? { ...s, paused: false, leg: s.leg + 1 } : { ...s, paused: false, phase: s.phase === 'framing' ? 'caption' : s.phase };
  }
}
