import { config } from '../../config';
import type { RawEvent } from '../types';
import { decodeEntities } from './html';

// London Music Hall's listing (https://londonmusichall.com/upcoming-events/) also covers Rum Runners
// next door; each card says which. One page, ~40 cards: title, date, show time, openers, age policy.

const VENUES: Record<string, { name: string; address: string }> = {
  'london music hall': { name: 'London Music Hall', address: '185 Queens Avenue, London, Ontario' },
  'rum runners': { name: 'Rum Runners', address: '178 Dundas Street, London, Ontario' },
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// "October 17, 2026" + "8:00 PM" -> Date in city time (process TZ is pinned, see config.ts)
function toDate(day: string, time: string): Date | null {
  const d = /([A-Za-z]+) (\d{1,2}), (\d{4})/.exec(day);
  const t = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(time);
  const month = d ? MONTHS.indexOf(d[1].toLowerCase()) : -1;
  if (!d || !t || month < 0) return null;
  const hour = (Number(t[1]) % 12) + (t[3].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(Number(d[3]), month, Number(d[2]), hour, Number(t[2]));
}

const text = (chunk: string, cls: string) => {
  const m = new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`).exec(chunk);
  return m ? decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
};

export function parseLondonMusicHall(html: string, now = new Date(), horizonDays = 60): RawEvent[] {
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const out: RawEvent[] = [];
  for (const chunk of html.split('<div class="event">').slice(1)) {
    const link = /<h2>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(chunk);
    if (!link) continue;
    const time = /Show:\s*(\d{1,2}:\d{2}\s*[AP]M)/i.exec(chunk)?.[1] ?? /Doors:\s*(\d{1,2}:\d{2}\s*[AP]M)/i.exec(chunk)?.[1];
    const startsAt = time ? toDate(text(chunk, 'date'), time) : null;
    if (!startsAt || startsAt > horizon || startsAt.getTime() + 3 * 3_600_000 < now.getTime()) continue;

    const venue = VENUES[text(chunk, 'price').replace(/^venue:\s*/i, '').toLowerCase()] ?? VENUES['london music hall'];
    const openers = (/<div class="supports">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/.exec(chunk)?.[1] ?? '').replace(/\s+/g, ' ').trim();
    const ages = text(chunk, 'age-restrictions');
    const description = [openers && decodeEntities(openers), ages].filter(Boolean).join('. ');
    const slug = new URL(link[1]).pathname.replace(/^\/events\/|\/$/g, '');
    out.push({
      externalId: `${slug}@${startsAt.toISOString()}`,
      title: decodeEntities(link[2]).replace(/\s+/g, ' ').trim(),
      description: description || undefined,
      startsAt,
      url: link[1],
      venueName: venue.name,
      locationText: venue.address,
      priceCents: null, // ticketed, price on the ticket site
    });
  }
  return out;
}

export async function fetchLondonMusicHall(url: string): Promise<RawEvent[]> {
  const res = await fetch(url, { headers: { 'User-Agent': `EventRadar/1.0 (student project; ${config.geocoderContact})` } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return parseLondonMusicHall(await res.text());
}
