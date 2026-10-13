import { describe, expect, it } from 'vitest';
import { isChildrensReading } from '../src/pipeline/filters';

describe('isChildrensReading', () => {
  it.each([
    'Storytime (Ages 1+)',
    'Halloween Storytime (Family)',
    'STEAM Storytime (Ages 2+)',
    'Books for Babies (from birth)',
    'Water Babies: Story and Song (Ages 0-18 months)',
    'Dog Tales (Ages 7-13)',
    'Masonville Tween Book Club (Ages 10+)',
    'Pond Mills Tween Book Club (Ages 11-13)',
    'Kids Book Club',
  ])('excludes "%s"', (title) => {
    expect(isChildrensReading(title)).toBe(true);
  });

  it.each([
    'Central Book Club',
    'Gay Guys Book Club',
    'Science Fiction Book Club',
    'Queer Intersections: Read the Rainbow Book Club',
    'Adult Literacy',
    'English Reading Group (Intermediate)',
    'Author Reading: Casey Lyall',
    'Antler River Poetry Readings',
    'Book Club: Short Stories',
    'Scrabble Club (Ages 16+)',
    'Chess for Kids (Ages 6+)', // kids, but not reading
  ])('keeps "%s"', (title) => {
    expect(isChildrensReading(title)).toBe(false);
  });

  it("excludes anything held at the Children's Library", () => {
    expect(isChildrensReading('Craft Afternoon', "Children's Library")).toBe(true);
  });
});
