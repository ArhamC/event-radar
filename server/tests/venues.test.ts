import { describe, expect, it } from 'vitest';
import { parseSquarespace } from '../src/pipeline/sources/squarespace';
import { extractWixEvents, parseWixEvents } from '../src/pipeline/sources/wixEvents';
import { parseLondonMusicHall } from '../src/pipeline/sources/londonMusicHall';

const NOW = new Date('2026-10-12T12:00:00-04:00');

describe('Squarespace events', () => {
  const nyDefault = { addressTitle: '', addressLine1: '', addressLine2: '', markerLat: 40.72, markerLng: -74.0 };
  const base = { id: 'a1', title: 'Frames Film Series', fullUrl: '/events/frames', startDate: Date.parse('2026-10-15T19:00:00-04:00'), endDate: Date.parse('2026-10-15T21:00:00-04:00'), excerpt: '<p>Monthly &amp; free</p>' };

  it('maps events and ignores the default (New York) location', () => {
    const [e] = parseSquarespace('https://www.honeydipbar.com', [{ ...base, location: nyDefault }], NOW);
    expect(e).toMatchObject({ externalId: 'a1', title: 'Frames Film Series', description: 'Monthly & free', url: 'https://www.honeydipbar.com/events/frames' });
    expect(e.locationText).toBeUndefined(); // falls back to the source's venue
  });
  it('uses a real street address when the event has one', () => {
    const [e] = parseSquarespace('https://x.ca', [{ ...base, location: { ...nyDefault, addressTitle: 'Victoria Park', addressLine1: '509 Clarence St' } }], NOW);
    expect(e).toMatchObject({ venueName: 'Victoria Park', locationText: 'Victoria Park, 509 Clarence St' });
  });
  it('drops past events', () => {
    expect(parseSquarespace('https://x.ca', [{ ...base, startDate: Date.parse('2026-10-01T19:00:00-04:00'), endDate: undefined }], NOW)).toEqual([]);
  });
});

describe('Wix events', () => {
  const event = (id: string, start: string, end: string) => ({
    id, title: 'Astral Jams', slug: `astral-jams-${id}`, status: 1,
    location: { name: 'London', address: '370 Richmond St, London, ON N6A 3C7, Canada', coordinates: { lat: 42.98269, lng: -81.24893 } },
    scheduling: { config: { scheduleTbd: false, startDate: start, endDate: end } },
  });
  const html = `<script>window.x = {"events":[${JSON.stringify(event('e1', '2026-10-15T00:00:00.000Z', '2026-10-15T03:00:00.000Z'))},${JSON.stringify(event('e1', '2026-10-15T00:00:00.000Z', '2026-10-15T03:00:00.000Z'))},${JSON.stringify(event('old', '2026-09-12T19:00:00.000Z', '2026-09-12T22:00:00.000Z'))}],"note":"a } brace in a string"}</script>`;

  it('lifts each embedded event object out of the page once', () => {
    expect(extractWixEvents(html).map((e) => e.id)).toEqual(['e1', 'old']);
  });
  it('maps upcoming events with their coordinates and event page', () => {
    const evs = parseWixEvents('https://www.richmondtavern.ca/upcoming-events', extractWixEvents(html), NOW);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ externalId: 'e1', point: { lat: 42.98269, lng: -81.24893 }, url: 'https://www.richmondtavern.ca/event-details/astral-jams-e1' });
    expect(evs[0].venueName).toBeUndefined(); // Wix calls it "London"; the source's venue name is used
  });
});

describe('London Music Hall', () => {
  const card = (title: string, slug: string, date: string, show: string, venue: string, supports = '') => `
    <div class="event"> <div class="event-left clearfix"> <div class="event-info"> <div class="topline">PRESENTS</div>
      <h2> <a role="link" title="${title} - ${date}${show}" href="https://londonmusichall.com/events/${slug}/">${title}</a> </h2>
      <div class="supports"> <a role="link" href="https://londonmusichall.com/events/${slug}/"> ${supports} </a> </div>
      <div class="date">${date}</div>
      <div class="times"> Doors: 7:00 PM / <span class="show">Show: ${show}</span> </div>
      <div class="age-restrictions">19+ Event</div>
      <div class="price">${venue}</div> </div> </div> </div>`;
  const html = card('THE JAILBIRDS', 'the-jailbirds', 'October 18, 2026', '8:00 PM', 'VENUE: RUM RUNNERS', 'W/ ONE WAY STREETS') +
    card('Tracy &#038; Martina', 'tracy-martina', 'October 17, 2026', '8:00 PM', 'VENUE: LONDON MUSIC HALL') +
    card('Old Show', 'old', 'October 1, 2026', '8:00 PM', 'VENUE: LONDON MUSIC HALL');

  it('reads each card, picks the right room, and skips past shows', () => {
    const evs = parseLondonMusicHall(html, NOW);
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ title: 'THE JAILBIRDS', venueName: 'Rum Runners', description: 'W/ ONE WAY STREETS. 19+ Event', priceCents: null });
    expect(evs[0].startsAt.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(evs[1]).toMatchObject({ title: 'Tracy & Martina', venueName: 'London Music Hall', locationText: '185 Queens Avenue, London, Ontario' });
  });
});
