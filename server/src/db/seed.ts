import { pool } from './pool';
import { config } from '../config';

// Generates SAMPLE events around CENTER_LAT / CENTER_LNG so the UI has something to show.
// Replace these with real events from your area (via the submit form or the pipeline).
// Safe to re-run: it wipes and recreates only its own sample rows.

const M_PER_DEG_LAT = 111_320;
function offset(dxMeters: number, dyMeters: number) {
  const lat = config.center.lat + dyMeters / M_PER_DEG_LAT;
  const lng = config.center.lng + dxMeters / (M_PER_DEG_LAT * Math.cos((config.center.lat * Math.PI) / 180));
  return { lat, lng };
}

const SAMPLE_ADDRESS = 'Sample address (seed data)';

const venues = [
  { name: 'The Back Room Cafe', dx: 300, dy: 200 },
  { name: 'Riverside Park Pavilion', dx: -1200, dy: 600 },
  { name: 'Maple Street Library', dx: 800, dy: -900 },
  { name: 'Community Hall', dx: -500, dy: -1400 },
  { name: 'Corner Record Shop', dx: 100, dy: -300 },
  { name: 'Old Mill Brewery', dx: 2200, dy: 1500 },
  { name: 'Westside Makerspace', dx: -2800, dy: 400 },
  { name: 'Union Courtyard', dx: 1500, dy: -2300 },
];

// [title, venueIndex, dayOffset, startHour, durationHours, priceCents, tags, goodFor]
const events: [string, number, number, number, number, number, string[], 'solo' | 'group' | 'both'][] = [
  ['Open Mic Night', 0, 0, 19, 3, 0, ['music', 'chill', 'creative'], 'both'],
  ['Saturday Farmers Market', 7, 2, 9, 5, 0, ['market', 'outdoors', 'family-friendly'], 'both'],
  ['Silent Reading Hour', 2, 1, 10, 1, 0, ['chill', 'learning'], 'solo'],
  ['Zine Making Workshop', 6, 3, 18, 2, 1500, ['creative', 'learning'], 'solo'],
  ['Vinyl Swap Meet', 4, 4, 12, 4, 0, ['music', 'market', 'social'], 'solo'],
  ['Acoustic Sunday', 5, 5, 16, 3, 0, ['music', 'chill'], 'both'],
  ['Trivia Tuesday', 5, 1, 20, 2, 0, ['social', 'loud'], 'group'],
  ['Sunrise Yoga in the Park', 1, 2, 7, 1, 0, ['outdoors', 'chill'], 'solo'],
  ['Punk Matinee', 3, 6, 15, 4, 1000, ['music', 'loud'], 'both'],
  ['Intro to Soldering', 6, 7, 18, 2, 2000, ['learning', 'creative'], 'solo'],
  ['Board Game Night', 0, 2, 18, 4, 0, ['social', 'chill'], 'group'],
  ['Community Garden Day', 1, 8, 10, 3, 0, ['outdoors', 'social', 'family-friendly'], 'both'],
  ['Poetry Slam', 0, 9, 19, 2, 500, ['creative', 'chill'], 'both'],
  ['Night Market', 7, 10, 17, 5, 0, ['market', 'social', 'loud'], 'group'],
  ['Book Club: Short Stories', 2, 11, 18, 2, 0, ['learning', 'chill'], 'solo'],
  ['Local Bands Showcase', 3, 12, 19, 4, 800, ['music', 'loud'], 'group'],
  ['Kids Art Afternoon', 3, 3, 14, 2, 0, ['family-friendly', 'creative'], 'group'],
  ['Run Club (5k, all paces)', 1, 4, 8, 1, 0, ['outdoors', 'social'], 'solo'],
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(`SELECT id FROM sources WHERE name = 'sample-seed' LIMIT 1`);
    let sourceId: number;
    if (existing.rows[0]) {
      sourceId = existing.rows[0].id;
    } else {
      const created = await client.query(
        `INSERT INTO sources (name, type) VALUES ('sample-seed', 'manual') RETURNING id`
      );
      sourceId = created.rows[0].id;
    }

    await client.query('DELETE FROM events WHERE source_id = $1', [sourceId]);
    await client.query('DELETE FROM venues WHERE address = $1', [SAMPLE_ADDRESS]);

    const venueIds: number[] = [];
    for (const v of venues) {
      const { lat, lng } = offset(v.dx, v.dy);
      const r = await client.query(
        `INSERT INTO venues (name, address, location)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326)::geography)
         RETURNING id`,
        [v.name, SAMPLE_ADDRESS, lng, lat]
      );
      venueIds.push(r.rows[0].id);
    }

    let i = 0;
    for (const [title, vi, dayOffset, hour, dur, price, tags, goodFor] of events) {
      const start = new Date();
      start.setDate(start.getDate() + dayOffset);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + dur * 3_600_000);
      const r = await client.query(
        `INSERT INTO events
           (title, description, starts_at, ends_at, venue_id, price_cents, source_id, external_id, status, good_for)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved', $9) RETURNING id`,
        [title, 'Sample event. Replace with real listings.', start, end, venueIds[vi], price, sourceId, `sample-${i++}`, goodFor]
      );
      await client.query(
        `INSERT INTO event_tags (event_id, tag_id)
         SELECT $1, id FROM tags WHERE name = ANY($2::text[])`,
        [r.rows[0].id, tags]
      );
    }

    await client.query('COMMIT');
    console.log(`seeded ${events.length} sample events around (${config.center.lat}, ${config.center.lng})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
