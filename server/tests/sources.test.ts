import { describe, expect, it } from 'vitest';
import { parseWestern, resolveWesternLocation } from '../src/pipeline/sources/western';
import { needsFetch, parseCardDate, parseEventIcs, parseListing } from '../src/pipeline/sources/tourismLondon';

const NOW = new Date('2026-10-12T12:00:00-04:00');

describe('resolveWesternLocation', () => {
  it('maps building codes to known campus buildings', () => {
    const r = resolveWesternLocation('WL 252');
    expect(r?.venueName).toBe('Weldon Library');
    expect(r?.point).toBeDefined();
  });
  it('drops online-only events', () => {
    expect(resolveWesternLocation('Zoom ')).toBeNull();
    expect(resolveWesternLocation('Online via Zoom')).toBeNull();
    expect(resolveWesternLocation('Location TBA')).toBeNull();
  });
  it('keeps hybrid events that have a room', () => {
    expect(resolveWesternLocation('FNB 4130 or Zoom Webinar')?.venueName).toBe('FIMS & Nursing Building');
  });
  it('falls back to the campus point for unknown campus rooms', () => {
    const r = resolveWesternLocation('UCC, Room 37');
    expect(r?.point).toBeUndefined();
    expect(r?.fallbackPoint).toBeDefined();
  });
});

describe('parseWestern', () => {
  const base = {
    id: 'abc',
    title: 'Master&apos;s Recital',
    startDate: '2026-10-20T19:30-0400',
    endDate: '2026-10-20T21:00-0400',
    additionDetails: [{ icon: 'fas fa-map-marker-alt', text: 'von Kuster Hall', link: '' }],
    filter4: ['General Public'],
  };
  it('parses public, in-person events', () => {
    const [e] = parseWestern([base], NOW);
    expect(e.title).toBe("Master's Recital");
    expect(e.startsAt.toISOString()).toBe('2026-10-20T23:30:00.000Z');
    expect(e.priceCents).toBe(0);
  });
  it('skips events not open to the public', () => {
    expect(parseWestern([{ ...base, filter4: ['Graduate Students'] }], NOW)).toEqual([]);
  });
  it('treats ticketed events as unknown price', () => {
    const ticketed = { ...base, additionDetails: [...base.additionDetails, { icon: 'fas fa-ticket-alt', text: 'Tickets', link: '' }] };
    expect(parseWestern([ticketed], NOW)[0].priceCents).toBeNull();
  });
});

describe('Tourism London', () => {
  it('reads event cards (slug + date) but not category links', () => {
    const card = (slug: string, when: string) =>
      `<a href="https://www.londontourism.ca/events/${slug}"> <span class="dateChicklet">Oct<br>15</span>
       <img src="x.png"> <div class="description"> <time><strong>${when}</strong></time> <h3>T</h3></div></a>`;
    const html = `<a href="https://www.londontourism.ca/events/comedy">Comedy</a>
      ${card('culture-walk', 'Thursday, October 15, 2026')}
      ${card('culture-walk', 'Thursday, October 15, 2026')}
      ${card('film-fest', 'October 15 - 25, 2026')}`;
    expect(parseListing(html)).toEqual([
      { slug: 'culture-walk', date: '2026-10-15' },
      { slug: 'film-fest', date: '2026-10-15' },
    ]);
  });
  it('parses the start date of card date ranges', () => {
    expect(parseCardDate('October 30 - November 2, 2026')).toBe('2026-10-30');
    expect(parseCardDate('December 30, 2026 - January 2, 2027')).toBe('2026-12-30');
    expect(parseCardDate('Ongoing')).toBeNull();
  });
  it('only fetches new events, or ones in the next 7 days whose date moved', () => {
    const known = new Map([
      ['same', new Date('2026-10-15T19:00:00-04:00')],
      ['moved-soon', new Date('2026-10-16T19:00:00-04:00')],
      ['moved-later', new Date('2026-11-20T19:00:00-04:00')],
    ]);
    expect(needsFetch({ slug: 'brand-new', date: '2026-12-01' }, known, NOW)).toBe(true);
    expect(needsFetch({ slug: 'same', date: '2026-10-15' }, known, NOW)).toBe(false);
    expect(needsFetch({ slug: 'moved-soon', date: '2026-10-17' }, known, NOW)).toBe(true);
    expect(needsFetch({ slug: 'moved-later', date: '2026-11-21' }, known, NOW)).toBe(false);
    expect(needsFetch({ slug: 'same', date: null }, known, NOW)).toBe(false);
  });
  it('parses an event .ics', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      'DTSTART:20261015T180000', 'DTEND:20261015T191500',
      'SUMMARY:Culture Walk: Haunted Histories',
      'LOCATION:Museum London\\, 421 Ridout Street North\\, London\\, Ontario',
      'DESCRIPTION:London&rsquo\\;s most haunted spots',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const e = parseEventIcs('culture-walk', ics, NOW)!;
    expect(e.title).toBe('Culture Walk: Haunted Histories');
    expect(e.locationText).toBe('Museum London, 421 Ridout Street North, London, Ontario');
    expect(e.description).toBe('London’s most haunted spots');
    expect(e.url).toBe('https://www.londontourism.ca/events/culture-walk');
  });
});
