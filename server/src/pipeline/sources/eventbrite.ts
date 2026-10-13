import { config } from '../../config';
import type { RawEvent } from '../types';
import { toPlainText } from './html';

// Eventbrite, one organizer per source. Public search is gone from their API, but listing an
// organizer's events still works with a free personal token (EVENTBRITE_TOKEN in server/.env).
// sources.url: the organizer page (https://www.eventbrite.ca/o/london-public-library-67405991003)
// or just the numeric organizer ID.

const API = 'https://www.eventbriteapi.com/v3';
const MAX_DISTANCE_KM = 40; // organizers sometimes run events in other cities

interface EbEvent {
  id: string;
  name: { text: string };
  description?: { text?: string | null };
  url: string;
  start: { utc: string };
  end?: { utc: string };
  online_event: boolean;
  is_free: boolean;
  venue?: {
    name?: string | null;
    latitude?: string | null;
    longitude?: string | null;
    address?: { localized_address_display?: string | null };
  } | null;
  ticket_availability?: { minimum_ticket_price?: { value: number } | null } | null;
}

interface EbPage {
  events: EbEvent[];
  pagination: { has_more_items: boolean; continuation?: string };
}

export function organizerId(url: string): string {
  const m = /(\d{6,})\/?(\?.*)?$/.exec(url.trim());
  if (!m) throw new Error(`Can't find an Eventbrite organizer ID in "${url}"`);
  return m[1];
}

function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dy = (a.lat - b.lat) * 111.32;
  const dx = (a.lng - b.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

export function parseEventbrite(events: EbEvent[], now = new Date(), horizonDays = 60): RawEvent[] {
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const out: RawEvent[] = [];
  for (const e of events) {
    if (e.online_event || !e.venue) continue;
    const startsAt = new Date(e.start.utc);
    const endsAt = e.end ? new Date(e.end.utc) : undefined;
    if (startsAt > horizon || (endsAt ?? startsAt) < now) continue;

    const lat = Number(e.venue.latitude);
    const lng = Number(e.venue.longitude);
    const point = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : undefined;
    if (point && kmBetween(point, config.center) > MAX_DISTANCE_KM) continue;
    const address = e.venue.address?.localized_address_display ?? undefined;
    if (!point && !address) continue;

    const minPrice = e.ticket_availability?.minimum_ticket_price?.value;
    out.push({
      externalId: e.id,
      title: e.name.text.trim(),
      description: toPlainText(e.description?.text ?? undefined),
      startsAt,
      endsAt: endsAt && endsAt > startsAt ? endsAt : undefined,
      url: e.url,
      venueName: e.venue.name?.trim() || undefined,
      locationText: address,
      point,
      priceCents: e.is_free ? 0 : typeof minPrice === 'number' ? minPrice : null,
    });
  }
  return out;
}

export async function fetchEventbrite(url: string): Promise<RawEvent[]> {
  if (!config.eventbriteToken) throw new Error('EVENTBRITE_TOKEN is not set in server/.env');
  const id = organizerId(url);
  const events: EbEvent[] = [];
  let continuation: string | undefined;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ status: 'live', order_by: 'start_asc', expand: 'venue,ticket_availability', page_size: '200' });
    if (continuation) qs.set('continuation', continuation);
    const res = await fetch(`${API}/organizers/${id}/events/?${qs}`, {
      headers: { Authorization: `Bearer ${config.eventbriteToken}` },
    });
    if (!res.ok) throw new Error(`Eventbrite responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as EbPage;
    events.push(...data.events);
    if (!data.pagination.has_more_items || !data.pagination.continuation) break;
    continuation = data.pagination.continuation;
  }
  return parseEventbrite(events);
}
