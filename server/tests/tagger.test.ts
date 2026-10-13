import { describe, expect, it } from 'vitest';
import { suggestGoodFor, suggestTags } from '../src/pipeline/tagger';

describe('suggestTags', () => {
  it('tags a farmers market in a park', () => {
    const tags = suggestTags('Saturday Farmers Market', 'Fresh produce at the park pavilion');
    expect(tags).toContain('market');
    expect(tags).toContain('outdoors');
  });
  it('matches whole words only ("art" should not match "party")', () => {
    expect(suggestTags('Birthday party')).not.toContain('creative');
  });
  it('returns an empty list when nothing matches', () => {
    expect(suggestTags('Quarterly committee meeting')).toEqual([]);
  });
});

describe('suggestGoodFor', () => {
  it('marks drop-in classes as good to go solo', () => {
    expect(suggestGoodFor('Drop-in pottery class')).toBe('solo');
  });
  it('marks team events as group', () => {
    expect(suggestGoodFor('Trivia night', 'Teams of up to six')).toBe('group');
  });
  it('falls back to both when nothing or everything matches', () => {
    expect(suggestGoodFor('Quarterly committee meeting')).toBe('both');
    expect(suggestGoodFor('Beginners volleyball league')).toBe('both');
  });
});
