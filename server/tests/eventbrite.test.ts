import { describe, expect, it } from 'vitest';
import { organizerId, parseEventbrite } from '../src/pipeline/sources/eventbrite';

const NOW = new Date('2026-10-12T12:00:00-04:00');

const event = (over: Record<string, unknown> = {}) => ({
  id: '111',
  name: { text: 'Sew Together ' },
  description: { text: 'Bring a project.' },
  url: 'https://www.eventbrite.ca/e/sew-together-111',
  start: { utc: '2026-10-20T22:00:00Z' },
  end: { utc: '2026-10-21T00:00:00Z' },
  online_event: false,
  is_free: true,
  venue: {
    name: 'Central Library',
    latitude: '42.9836',
    longitude: '-81.2497',
    address: { localized_address_display: '251 Dundas Street, London, ON N6A 6H9' },
  },
  ...over,
});

describe('organizerId', () => {
  it('takes the ID from an organizer page URL or a bare ID', () => {
    expect(organizerId('https://www.eventbrite.ca/o/london-public-library-67405991003')).toBe('67405991003');
    expect(organizerId('https://www.eventbrite.ca/o/london-public-library-67405991003/')).toBe('67405991003');
    expect(organizerId('67405991003')).toBe('67405991003');
    expect(() => organizerId('https://example.org')).toThrow();
  });
});

describe('parseEventbrite', () => {
  it('maps venue coordinates, times, and free events', () => {
    const [e] = parseEventbrite([event()], NOW);
    expect(e).toMatchObject({ externalId: '111', title: 'Sew Together', venueName: 'Central Library', priceCents: 0 });
    expect(e.point).toEqual({ lat: 42.9836, lng: -81.2497 });
    expect(e.startsAt.toISOString()).toBe('2026-10-20T22:00:00.000Z');
  });
  it('skips online events and events far from the city', () => {
    expect(parseEventbrite([event({ online_event: true })], NOW)).toEqual([]);
    const toronto = event({ venue: { name: 'Elsewhere', latitude: '43.6532', longitude: '-79.3832', address: {} } });
    expect(parseEventbrite([toronto], NOW)).toEqual([]);
  });
  it('uses the minimum ticket price when not free, and unknown when missing', () => {
    expect(parseEventbrite([event({ is_free: false, ticket_availability: { minimum_ticket_price: { value: 1500 } } })], NOW)[0].priceCents).toBe(1500);
    expect(parseEventbrite([event({ is_free: false })], NOW)[0].priceCents).toBeNull();
  });
  it('drops past events', () => {
    expect(parseEventbrite([event({ start: { utc: '2026-10-01T22:00:00Z' }, end: { utc: '2026-10-01T23:00:00Z' } })], NOW)).toEqual([]);
  });
});
