import { config } from '../../config';
import type { RawEvent } from '../types';
import { decodeEntities, toPlainText } from './html';

// Wix sites using the Wix Events app (e.g. https://www.richmondtavern.ca/upcoming-events).
// There's no public feed, but the page embeds each event as JSON, with exact times and the
// venue's coordinates. We find every object that has a `scheduling.config` and parse it.

interface WixEvent {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  status?: number;
  location?: { name?: string; address?: string; coordinates?: { lat: number; lng: number } };
  scheduling?: { config?: { scheduleTbd?: boolean; startDate?: string; endDate?: string } };
}

// String-aware brace matching, so we can lift whole JSON objects out of a page
function enclosingStart(s: string, i: number): number {
  let depth = 0;
  for (let k = i; k >= 0; k--) {
    const ch = s[k];
    if (ch === '"') {
      k--;
      while (k >= 0 && !(s[k] === '"' && s[k - 1] !== '\\')) k--;
      continue;
    }
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) return k;
      depth--;
    }
  }
  return -1;
}

function matchingEnd(s: string, start: number): number {
  let depth = 0;
  for (let k = start; k < s.length; k++) {
    const ch = s[k];
    if (ch === '"') {
      k++;
      while (k < s.length && !(s[k] === '"' && s[k - 1] !== '\\')) k++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return k;
  }
  return -1;
}

export function extractWixEvents(html: string): WixEvent[] {
  const found = new Map<string, WixEvent>();
  const marker = '"scheduling":{"config"';
  for (let i = html.indexOf(marker); i >= 0; i = html.indexOf(marker, i + 1)) {
    const start = enclosingStart(html, i - 1);
    const end = start >= 0 ? matchingEnd(html, start) : -1;
    if (end < 0) continue;
    try {
      const o = JSON.parse(html.slice(start, end + 1)) as WixEvent;
      if (o.id && o.title && o.scheduling?.config?.startDate) found.set(o.id, o);
    } catch {
      // not a clean JSON object (e.g. inside a script string); skip
    }
  }
  return [...found.values()];
}

export function parseWixEvents(pageUrl: string, events: WixEvent[], now = new Date(), horizonDays = 60): RawEvent[] {
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const origin = new URL(pageUrl).origin;
  const out: RawEvent[] = [];
  for (const e of events) {
    const cfg = e.scheduling!.config!;
    if (cfg.scheduleTbd) continue;
    const startsAt = new Date(cfg.startDate!);
    const endsAt = cfg.endDate ? new Date(cfg.endDate) : undefined;
    if (Number.isNaN(startsAt.getTime()) || startsAt > horizon || (endsAt ?? startsAt) < now) continue;

    const c = e.location?.coordinates;
    out.push({
      externalId: e.id,
      title: decodeEntities(e.title).trim(),
      description: toPlainText(e.description),
      startsAt,
      endsAt: endsAt && endsAt > startsAt ? endsAt : undefined,
      url: e.slug ? `${origin}/event-details/${e.slug}` : pageUrl,
      locationText: e.location?.address || undefined,
      point: c && Number.isFinite(c.lat) && Number.isFinite(c.lng) ? { lat: c.lat, lng: c.lng } : undefined,
    });
  }
  return out;
}

export async function fetchWixEvents(url: string): Promise<RawEvent[]> {
  const res = await fetch(url, { headers: { 'User-Agent': `EventRadar/1.0 (student project; ${config.geocoderContact})` } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return parseWixEvents(url, extractWixEvents(await res.text()));
}
