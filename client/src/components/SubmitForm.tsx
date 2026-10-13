import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { GoodFor, LatLng } from '../types';
import { goodForLabel } from '../utils';

interface Props {
  allVibes: string[];
  picked: LatLng | null;
  isAdmin: boolean;
  onDone: () => void;
}

export default function SubmitForm({ allVibes, picked, isAdmin, onDone }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [free, setFree] = useState(true);
  const [price, setPrice] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [goodFor, setGoodFor] = useState<GoodFor>('both');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!picked) {
      setError('Click the map to place the venue.');
      return;
    }
    setBusy(true);
    try {
      const priceCents = free ? 0 : Math.round((parseFloat(price) || 0) * 100);
      const r = await api.createEvent({
        title,
        description: description || undefined,
        startsAt: new Date(start).toISOString(),
        endsAt: end ? new Date(end).toISOString() : undefined,
        priceCents,
        venue: { name: venueName, address: address || undefined, lat: picked.lat, lng: picked.lng },
        tags,
        goodFor,
      });
      setResult(r.status === 'approved' ? 'Published. It is live on the map now.' : 'Submitted. It will appear once a moderator approves it.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="form">
        <h2>Thanks!</h2>
        <p>{result}</p>
        <button className="btn" onClick={onDone}>
          Back to the map
        </button>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>Add an event</h2>
      <p className="muted">
        {isAdmin ? 'As an admin, your events publish immediately.' : 'New events are reviewed before they go live.'}
      </p>

      <label>
        What is it?
        <input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tuesday open mic" />
      </label>
      <label>
        Details
        <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <label>
        Venue name
        <input required minLength={2} maxLength={120} value={venueName} onChange={(e) => setVenueName(e.target.value)} />
      </label>
      <label>
        Street address (optional)
        <input maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <p className={picked ? 'ok' : 'muted'}>
        {picked ? `Pin placed at ${picked.lat.toFixed(5)}, ${picked.lng.toFixed(5)}. Click the map to move it.` : 'Click the map to place the venue.'}
      </p>

      <div className="row">
        <label>
          Starts
          <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          Ends (optional)
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>

      <div className="row">
        <label className="check">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
          Free
        </label>
        {!free && (
          <label>
            Price ($)
            <input type="number" min="0" step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        )}
      </div>

      <div className="row going" role="group" aria-label="Good for">
        <span className="going-label">Good for</span>
        {(['solo', 'group', 'both'] as const).map((g) => (
          <button
            type="button"
            key={g}
            className={`seg ${goodFor === g ? 'on' : ''}`}
            aria-pressed={goodFor === g}
            onClick={() => setGoodFor(g)}
          >
            {goodForLabel(g)}
          </button>
        ))}
      </div>

      <div className="chips" role="group" aria-label="Vibe">
        {allVibes.map((v) => (
          <button
            type="button"
            key={v}
            className={`chip ${tags.includes(v) ? 'on' : ''}`}
            aria-pressed={tags.includes(v)}
            onClick={() => setTags((t) => (t.includes(v) ? t.filter((x) => x !== v) : t.length < 6 ? [...t, v] : t))}
          >
            {v}
          </button>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn" disabled={busy}>
          {isAdmin ? 'Publish event' : 'Submit for review'}
        </button>
        <button type="button" className="link" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
