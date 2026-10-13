import { config } from '../../config';
import type { AdapterContext, RawEvent } from '../types';
import { decodeEntities, sleep, toPlainText } from './html';

// Tourism London (londontourism.ca/events). No feed, but every event page has an "Add to Calendar"
// .ics at /icscal/?calendar=<slug> with exact times and a full street address. So: read the listing
// pages for slugs, then fetch each event's .ics.
// Politeness: their robots.txt allows crawling with Crawl-delay: 10, so one request every 10 seconds.
// A full run is ~150 requests, roughly 25 minutes; fine for a background job.

const BASE = 'https://www.londontourism.ca';
const CRAWL_DELAY_MS = 10_000;
const MAX_PAGES = 15;

let lastRequestAt = 0;
async function politeGet(url: string, retries = 2): Promise<string> {
  const wait = CRAWL_DELAY_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': `EventRadar/1.0 (student project; ${config.geocoderContact})` } });
  } catch (err) {
    // Network blip (DNS, reset): back off and retry rather than lose a 25-minute crawl
    if (retries === 0) throw err;
    await sleep(30_000);
    return politeGet(url, retries - 1);
  }
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.text();
}

export interface ListingCard {
  slug: string;
  date: string | null; // start date shown on the card, YYYY-MM-DD
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// "Thursday, October 15, 2026" | "October 15 - 25, 2026" | "October 30 - November 2, 2026" -> start date
export function parseCardDate(text: string): string | null {
  const m = /([A-Z][a-z]+) (\d{1,2})\b[^,]*?, (\d{4})/.exec(text);
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (!m || month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// Event cards are links that contain a date "chicklet" (category links don't), followed by a <time>.
export function parseListing(html: string): ListingCard[] {
  const re =
    /<a href="https:\/\/www\.londontourism\.ca\/events\/([a-z0-9-]+)">\s*<span class="dateChicklet"[\s\S]*?<time><strong>([^<]*)<\/strong><\/time>/g;
  const cards = new Map<string, ListingCard>();
  for (const m of html.matchAll(re)) if (!cards.has(m[1])) cards.set(m[1], { slug: m[1], date: parseCardDate(m[2]) });
  return [...cards.values()];
}

async function crawlListing(path: string): Promise<ListingCard[]> {
  const cards = new Map<string, ListingCard>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await politeGet(page === 1 ? `${BASE}${path}` : `${BASE}${path}/page/${page}`);
    const found = parseListing(html).filter((c) => !cards.has(c.slug));
    if (found.length === 0) break; // past the last page
    found.forEach((c) => cards.set(c.slug, c));
    if (!html.includes(`${path}/page/${page + 1}`)) break;
  }
  return [...cards.values()];
}

// YYYY-MM-DD in city time (the process TZ is pinned to the city, see config.ts)
const localDate = (d: Date) => d.toLocaleDateString('en-CA');

// The .ics fetch is the slow part (10s each), so only do it for events we don't have yet, plus
// events in the next 7 days whose date on the listing no longer matches what we stored.
export function needsFetch(card: ListingCard, known: Map<string, Date>, now = new Date()): boolean {
  const stored = known.get(card.slug);
  if (!stored) return true;
  if (!card.date) return false;
  const today = localDate(now);
  const weekOut = localDate(new Date(now.getTime() + 7 * 86_400_000));
  return card.date >= today && card.date <= weekOut && card.date !== localDate(stored);
}

// Their .ics files are tiny and flat (one VEVENT, no UID, raw ";" in text), which node-ical silently
// drops, so we read the few fields we need ourselves.
export function readIcsFields(text: string): Record<string, string> {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); // unfold continuation lines
  const fields: Record<string, string> = {};
  let inEvent = false;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) inEvent = true;
    else if (line.startsWith('END:VEVENT')) break;
    else if (inEvent) {
      const m = /^([A-Z-]+)(?:;[^:]*)?:(.*)$/.exec(line);
      if (m && !(m[1] in fields)) fields[m[1]] = m[2].replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, '\n');
    }
  }
  return fields;
}

// "20261015T180000" (floating = city time, the process TZ is pinned), "...Z" (UTC), or "20261015"
export function icsDate(v: string | undefined): Date | undefined {
  const m = v && /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return undefined;
  const [y, mo, d, h = '0', mi = '0', sec = '0'] = m.slice(1, 7);
  return m[7]
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec))
    : new Date(+y, +mo - 1, +d, +h, +mi, +sec);
}

export function parseEventIcs(slug: string, text: string, now = new Date()): RawEvent | null {
  const f = readIcsFields(text);
  const startsAt = icsDate(f.DTSTART);
  if (!startsAt || !f.SUMMARY) return null;
  const end = icsDate(f.DTEND);
  const endsAt = end && end > startsAt ? end : undefined;
  if ((endsAt ?? startsAt) < now) return null;
  const location = f.LOCATION ? decodeEntities(f.LOCATION).trim() : undefined;
  return {
    externalId: slug, // their .ics has no UID; the slug is stable
    title: decodeEntities(f.SUMMARY).trim(),
    description: toPlainText(f.DESCRIPTION),
    startsAt,
    endsAt,
    locationText: location && !/^various venues/i.test(location) ? location : undefined,
    url: `${BASE}/events/${slug}`,
  };
}

export async function fetchTourismLondon(_url: string, ctx: AdapterContext, horizonDays = 60): Promise<RawEvent[]> {
  const cards = await crawlListing('/events/all-events');
  const slugs = cards.filter((c) => needsFetch(c, ctx.known)).map((c) => c.slug);
  console.log(`[tourism-london] ${cards.length} on the listing, fetching ${slugs.length} (new or date changed)`);
  if (slugs.length === 0) return [];

  // Their "Free & By Donation" category is the only price signal; everything else stays unknown
  const freeCards = await crawlListing('/events/free-and-by-donation-events').catch(() => [] as ListingCard[]);
  const free = new Set(freeCards.map((c) => c.slug));

  const horizon = new Date(Date.now() + horizonDays * 86_400_000);
  const out: RawEvent[] = [];
  for (const slug of slugs) {
    try {
      const ev = parseEventIcs(slug, await politeGet(`${BASE}/icscal/?calendar=${slug}`));
      if (ev && ev.startsAt <= horizon) out.push({ ...ev, priceCents: free.has(slug) ? 0 : null });
    } catch (err) {
      console.error(`[tourism-london] ${slug}:`, (err as Error).message);
    }
  }
  return out;
}
