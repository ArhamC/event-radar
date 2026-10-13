import { config } from '../../config';
import type { RawEvent } from '../types';
import { decodeEntities, toPlainText } from './html';

// Squarespace events pages (e.g. https://www.honeydipbar.com/events). Every Squarespace collection
// has a JSON twin at ?format=json; for event collections it lists `upcoming` events.
// Locations are often left at Squarespace's default (a New York address), so we only trust one
// that has a street address; otherwise the source's venue (sources.config) is used.

interface SqspEvent {
  id: string;
  title: string;
  fullUrl?: string;
  startDate: number; // ms
  endDate?: number;
  excerpt?: string;
  body?: string;
  location?: { addressTitle?: string; addressLine1?: string; addressLine2?: string; markerLat?: number; markerLng?: number };
}

export function parseSquarespace(origin: string, items: SqspEvent[], now = new Date(), horizonDays = 60): RawEvent[] {
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const out: RawEvent[] = [];
  for (const e of items) {
    const startsAt = new Date(e.startDate);
    const endsAt = e.endDate ? new Date(e.endDate) : undefined;
    if (Number.isNaN(startsAt.getTime()) || startsAt > horizon || (endsAt ?? startsAt) < now) continue;

    const loc = e.location;
    const street = loc?.addressLine1?.trim();
    const located = street
      ? {
          venueName: loc!.addressTitle?.trim() || undefined,
          locationText: [loc!.addressTitle, street, loc!.addressLine2].map((s) => s?.trim()).filter(Boolean).join(', '),
        }
      : {};
    out.push({
      externalId: e.id,
      title: decodeEntities(e.title).trim(),
      description: toPlainText(e.excerpt || e.body),
      startsAt,
      endsAt: endsAt && endsAt > startsAt ? endsAt : undefined,
      url: e.fullUrl ? new URL(e.fullUrl, origin).href : undefined,
      ...located,
    });
  }
  return out;
}

export async function fetchSquarespace(url: string): Promise<RawEvent[]> {
  const res = await fetch(`${url.replace(/\/$/, '')}?format=json`, {
    headers: { 'User-Agent': `EventRadar/1.0 (student project; ${config.geocoderContact})` },
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const data = (await res.json()) as { upcoming?: SqspEvent[]; items?: SqspEvent[] };
  return parseSquarespace(new URL(url).origin, data.upcoming ?? data.items ?? []);
}
