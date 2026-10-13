import { describe, expect, it } from 'vitest';
import { cardToRaw, lplDate, parseLplListing } from '../src/pipeline/sources/lpl';
import { suggestGoodFor } from '../src/pipeline/tagger';

// Trimmed copy of a real card from lpl.ca/whats-on
const card = (slug: string, title: string, day: string, time: string, branch: string, note: string) => `
  <a class="block teaser-card teaser-card--event hover:no-underline bg-accent" href="/events/${slug}" title="${title}">
    <article class="description-link-date-block__description-image relative w-full h-full flex flex-col">
      <div class="teaser-card__text-container relative mx-auto flex-col flex-1 w-full">
        <div class="description-link-date p-10 lg:pl-10 flex flex-col justify-between h-full"> <div>
          <div class="hidden teaser-card__event-date text-15px font-semibold"> <div>${day}</div><div>${time}</div> </div>
          <div class="mt-3"> <div class="uppercase">${branch}</div> </div>
          <div class="mt-2"> <h2 class="text-26px leading-33px">${title}</h2> </div> ${note} </div>
        </div>
      </div>
    </article>
  </a>`;

describe('lplDate', () => {
  it('reads 12-hour times in city time', () => {
    expect(lplDate('October 13, 2026', '09:30 am')?.toISOString()).toBe('2026-10-13T13:30:00.000Z');
    expect(lplDate('October 13, 2026', '12:00 pm')?.toISOString()).toBe('2026-10-13T16:00:00.000Z');
    expect(lplDate('October 13, 2026', '12:15 am')?.toISOString()).toBe('2026-10-13T04:15:00.000Z');
    expect(lplDate('October 13, 2026', 'All day')).toBeNull();
  });
});

describe('parseLplListing', () => {
  const html = `<form>filters</form>
    ${card('masonville-knitting-circle-11', 'Masonville Knitting Circle', 'October 13, 2026', '10:00 am - 11:30 am', 'Masonville Library', 'Drop in')}
    ${card('understanding-aging-brain', 'Understanding an Aging Brain', 'October 13, 2026', '02:00 pm - 03:30 pm', 'East London Library', 'Register')}
    ${card('no-time', 'Book Sale', 'October 14, 2026', 'All day', 'Central Library', 'Drop in')}`;

  it('reads date, time, branch, title and note from each card', () => {
    const cards = parseLplListing(html);
    expect(cards).toHaveLength(2); // the all-day card has no clock time and is skipped
    expect(cards[0]).toMatchObject({ slug: 'masonville-knitting-circle-11', title: 'Masonville Knitting Circle', branch: 'Masonville Library', note: 'Drop in' });
    expect(cards[0].startsAt.toISOString()).toBe('2026-10-13T14:00:00.000Z');
    expect(cards[0].endsAt?.toISOString()).toBe('2026-10-13T15:30:00.000Z');
  });

  it('turns a card into a free event at the branch address, and drop-ins read as solo', () => {
    const raw = cardToRaw(parseLplListing(html)[0]);
    expect(raw).toMatchObject({
      externalId: 'masonville-knitting-circle-11',
      venueName: 'Masonville Library',
      locationText: '30 North Centre Road, London, Ontario',
      priceCents: 0,
      url: 'https://www.lpl.ca/events/masonville-knitting-circle-11',
    });
    expect(suggestGoodFor(raw.title, raw.description)).toBe('solo');
  });
});
