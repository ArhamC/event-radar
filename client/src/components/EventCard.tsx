import type { EventItem } from '../types';
import { dayParts, distanceLabel, priceLabel, timeRange } from '../utils';

interface Props {
  event: EventItem;
  selected: boolean;
  onSelect: () => void;
  onFavorite: () => void;
}

export default function EventCard({ event: e, selected, onSelect, onFavorite }: Props) {
  const { day, month, weekday } = dayParts(e.starts_at);
  return (
    <li className={`card-wrap ${selected ? 'selected' : ''}`}>
      <button className="card" onClick={onSelect} aria-current={selected}>
        <span className="stub" aria-hidden="true">
          <span className="stub-day">{day}</span>
          <span className="stub-month">{month}</span>
        </span>
        <span className="card-body">
          <span className="card-title">{e.title}</span>
          <span className="card-meta">
            {weekday} {timeRange(e.starts_at, e.ends_at)}
          </span>
          <span className="card-meta">
            {e.venue_name}, {distanceLabel(e.distance_m)}
          </span>
          <span className="card-tags">
            <span className={`price ${e.price_cents === 0 ? 'free' : ''}`}>{priceLabel(e.price_cents)}</span>
            {e.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </span>
        </span>
      </button>
      <button
        className={`fav ${e.is_favorite ? 'on' : ''}`}
        onClick={onFavorite}
        aria-pressed={!!e.is_favorite}
        aria-label={e.is_favorite ? `Remove ${e.title} from saved` : `Save ${e.title}`}
      >
        {e.is_favorite ? '★' : '☆'}
      </button>
    </li>
  );
}
