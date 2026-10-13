interface Props {
  range: 'today' | 'week' | 'month';
  onRange: (r: 'today' | 'week' | 'month') => void;
  radiusKm: number;
  onRadius: (km: number) => void;
  vibes: string[];
  allVibes: string[];
  onToggleVibe: (v: string) => void;
  free: boolean;
  onFree: (v: boolean) => void;
  q: string;
  onQ: (v: string) => void;
  savedOnly: boolean;
  onSaved: (v: boolean) => void;
  canSave: boolean;
  onLocate: () => void;
}

const RANGES = [
  ['today', 'Today'],
  ['week', 'Next 7 days'],
  ['month', 'Next 30 days'],
] as const;

export default function FilterBar(p: Props) {
  return (
    <div className="filters">
      <input
        className="search"
        type="search"
        placeholder="Search events or venues"
        value={p.q}
        onChange={(e) => p.onQ(e.target.value)}
        aria-label="Search events or venues"
      />

      <div className="row" role="group" aria-label="When">
        {RANGES.map(([value, label]) => (
          <button
            key={value}
            className={`seg ${p.range === value ? 'on' : ''}`}
            aria-pressed={p.range === value}
            onClick={() => p.onRange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="row">
        <label className="select">
          Within
          <select value={p.radiusKm} onChange={(e) => p.onRadius(Number(e.target.value))}>
            {[1, 3, 5, 10, 25].map((km) => (
              <option key={km} value={km}>
                {km} km
              </option>
            ))}
          </select>
        </label>
        <button className="link" onClick={p.onLocate}>
          Use my location
        </button>
        <label className="check">
          <input type="checkbox" checked={p.free} onChange={(e) => p.onFree(e.target.checked)} />
          Free only
        </label>
        {p.canSave && (
          <label className="check">
            <input type="checkbox" checked={p.savedOnly} onChange={(e) => p.onSaved(e.target.checked)} />
            Saved
          </label>
        )}
      </div>

      <div className="chips" role="group" aria-label="Vibe">
        {p.allVibes.map((v) => (
          <button
            key={v}
            className={`chip ${p.vibes.includes(v) ? 'on' : ''}`}
            aria-pressed={p.vibes.includes(v)}
            onClick={() => p.onToggleVibe(v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
