import type { EventItem } from '../types';
import { distanceLabel, fullDate, goodForLabel, priceLabel, timeRange } from '../utils';

interface Props {
  event: EventItem;
  onBack: () => void;
  onFavorite: () => void;
}

export default function EventDetail({ event: e, onBack, onFavorite }: Props) {
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lng}#map=17/${e.lat}/${e.lng}`;
  return (
    <article className="detail">
      <button className="link" onClick={onBack}>
        Back to results
      </button>
      <h2>{e.title}</h2>
      <p className="detail-when">
        {fullDate(e.starts_at)}, {timeRange(e.starts_at, e.ends_at)}
      </p>
      <p className="detail-where">
        <strong>{e.venue_name}</strong>
        {e.address ? `, ${e.address}` : ''}
        <br />
        {distanceLabel(e.distance_m)}
      </p>
      <p className="card-tags">
        <span className={`price ${e.price_cents === 0 ? 'free' : ''}`}>{priceLabel(e.price_cents)}</span>
        <span className="tag mode">{goodForLabel(e.good_for)}</span>
        {e.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </p>
      {e.description && <p className="detail-desc">{e.description}</p>}
      <div className="row">
        <button className="btn" onClick={onFavorite}>
          {e.is_favorite ? 'Saved' : 'Save this event'}
        </button>
        <a className="btn ghost" href={mapsUrl} target="_blank" rel="noreferrer">
          Open in OpenStreetMap
        </a>
        {e.source_url && (
          <a className="btn ghost" href={e.source_url} target="_blank" rel="noreferrer">
            Original listing
          </a>
        )}
      </div>
    </article>
  );
}
