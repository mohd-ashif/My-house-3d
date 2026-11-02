'use client';
import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { Finger, HouseSilhouette, IconNext, IconPause, IconPlay, IconClose, IconWalk, IconRestart } from './icons';
import type { TourPhase } from '../useTour';
import type { StyleDef } from '@/lib/types';
import { DesignCards } from './Design';
import { roomId, CODE_LENGTH } from '@/lib/multiplayer';

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

/** A group tour, from where this visitor stands: guiding it (host) or being guided (follower). */
export interface TourGroup { role: 'host' | 'follower'; hostName: string; guests: number }

const groupNote = (g?: TourGroup) => (!g ? '' : g.role === 'host' ? ` · guiding ${g.guests}` : ` · guided by ${g.hostName}`);

/** Guided-tour caption card + controls. In a group tour only the host gets the controls; followers can leave the group. */
export function TourCard(props: {
  title: string; size: string; text: string; index: number; count: number; phase: TourPhase; paused: boolean; group?: TourGroup;
  onPause: () => void; onResume: () => void; onNext: () => void; onExit: () => void; onRestart: () => void; onLeave: () => void;
}) {
  const follower = props.group?.role === 'follower';
  if (props.phase === 'done') {
    return (
      <div className="tour-card glass" role="status">
        <div className="tour-meta">Tour complete{groupNote(props.group)}</div>
        <h2>Thanks for visiting</h2>
        <p>{follower ? 'Walk around on your own; you stay in the room.' : 'Walk around on your own, or take the tour again.'}</p>
        <div className="tour-ctrls">
          {follower ? (
            <button className="btn primary" onClick={props.onLeave} aria-label="Explore freely"><IconWalk /> Explore freely</button>
          ) : (
            <>
              <button className="btn" onClick={props.onRestart} aria-label={props.group ? 'Restart the tour for everyone' : 'Restart the guided tour'}><IconRestart /> Restart</button>
              <button className="btn primary" onClick={props.onExit} aria-label={props.group ? 'End the group tour' : 'Explore freely'}><IconWalk /> {props.group ? 'End tour' : 'Explore freely'}</button>
            </>
          )}
        </div>
      </div>
    );
  }
  const walking = props.phase === 'walking';
  return (
    <div className={`tour-card glass${walking ? ' compact' : ''}`} role="status" aria-live="polite" key={`${props.index}-${walking}`}>
      <div className="tour-meta">Stop {props.index + 1} of {props.count}{groupNote(props.group)}{walking && !props.paused ? ' · walking…' : props.paused ? ' · paused' : ''}</div>
      <h2>{props.title}</h2>
      {!walking && (
        <>
          {props.size && <div className="tour-size">{props.size}</div>}
          <p>{props.text}</p>
        </>
      )}
      <div className="tour-ctrls">
        {follower ? (
          <button className="btn" onClick={props.onLeave} aria-label="Leave the group and explore on your own"><IconWalk /> Leave group</button>
        ) : (
          <>
            <button className="icon-btn glass" onClick={props.paused ? props.onResume : props.onPause} aria-label={props.paused ? 'Resume the tour' : 'Pause the tour'}>
              {props.paused ? <IconPlay /> : <IconPause />}
            </button>
            <button className="btn primary" onClick={props.onNext} aria-label="Next stop">Next <IconNext /></button>
            <button className="icon-btn glass" onClick={props.onExit} aria-label={props.group ? 'End the group tour for everyone' : 'Exit the tour'}><IconClose /></button>
          </>
        )}
      </div>
    </div>
  );
}

/** Out of a group tour that is still going: where it is, and the way back in. */
export function AwayCard({ title, index, count, hostName, done, onRejoin }: {
  title: string; index: number; count: number; hostName: string; done: boolean; onRejoin: () => void;
}) {
  return (
    <div className="tour-card glass compact" role="status">
      <div className="tour-meta">Group tour · {done ? 'finished' : `stop ${index + 1} of ${count}`} · guided by {hostName}</div>
      <h2>{done ? 'The group has seen everything' : title}</h2>
      {!done && (
        <div className="tour-ctrls">
          <button className="btn primary" onClick={onRejoin} aria-label="Rejoin the group at its current stop"><IconRestart /> Rejoin group</button>
        </div>
      )}
    </div>
  );
}

/** Create a private room, or type (or follow a link with) a code to join one. */
function RoomButtons({ ready, joinCode, onJoinCode, onCreateRoom, onJoinRoom, onGroupTour }: {
  ready: boolean; joinCode: string; onJoinCode: (c: string) => void; onCreateRoom: () => void; onJoinRoom: () => void; onGroupTour: () => void;
}) {
  const ok = !!roomId(joinCode);
  return (
    <>
      <button className="btn" onClick={onCreateRoom} disabled={!ready} aria-label="Create a private room and get a code to share">Create room</button>
      <button className="btn" onClick={onGroupTour} disabled={!ready} aria-label="Create a private room and guide everyone who joins through the house">Start group tour</button>
      <form className="join-room" onSubmit={(e) => { e.preventDefault(); if (ready && ok) onJoinRoom(); }}>
        <input value={joinCode} maxLength={CODE_LENGTH} placeholder="CODE" aria-label="Room code" autoComplete="off" autoCapitalize="characters"
          spellCheck={false} enterKeyHint="go" onChange={(e) => onJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH))} />
        <button className="btn" type="submit" disabled={!ready || !ok}>Join room</button>
      </form>
    </>
  );
}

export function Intro({ name, ready, mobile, onTour, onFree, styles, styleId, thumbs, onStyle, playerName, onPlayerName, ...room }: {
  name: string; ready: boolean; mobile: boolean; onTour: () => void; onFree: () => void;
  styles: StyleDef[]; styleId: string; thumbs: Record<string, string>; onStyle: (id: string) => void;
  playerName: string; onPlayerName: (n: string) => void;
  joinCode: string; onJoinCode: (c: string) => void; onCreateRoom: () => void; onJoinRoom: () => void; onGroupTour: () => void;
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
        <RoomButtons ready={ready} {...room} />
      </div>
    </div>
  );
}
