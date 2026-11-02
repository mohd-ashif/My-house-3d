'use client';
import { useEffect, useRef, useState } from 'react';
import { useMultiplayer, roomLink, PUBLIC_ROOM, type MpStatus } from '@/lib/multiplayer';

/** Re-renders when someone joins or leaves; returns everyone else's name + colour. */
export function usePeers() {
  const { status, peers: list } = useMultiplayer();
  return { status, list };
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* not a secure context (LAN testing): old way */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

/**
 * The private room's code with a button that hands out the link: the share sheet on phones, the clipboard elsewhere.
 * Nothing for the public room. `sheet` is the bigger layout for the mobile menu.
 */
export function RoomCode({ room, sheet = false }: { room: string; sheet?: boolean }) {
  const [said, setSaid] = useState('');
  useEffect(() => { if (!said) return; const t = setTimeout(() => setSaid(''), 1800); return () => clearTimeout(t); }, [said]);
  if (room === PUBLIC_ROOM) return null;
  const share = async () => {
    const url = roomLink(room);
    if (sheet && navigator.share) {
      try { await navigator.share({ title: 'Join me in the house', text: `Room ${room}`, url }); return; }
      catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
    setSaid((await copyText(url)) ? 'Link copied' : 'Copy failed');
  };
  const label = said || (sheet && typeof navigator.share === 'function' ? 'Share link' : 'Copy link');
  if (sheet) {
    return (
      <div className="room-share">
        <span className="room-share-code" aria-label={`Room code ${room.split('').join(' ')}`}>{room}</span>
        <button className="btn" onClick={share} aria-live="polite">{label}</button>
      </div>
    );
  }
  return (
    <button className="btn room-code" onClick={share} title="Copy a link that brings people into this room" aria-live="polite">
      Room <b>{room}</b> · {label}
    </button>
  );
}

const STATUS: Partial<Record<MpStatus, string>> = { connecting: 'Connecting…', offline: 'Offline · retrying', full: 'House is full' };

const Crown = () => <b className="crown" title="Host" aria-label="host">👑</b>;

/**
 * "3 here now" + the names, in a corner of the screen. Tap a name for Follow / Stop following, and for the host of a
 * private room, Make host. The host wears a crown (private rooms only: in the public room nobody leads anything).
 */
export function OnlinePanel({ selfName, max, followingId, onFollow, onUnfollow, onMakeHost }: {
  selfName: string; max: number; followingId: string | null; onFollow: (id: string) => void; onUnfollow: () => void;
  onMakeHost: (id: string) => void;
}) {
  const { status, peers: list, hostId, isHost, room } = useMultiplayer();
  const crowned = room !== PUBLIC_ROOM;
  const [menu, setMenu] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // the menu closes on a tap anywhere else, or Escape
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', esc); };
  }, [menu]);
  if (status === 'off') return null;
  const note = STATUS[status];
  // whoever we follow stays in view, first
  const sorted = followingId ? [...list].sort((a, b) => Number(b.id === followingId) - Number(a.id === followingId)) : list;
  const shown = all ? sorted : sorted.slice(0, max);
  const pick = (fn: () => void) => () => { setMenu(null); fn(); };
  return (
    <div className="online glass" ref={panel}>
      <div className="online-head" role="status" aria-live="polite">
        <i className={`online-dot${status === 'online' ? ' on' : ''}`} />
        {note ?? `${list.length + 1} here now`}
      </div>
      {status === 'online' && (
        <ul>
          <li><i style={{ background: '#ffcf5a' }} />{selfName} (you){crowned && isHost && <Crown />}</li>
          {shown.map((p) => (
            <li key={p.id} className="peer">
              <button className="online-name" onClick={() => setMenu((m) => (m === p.id ? null : p.id))} aria-haspopup="menu" aria-expanded={menu === p.id}>
                <i style={{ background: p.color }} /><span>{p.name}</span>{crowned && p.id === hostId && <Crown />}
                {p.id === followingId && <em>following</em>}
              </button>
              {menu === p.id && (
                <div className="online-menu" role="menu">
                  {p.id === followingId
                    ? <button role="menuitem" onClick={pick(onUnfollow)}>Stop following</button>
                    : <button role="menuitem" onClick={pick(() => onFollow(p.id))}>Follow</button>}
                  {crowned && isHost && <button role="menuitem" onClick={pick(() => onMakeHost(p.id))}>Make host</button>}
                </div>
              )}
            </li>
          ))}
          {list.length > max && (
            <li className="more"><button className="online-name" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer' : `+${list.length - max} more`}</button></li>
          )}
        </ul>
      )}
    </div>
  );
}

/** "Following Ashif · Stop", at the top of the screen. */
export function FollowPill({ name, onStop }: { name: string; onStop: () => void }) {
  return (
    <div className="follow-pill glass" role="status">
      <span>Following <b>{name}</b></span>
      <button onClick={onStop} aria-label={`Stop following ${name}`}>Stop</button>
    </div>
  );
}
