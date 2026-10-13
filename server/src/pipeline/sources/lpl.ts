import { config } from '../../config';
import type { RawEvent } from '../types';
import { decodeEntities, sleep } from './html';

// London Public Library (lpl.ca/whats-on). No feed, but the listing cards carry everything we need
// (date, time, branch, title, "Drop in"/"Register"), so we read listing pages only, in date order,
// and stop once we pass the horizon. robots.txt allows /whats-on and sets no crawl delay; we still
// wait 2s between pages. ~18 events per page, so a 60-day window is roughly 60 pages / 2 minutes.

const BASE = 'https://www.lpl.ca';
const DELAY_MS = 2000;
const MAX_PAGES = 150;

// Street addresses from lpl.ca/using-library/hours-locations, so geocoding lands on the building.
// Branches not listed here are geocoded by name.
const BRANCHES: Record<string, string> = {
  'Beacock Library': '1280 Huron St, London, Ontario',
  'Bostwick Library': '501 Southdale Rd W, London, Ontario',
  'Byron Library': '1295 Commissioners Rd W, London, Ontario',
  'Carson Library': '465 Quebec St, London, Ontario',
  'Central Library': '251 Dundas St, London, Ontario',
  'Cherryhill Library': '301 Oxford St W, London, Ontario',
  'Crouch Library': '550 Hamilton Rd, London, Ontario',
  'East London Library': '2016 Dundas St, London, Ontario',
  'Glanworth Library': '2950 Glanworth Drive, London, Ontario',
  'Jalna Library': '1119 Jalna Blvd, London, Ontario',
  'Lambeth Library': '7112 Beattie Street, London, Ontario',
  'Landon Library': '167 Wortley Rd, London, Ontario',
  'Masonville Library': '30 North Centre Road, London, Ontario',
  'Pond Mills Library': '1166 Commissioners Road East, London, Ontario',
  'Stoney Creek Library': '920 Sunningdale Road East, London, Ontario',
  'The Wolf Performance Hall': '251 Dundas St, London, Ontario', // inside Central Library
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// "October 13, 2026" + "09:30 am" -> Date in city time (the process TZ is pinned, see config.ts)
export function lplDate(day: string, time: string): Date | null {
  const d = /([A-Za-z]+) (\d{1,2}), (\d{4})/.exec(day);
  const t = /(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(time);
  const month = d ? MONTHS.indexOf(d[1].toLowerCase()) : -1;
  if (!d || !t || month < 0) return null;
  let hour = Number(t[1]) % 12;
  if (t[3].toLowerCase() === 'pm') hour += 12;
  return new Date(Number(d[3]), month, Number(d[2]), hour, Number(t[2]));
}

export interface LplCard {
  slug: string;
  title: string;
  branch: string;
  startsAt: Date;
  endsAt?: Date;
  note?: string; // "Drop in", "Register"...
}

export function parseLplListing(html: string): LplCard[] {
  const cards: LplCard[] = [];
  for (const chunk of html.split('teaser-card--event').slice(1)) {
    const slug = /href="\/events\/([a-z0-9-]+)"/.exec(chunk)?.[1];
    const date = /teaser-card__event-date[^>]*>\s*<div>([^<]+)<\/div>\s*<div>([^<]*)<\/div>/.exec(chunk);
    const branch = /<div class="uppercase">([^<]+)<\/div>/.exec(chunk)?.[1];
    const title = /<h2[^>]*>([^<]+)<\/h2>/.exec(chunk)?.[1];
    if (!slug || !date || !branch || !title) continue;
    const [from, to] = date[2].split(/\s*-\s*/);
    const startsAt = lplDate(date[1], from ?? '');
    if (!startsAt) continue; // no clock time ("All day" etc.): skip rather than guess
    const endsAt = to ? lplDate(date[1], to) : null;
    const note = /<\/h2>\s*<\/div>\s*([^<]+?)\s*<\/div>/.exec(chunk)?.[1];
    cards.push({
      slug,
      title: decodeEntities(title).trim(),
      branch: decodeEntities(branch).replace(/\s+/g, ' ').trim(),
      startsAt,
      endsAt: endsAt && endsAt > startsAt ? endsAt : undefined,
      note: note ? decodeEntities(note).trim() : undefined,
    });
  }
  return cards;
}

export function cardToRaw(c: LplCard): RawEvent {
  return {
    externalId: c.slug,
    title: c.title,
    description: c.note ? `${c.note} at ${c.branch}.` : undefined, // "Drop in" also makes the tagger say "solo"
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    url: `${BASE}/events/${c.slug}`,
    venueName: c.branch,
    locationText: BRANCHES[c.branch] ?? `${c.branch}, London, Ontario`,
    priceCents: 0, // library programs are free
  };
}

export async function fetchLpl(_url: string, horizonDays = 60): Promise<RawEvent[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const out = new Map<string, RawEvent>();
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(DELAY_MS);
    const res = await fetch(`${BASE}/whats-on?page=${page}`, {
      headers: { 'User-Agent': `EventRadar/1.0 (student project; ${config.geocoderContact})` },
    });
    if (!res.ok) throw new Error(`lpl.ca responded ${res.status} on page ${page}`);
    const cards = parseLplListing(await res.text());
    if (cards.length === 0) break; // past the last page
    for (const c of cards) if (c.startsAt <= horizon && (c.endsAt ?? c.startsAt) >= now) out.set(c.slug, cardToRaw(c));
    if (cards.every((c) => c.startsAt > horizon)) break; // listing is in date order
  }
  return [...out.values()];
}
