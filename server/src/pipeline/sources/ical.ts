import * as ical from 'node-ical';
import type { RawEvent } from '../types';

const text = (v: unknown): string | undefined => {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'val' in (v as object)) return String((v as { val: unknown }).val);
  return String(v);
};

// Fetches an .ics feed and returns upcoming occurrences (recurring events are expanded
// for the next `horizonDays`, because open mics and markets are usually weekly).
export async function fetchIcal(url: string, horizonDays = 60): Promise<RawEvent[]> {
  const data = await ical.async.fromURL(url);
  const now = new Date();
  const horizon = new Date(now.getTime() + horizonDays * 86_400_000);
  const out: RawEvent[] = [];

  for (const item of Object.values(data) as any[]) {
    if (!item || item.type !== 'VEVENT' || !item.start) continue;

    const title = text(item.summary)?.trim();
    if (!title) continue;
    const base = {
      title,
      description: text(item.description)?.trim(),
      locationText: text(item.location)?.trim(),
      url: text(item.url),
    };
    const duration = item.end ? item.end.getTime() - item.start.getTime() : undefined;

    if (item.rrule) {
      const dates: Date[] = item.rrule.between(now, horizon, true);
      for (const d of dates) {
        out.push({
          ...base,
          externalId: `${item.uid}@${d.toISOString()}`,
          startsAt: d,
          endsAt: duration ? new Date(d.getTime() + duration) : undefined,
        });
      }
    } else if (item.start >= now || (item.end && item.end >= now)) {
      if (item.start <= horizon) {
        out.push({ ...base, externalId: String(item.uid), startsAt: item.start, endsAt: item.end });
      }
    }
  }
  return out;
}
