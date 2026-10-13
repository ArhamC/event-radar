import { config } from '../../config';
import type { RawEvent } from '../types';
import { decodeEntities, toPlainText } from './html';

// Western University's public events feed (the JSON behind uwo.ca/events).
// Its .ics version has no locations, so we use the JSON, which has them in `additionDetails`.
// Default URL: https://www.uwo.ca/events/_data/current-live.json

interface WesternEvent {
  id: string;
  title: string;
  url?: string;
  startDate: string; // "2026-10-22T17:00-0400"
  endDate?: string;
  description?: string;
  allDay?: string;
  additionDetails?: { icon: string; text: string; link: string }[];
  filter4?: string[]; // audiences
}

const CAMPUS = { lat: 43.00542, lng: -81.2748 };

// Campus buildings, matched against the feed's free-text location ("WL 252", "UCC, Room 37"...).
// Coordinates from OpenStreetMap Nominatim. Unlisted buildings fall back to the campus point.
const BUILDINGS: { re: RegExp; name: string; lat: number; lng: number }[] = [
  { re: /\bweldon\b|\bWL\s?\d/i, name: 'Weldon Library', lat: 43.00773, lng: -81.27563 },
  { re: /von kuster|\bmusic building\b/i, name: 'Music Building (von Kuster Hall)', lat: 43.00669, lng: -81.27105 },
  { re: /paul davenport|talbot college/i, name: 'Talbot College (Paul Davenport Theatre)', lat: 43.00738, lng: -81.27064 },
  { re: /student services building|\bWSSB\b/i, name: 'Western Student Services Building', lat: 43.00822, lng: -81.2766 },
  { re: /schmeichel|\bSEI\b/i, name: 'Schmeichel Building (SEI)', lat: 43.00737, lng: -81.27623 },
  { re: /medical sciences building|\bMSB\b/i, name: 'Medical Sciences Building', lat: 43.01025, lng: -81.27457 },
  { re: /dental sciences|\bDSB\b/i, name: 'Dental Sciences Building', lat: 43.011, lng: -81.27444 },
  { re: /lawson hall/i, name: 'Lawson Hall', lat: 43.00898, lng: -81.27385 },
  { re: /conron hall|university college|\bUC\s?\d/i, name: 'University College', lat: 43.00862, lng: -81.27322 },
  { re: /somerville house|great hall/i, name: 'Somerville House', lat: 43.00769, lng: -81.27428 },
  { re: /mcintosh gallery/i, name: 'McIntosh Gallery', lat: 43.00949, lng: -81.27343 },
  { re: /\bFNB\b|FIMS/i, name: 'FIMS & Nursing Building', lat: 43.00605, lng: -81.27271 },
  { re: /thames hall/i, name: 'Thames Hall', lat: 43.00683, lng: -81.27435 },
  { re: /\bWIRB\b|interdisciplinary research/i, name: 'Western Interdisciplinary Research Building', lat: 43.01182, lng: -81.27098 },
];

// Online-only, or no real place yet: nothing to put on a map
const NOT_A_PLACE = /^(zoom|online( via zoom)?|virtual|webinar|in-person|location tba|tba)\b[^,]*$/i;

export function resolveWesternLocation(text: string): Pick<RawEvent, 'venueName' | 'locationText' | 'point' | 'fallbackPoint'> | null {
  const t = decodeEntities(text).trim();
  if (!t || NOT_A_PLACE.test(t)) return null;

  const b = BUILDINGS.find((x) => x.re.test(t));
  if (b) return { venueName: b.name, locationText: `${t}, Western University`, point: { lat: b.lat, lng: b.lng } };

  // Off-campus addresses ("800 Commissioners Road East, ... London") geocode fine; campus rooms we don't
  // know land on the campus point rather than being dropped.
  const offCampus = /\d+ [A-Z][a-z]+ (road|rd|street|st|avenue|ave|drive|dr)\b/i.test(t);
  return {
    venueName: offCampus ? t.split(',')[0].trim() : `${t.split(',')[0].trim()}, Western`,
    locationText: offCampus ? t : `${t}, Western University, London, Ontario`,
    fallbackPoint: CAMPUS,
  };
}

// "2026-10-22T17:00-0400" -> Date (JS wants a colon in the offset)
const parseDate = (s?: string) => (s ? new Date(s.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) : undefined);

export function parseWestern(events: WesternEvent[], now = new Date(), horizonDays = 60): RawEvent[] {
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const out: RawEvent[] = [];
  for (const e of events) {
    // Only events open to everyone; most of the feed is internal (defences, staff training)
    if (!e.filter4?.includes('General Public')) continue;
    const startsAt = parseDate(e.startDate);
    const endsAt = parseDate(e.endDate);
    if (!startsAt || Number.isNaN(startsAt.getTime()) || startsAt > horizon) continue;
    if ((endsAt ?? startsAt) < now) continue;

    const details = e.additionDetails ?? [];
    const where = details.find((d) => /map-marker/.test(d.icon))?.text;
    const place = where ? resolveWesternLocation(where) : null;
    if (!place) continue;

    const ticketed = details.some((d) => /ticket|dollar/.test(d.icon));
    out.push({
      externalId: `${e.id}@${startsAt.toISOString()}`,
      title: decodeEntities(e.title).trim(),
      description: toPlainText(e.description),
      startsAt,
      endsAt: endsAt && endsAt > startsAt ? endsAt : undefined,
      url: e.url,
      priceCents: ticketed ? null : 0,
      ...place,
    });
  }
  return out;
}

export async function fetchWestern(url: string): Promise<RawEvent[]> {
  const res = await fetch(url, { headers: { 'User-Agent': `EventRadar/1.0 (student project; ${config.geocoderContact})` } });
  if (!res.ok) throw new Error(`Western feed responded ${res.status}`);
  const data = (await res.json()) as { events?: WesternEvent[] };
  return parseWestern(data.events ?? []);
}
