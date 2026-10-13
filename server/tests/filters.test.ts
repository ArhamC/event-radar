import { describe, expect, it } from 'vitest';
import { isForKids } from '../src/pipeline/filters';

describe('isForKids', () => {
  it.each([
    // children's reading
    'Storytime (Ages 1+)',
    'Halloween Storytime (Family)',
    'Books for Babies (from birth)',
    'Water Babies: Story and Song (Ages 0-18 months)',
    'Dog Tales (Ages 7-13)',
    'Masonville Tween Book Club (Ages 10+)',
    'Book Club with a Baby (from birth)',
    // other kids' programs
    'EarlyON Playgroup (Ages birth-6)',
    'Shared Beginnings (Ages birth - 6)',
    'Chess for Kids (Ages 6+)',
    'Chess for Tweens (Ages 10-14)',
    'Beacock Gaming Room (Ages 8-14)',
    'The BeaHive (Ages 8-12)',
    'Build It! (Ages 4+)',
    'Jurassic Survival Challenge (Age 8+)',
    "Maker's Club (Ages 10+)",
    'Maker’s Club (Tween): Pony Bead Keychains',
    'Make and Play (Family)',
    'Family Movie Mondays',
    'Toddler Art (Ages 2+)',
    'Mini Picassos (Ages 2-5)',
    'Halloween Sensory Play Lab (6-18 months)',
    'Light Up at the Library Playgroup',
    'Kids Art Afternoon',
  ])('excludes "%s"', (title) => {
    expect(isForKids(title)).toBe(true);
  });

  it.each([
    // teens
    'Dungeons and Dragons: Bostwick Campaign (Teen)',
    'Teen Drop-In',
    "Maker's Club: Dino Eye Sculpting (Teens)",
    'Make and Watch: Jurassic Park (Teen)',
    'Job Search Support Café (Teen)',
    'Art-Tech Hub (Ages 11+)',
    // adults
    'Dungeons and Dragons: Central Campaign (Adult)',
    'Scrabble Club (Ages 16+)',
    'Seniors Gathering (Ages 55+)',
    'Central Book Club',
    'Queer Intersections: Read the Rainbow Book Club',
    'Adult Literacy',
    'English Reading Group (Intermediate)',
    'Author Reading: Casey Lyall',
    'Book Club: Short Stories',
    'Saturday Farmers Market',
  ])('keeps "%s"', (title) => {
    expect(isForKids(title)).toBe(false);
  });

  it("excludes anything held at the Children's Library", () => {
    expect(isForKids('Craft Afternoon', "Children's Library")).toBe(true);
  });
});
