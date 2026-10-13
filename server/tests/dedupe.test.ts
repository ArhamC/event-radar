import { describe, expect, it } from 'vitest';
import { isLikelyDuplicate, normalizeTitle, titleSimilarity } from '../src/pipeline/dedupe';

describe('normalizeTitle', () => {
  it('lowercases, strips punctuation and accents', () => {
    expect(normalizeTitle('  Café   Open-Mic!! ')).toBe('cafe open mic');
  });
});

describe('titleSimilarity', () => {
  it('is 1 for titles that differ only by punctuation or case', () => {
    expect(titleSimilarity('Open Mic Night', 'OPEN MIC NIGHT!')).toBe(1);
  });
  it('ignores stop words', () => {
    expect(titleSimilarity('The Tuesday Open Mic', 'Tuesday Open Mic')).toBe(1);
  });
  it('is high when one title adds a venue name', () => {
    expect(titleSimilarity('Tuesday Open Mic', 'Tuesday Open Mic at The Pub')).toBeCloseTo(0.75);
  });
  it('is 0 for unrelated titles', () => {
    expect(titleSimilarity('Farmers Market', 'Poetry Slam')).toBe(0);
  });
  it('is 0 for empty input', () => {
    expect(titleSimilarity('', 'Poetry Slam')).toBe(0);
  });
});

describe('isLikelyDuplicate', () => {
  const t = new Date('2030-05-01T19:00:00Z');
  it('flags similar titles starting close together', () => {
    expect(
      isLikelyDuplicate(
        { title: 'Open Mic Night', startsAt: t },
        { title: 'Open Mic Night!', startsAt: new Date('2030-05-01T19:30:00Z') }
      )
    ).toBe(true);
  });
  it('does not flag the same title at a very different time', () => {
    expect(
      isLikelyDuplicate(
        { title: 'Open Mic Night', startsAt: t },
        { title: 'Open Mic Night', startsAt: new Date('2030-05-02T19:00:00Z') }
      )
    ).toBe(false);
  });
  it('does not flag different events at the same time', () => {
    expect(
      isLikelyDuplicate({ title: 'Open Mic Night', startsAt: t }, { title: 'Board Game Night', startsAt: t })
    ).toBe(false);
  });
});
