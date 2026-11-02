'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { EMOTES, REACTIONS, EMOTE_INFO, REACTION_EMOJI, SELF, useFloaters, type Emote, type Reaction } from '@/lib/emotes';
import { FloaterStack } from '../Reactions';
import { IconClose, IconSmile } from './icons';

interface Props { onEmote: (e: Emote) => void; onReact: (r: Reaction) => void }

/** Open/closed, closing on a tap anywhere else or Escape. */
function usePopup() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc); };
  }, [open]);
  return { open, setOpen, box };
}

/** Desktop key for item i of the ten (emotes 1-5, then reactions 6-0). */
const keyOf = (i: number) => String((i + 1) % 10);

/**
 * Mobile: a round button in the bottom-right corner that fans out the five emotes (inner arc)
 * and five reactions (outer arc) over the corner.
 */
export function EmoteWheel({ onEmote, onReact }: Props) {
  const { open, setOpen, box } = usePopup();
  // a quarter circle from straight up (90°) round to the left (180°)
  const at = (i: number, n: number, r: number) => {
    const a = ((90 + (90 * i) / (n - 1)) * Math.PI) / 180;
    return { '--x': `${Math.cos(a) * r}px`, '--y': `${-Math.sin(a) * r}px` } as CSSProperties;
  };
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className={`emote-wheel${open ? ' open' : ''}`} ref={box}>
      {open && EMOTES.map((e, i) => (
        <button key={e} className="emote-item" style={at(i, EMOTES.length, 118)} onClick={pick(() => onEmote(e))} aria-label={EMOTE_INFO[e].label}>
          {EMOTE_INFO[e].icon}
        </button>
      ))}
      {open && REACTIONS.map((r, i) => (
        <button key={r} className="emote-item reaction" style={at(i, REACTIONS.length, 182)} onClick={pick(() => onReact(r))} aria-label={`React ${REACTION_EMOJI[r]}`}>
          {REACTION_EMOJI[r]}
        </button>
      ))}
      <button className="icon-btn glass emote-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Close emotes' : 'Emotes and reactions'}>
        {open ? <IconClose /> : <IconSmile />}
      </button>
    </div>
  );
}

/** Desktop: a top-bar button with the ten actions and their keys (1-5 emotes, 6-0 reactions) underneath. */
export function EmoteMenu({ onEmote, onReact }: Props) {
  const { open, setOpen, box } = usePopup();
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="emote-menu" ref={box}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">😊 Emotes (1–0)</button>
      {open && (
        <div className="emote-panel glass" role="menu">
          <div className="emote-row">
            {EMOTES.map((e, i) => (
              <button key={e} role="menuitem" className="emote-item" onClick={pick(() => onEmote(e))} title={`${EMOTE_INFO[e].label} (${keyOf(i)})`}>
                {EMOTE_INFO[e].icon}<kbd>{keyOf(i)}</kbd>
              </button>
            ))}
          </div>
          <div className="emote-row">
            {REACTIONS.map((r, i) => (
              <button key={r} role="menuitem" className="emote-item reaction" onClick={pick(() => onReact(r))} title={`React ${REACTION_EMOJI[r]} (${keyOf(i + 5)})`}>
                {REACTION_EMOJI[r]}<kbd>{keyOf(i + 5)}</kbd>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** First person: your own reactions rise from the bottom of the screen (there is no head of yours in view). */
export function SelfReactions() {
  const list = useFloaters(SELF);
  if (!list.length) return null;
  return <div className="self-reactions"><FloaterStack list={list} /></div>;
}
