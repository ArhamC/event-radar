import { describe, expect, it } from 'vitest';
import { suggestTags } from '../src/pipeline/tagger';

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
