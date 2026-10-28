'use client';
import { useEffect, useState } from 'react';
import type { StyleDef } from '@/lib/types';

/** Exterior-design cards: thumbnail (or a colour swatch until it is rendered), name, one line. */
export function DesignCards({ styles, active, thumbs, onPick, variant = 'grid' }: {
  styles: StyleDef[]; active: string; thumbs: Record<string, string>; onPick: (id: string) => void; variant?: 'grid' | 'row';
}) {
  return (
    <div className={`design-cards ${variant}`} role="radiogroup" aria-label="Exterior design">
      {styles.map((s) => (
        <button key={s.id} className={`design-card${s.id === active ? ' on' : ''}`} role="radio" aria-checked={s.id === active}
          aria-label={`${s.name}, ${s.subtitle}: ${s.description}`} onClick={() => onPick(s.id)}>
          <span className="thumb" style={thumbs[s.id] ? undefined : { background: `linear-gradient(135deg, ${s.swatch.join(', ')})` }}>
            {thumbs[s.id] && <img src={thumbs[s.id]} alt="" width={320} height={180} />}
          </span>
          <span className="d-name">{s.name}</span>
          <span className="d-sub">{s.subtitle}</span>
          {variant === 'grid' && <span className="d-desc">{s.description}</span>}
        </button>
      ))}
    </div>
  );
}

/** Desktop: dropdown panel under the HUD's Design button. */
export function DesignPanel(props: { styles: StyleDef[]; active: string; thumbs: Record<string, string>; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <div className="design-panel" role="dialog" aria-label="Exterior design">
      <div className="dp-head"><b>Exterior design</b><span>V cycles designs</span>
        <button className="icon-btn" onClick={props.onClose} aria-label="Close the design panel">×</button></div>
      <DesignCards styles={props.styles} active={props.active} thumbs={props.thumbs} onPick={props.onPick} />
    </div>
  );
}

export function Toast({ text, stamp }: { text: string; stamp: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!stamp) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2200);
    return () => clearTimeout(t);
  }, [stamp]);
  return show ? <div className="toast" role="status" aria-live="polite" key={stamp}>{text}</div> : null;
}
