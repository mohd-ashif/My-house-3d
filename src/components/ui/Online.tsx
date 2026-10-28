'use client';
import { useEffect, useState } from 'react';
import { peers, mp, onMpChange, type MpStatus } from '@/lib/multiplayer';

/** Re-renders when someone joins or leaves; returns everyone else's name + colour. */
export function usePeers() {
  const [state, setState] = useState<{ status: MpStatus; list: { id: string; name: string; color: string }[] }>({ status: mp.status, list: [] });
  useEffect(() => {
    const sync = () => setState({ status: mp.status, list: [...peers.values()].map(({ id, name, color }) => ({ id, name, color })) });
    sync();
    return onMpChange(sync);
  }, []);
  return state;
}

const STATUS: Partial<Record<MpStatus, string>> = { connecting: 'Connecting…', offline: 'Offline · retrying', full: 'House is full' };

/** "3 here now" + the names, in a corner of the screen. */
export function OnlinePanel({ selfName, max }: { selfName: string; max: number }) {
  const { status, list } = usePeers();
  if (status === 'off') return null;
  const note = STATUS[status];
  const shown = list.slice(0, max);
  return (
    <div className="online glass" role="status" aria-live="polite">
      <div className="online-head">
        <i className={`online-dot${status === 'online' ? ' on' : ''}`} />
        {note ?? `${list.length + 1} here now`}
      </div>
      {status === 'online' && (
        <ul>
          <li><i style={{ background: '#ffcf5a' }} />{selfName} (you)</li>
          {shown.map((p) => <li key={p.id}><i style={{ background: p.color }} />{p.name}</li>)}
          {list.length > max && <li className="more">+{list.length - max} more</li>}
        </ul>
      )}
    </div>
  );
}
