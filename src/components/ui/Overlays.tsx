'use client';
import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { Finger, HouseSilhouette, IconNext, IconPause, IconPlay, IconClose, IconWalk, IconRestart } from './icons';
import type { TourPhase } from '../useTour';
import type { StyleDef } from '@/lib/types';
import { DesignCards } from './Design';

export function NoWebGL() {
  return (
    <div className="fatal" role="alert">
      <h1>Your browser can&apos;t show 3D</h1>
      <p>This walkthrough needs WebGL. Try an up-to-date Chrome, Edge, Safari or Firefox, and check that hardware acceleration is turned on.</p>
    </div>
  );
}

export function ContextLost() {
  return (
    <button className="fatal lost" onClick={() => window.location.reload()} aria-label="The 3D view stopped. Tap to reload it">
      <h1>The 3D view stopped</h1>
      <p>Your phone needed the graphics memory back.</p>
      <span className="btn primary">Tap to reload 3D</span>
    </button>
  );
}

/** Loading screen: house silhouette + progress, fades once the first frames are drawn. */
export function Loader({ ready }: { ready: boolean }) {
  const { progress, active } = useProgress();
  const [gone, setGone] = useState(false);
  const [creep, setCreep] = useState(12);
  const done = ready && !active;
  useEffect(() => {
    if (done) { const t = setTimeout(() => setGone(true), 450); return () => clearTimeout(t); }
    // nothing is downloaded (all textures are generated), so creep while shaders compile
    const t = setInterval(() => setCreep((c) => Math.min(88, c + (90 - c) * 0.12)), 200);
    return () => clearInterval(t);
  }, [done]);
  if (gone) return null;
  const pct = done ? 100 : Math.max(creep, Math.min(90, progress * 0.9));
  return (
    <div className={`loader${done ? ' done' : ''}`} role="progressbar" aria-label="Loading the house" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <HouseSilhouette />
      <span>Building the house…</span>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

const STEPS = [
  { title: 'Drag left to walk', text: 'Put your left thumb anywhere on the left side. Push further to walk faster; hold at the edge to run.', anim: 'walk' },
  { title: 'Drag right to look', text: 'Drag on the right side to turn. Pinch to zoom the camera, double-tap to switch 1st / 3rd person.', anim: 'look' },
  { title: 'Tap the floor to go there', text: 'A quick tap on the floor walks you there by itself. The ☰ menu jumps to any room.', anim: 'tap' },
] as const;

/** First-visit, 3-step tutorial for touch devices. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  return (
    <div className="onboard" role="dialog" aria-label="How to move around">
      <div className={`onboard-stage ${s.anim}`} aria-hidden="true">
        <div className="zone-line" />
        <span className="finger"><Finger /></span>
        {s.anim === 'tap' && <span className="ripple" />}
      </div>
      <div className="onboard-card glass">
        <div className="dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        <div className="row">
          <button className="btn" onClick={onDone} aria-label="Skip the tutorial">Skip</button>
          <button className="btn primary" onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : onDone())} aria-label={i < STEPS.length - 1 ? 'Next tip' : 'Start exploring'}>
            {i < STEPS.length - 1 ? 'Next' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Guided-tour caption card + controls. */
export function TourCard(props: {
  title: string; size: string; text: string; index: number; count: number; phase: TourPhase; paused: boolean;
  onPause: () => void; onResume: () => void; onNext: () => void; onExit: () => void; onRestart: () => void;
}) {
  if (props.phase === 'done') {
    return (
      <div className="tour-card glass" role="status">
        <div className="tour-meta">Tour complete</div>
        <h2>Thanks for visiting</h2>
        <p>Walk around on your own, or take the tour again.</p>
        <div className="tour-ctrls">
          <button className="btn" onClick={props.onRestart} aria-label="Restart the guided tour"><IconRestart /> Restart</button>
          <button className="btn primary" onClick={props.onExit} aria-label="Explore freely"><IconWalk /> Explore freely</button>
        </div>
      </div>
    );
  }
  const walking = props.phase === 'walking';
  return (
    <div className={`tour-card glass${walking ? ' compact' : ''}`} role="status" aria-live="polite" key={`${props.index}-${walking}`}>
      <div className="tour-meta">Stop {props.index + 1} of {props.count}{walking && !props.paused ? ' · walking…' : props.paused ? ' · paused' : ''}</div>
      <h2>{props.title}</h2>
      {!walking && (
        <>
          {props.size && <div className="tour-size">{props.size}</div>}
          <p>{props.text}</p>
        </>
      )}
      <div className="tour-ctrls">
        <button className="icon-btn glass" onClick={props.paused ? props.onResume : props.onPause} aria-label={props.paused ? 'Resume the tour' : 'Pause the tour'}>
          {props.paused ? <IconPlay /> : <IconPause />}
        </button>
        <button className="btn primary" onClick={props.onNext} aria-label="Next stop">Next <IconNext /></button>
        <button className="icon-btn glass" onClick={props.onExit} aria-label="Exit the tour"><IconClose /></button>
      </div>
    </div>
  );
}

export function Intro({ name, ready, mobile, onTour, onFree, styles, styleId, thumbs, onStyle, playerName, onPlayerName }: {
  name: string; ready: boolean; mobile: boolean; onTour: () => void; onFree: () => void;
  styles: StyleDef[]; styleId: string; thumbs: Record<string, string>; onStyle: (id: string) => void;
  playerName: string; onPlayerName: (n: string) => void;
}) {
  return (
    <div className={`intro${mobile ? ' m' : ''}`}>
      <h1>{name}</h1>
      <div className="choose">
        <span className="choose-label">Choose elevation</span>
        <DesignCards styles={styles} active={styleId} thumbs={thumbs} onPick={onStyle} variant="row" />
      </div>
      <p>Walk through every room in 3D. Ground floor, first floor, the stairs, the courtyard: everything is built from the architect&apos;s plan.</p>
      <label className="name-field">
        <span>Your name</span>
        <input value={playerName} maxLength={20} placeholder="So others can see who you are" autoComplete="nickname" enterKeyHint="go"
          onChange={(e) => onPlayerName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ready) { (e.target as HTMLInputElement).blur(); onFree(); } }} />
      </label>
      <div className="intro-btns">
        {mobile ? (
          <>
            <button className="btn primary" onClick={onTour} disabled={!ready} aria-label="Start the guided tour">{ready ? 'Start guided tour' : 'Loading…'}</button>
            <button className="btn" onClick={onFree} disabled={!ready} aria-label="Explore freely">Explore freely</button>
          </>
        ) : (
          <>
            <button className="btn primary" onClick={onFree} disabled={!ready}>{ready ? 'Enter the house' : 'Loading…'}</button>
            <button className="btn" onClick={onTour} disabled={!ready} aria-label="Start the guided tour">Guided tour</button>
          </>
        )}
      </div>
    </div>
  );
}
