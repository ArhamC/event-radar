import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AdminEvent } from '../types';
import { fullDate, timeRange } from '../utils';

export default function AdminQueue({ onChanged }: { onChanged: () => void }) {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.adminEvents('pending').then((r) => setEvents(r.events)).catch((e) => setError(e.message));
  }, []);

  async function decide(id: number, status: 'approved' | 'rejected') {
    try {
      await api.adminSetStatus(id, status);
      setEvents((es) => (es ?? []).filter((e) => e.id !== id));
      if (status === 'approved') onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="form">
      <h2>Review queue</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {events === null && !error && <p className="muted">Loading...</p>}
      {events?.length === 0 && <p className="muted">Nothing waiting. New submissions and imported events show up here.</p>}
      <ul className="queue">
        {events?.map((e) => (
          <li key={e.id}>
            <h3>{e.title}</h3>
            <p className="muted">
              {fullDate(e.starts_at)}, {timeRange(e.starts_at, e.ends_at)}
              <br />
              {e.venue_name}
              {e.address ? `, ${e.address}` : ''}
              <br />
              From: {e.source}
            </p>
            {e.description && <p>{e.description.slice(0, 240)}</p>}
            <div className="row">
              <button className="btn" onClick={() => decide(e.id, 'approved')}>Approve</button>
              <button className="btn ghost" onClick={() => decide(e.id, 'rejected')}>Reject</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
