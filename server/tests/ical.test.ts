import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchIcal } from '../src/pipeline/sources/ical';

// Serves a small .ics feed from a local HTTP server, so the adapter is tested end to end
// (fetch + parse + recurrence expansion) without depending on the internet.

const DAY = 86_400_000;
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const now = Date.now();
const oneOff = new Date(now + 3 * DAY);
const weeklyFirst = new Date(now - 14 * DAY); // started in the past, keeps repeating

const feed = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//side-street//test//EN',
  'BEGIN:VEVENT',
  'UID:one-off@test',
  `DTSTART:${icsDate(oneOff)}`,
  `DTEND:${icsDate(new Date(oneOff.getTime() + 2 * 3_600_000))}`,
  'SUMMARY:Poetry Night',
  'LOCATION:Central Library\\, 251 Dundas St\\, London ON',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:weekly@test',
  `DTSTART:${icsDate(weeklyFirst)}`,
  `DTEND:${icsDate(new Date(weeklyFirst.getTime() + 3_600_000))}`,
  'RRULE:FREQ=WEEKLY',
  'SUMMARY:Weekly Open Mic',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:past@test',
  'DTSTART:20200101T190000Z',
  'DTEND:20200101T200000Z',
  'SUMMARY:Long gone',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

let server: http.Server;
let url: string;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/calendar');
    res.end(feed);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}/events.ics`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('fetchIcal', () => {
  it('returns a one-off upcoming event with its location', async () => {
    const events = await fetchIcal(url);
    const poetry = events.find((e) => e.externalId === 'one-off@test');
    expect(poetry).toBeDefined();
    expect(poetry!.title).toBe('Poetry Night');
    expect(poetry!.locationText).toBe('Central Library, 251 Dundas St, London ON');
    expect(poetry!.startsAt.getTime()).toBe(Math.floor(oneOff.getTime() / 1000) * 1000);
    expect(poetry!.endsAt!.getTime() - poetry!.startsAt.getTime()).toBe(2 * 3_600_000);
  });

  it('expands a weekly event into future occurrences with unique ids', async () => {
    const events = await fetchIcal(url, 60);
    const weekly = events.filter((e) => e.title === 'Weekly Open Mic');
    // 60 days ahead holds 8 or 9 weekly occurrences depending on today's date
    expect(weekly.length).toBeGreaterThanOrEqual(8);
    expect(weekly.length).toBeLessThanOrEqual(9);
    expect(new Set(weekly.map((e) => e.externalId)).size).toBe(weekly.length);
    for (const e of weekly) {
      expect(e.startsAt.getTime()).toBeGreaterThanOrEqual(now - 1000);
      expect(e.endsAt!.getTime() - e.startsAt.getTime()).toBe(3_600_000);
    }
  });

  it('drops events that are already over', async () => {
    const events = await fetchIcal(url);
    expect(events.some((e) => e.title === 'Long gone')).toBe(false);
  });
});
