import { pool } from '../db/pool';
import { fetchIcal } from './sources/ical';
import { fetchWestern } from './sources/western';
import { fetchTourismLondon } from './sources/tourismLondon';
import { fetchEventbrite } from './sources/eventbrite';
import { fetchLpl } from './sources/lpl';
import { geocode } from './geocode';
import { isLikelyDuplicate } from './dedupe';
import { suggestGoodFor, suggestTags } from './tagger';
import type { AdapterContext, RawEvent } from './types';

interface Source {
  id: number;
  name: string;
  type: string;
  url: string;
  auto_approve: boolean;
}

// sources.type -> adapter. Each returns upcoming RawEvents; everything after that is shared.
export const ADAPTERS: Record<string, (url: string, ctx: AdapterContext) => Promise<RawEvent[]>> = {
  ical: (url) => fetchIcal(url),
  western: (url) => fetchWestern(url),
  'tourism-london': fetchTourismLondon,
  eventbrite: (url) => fetchEventbrite(url),
  lpl: (url) => fetchLpl(url),
};

interface Counters {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  duplicates: number;
  failed: number;
}

// Find an existing venue (same name within 150m) or create it.
async function findOrCreateVenue(name: string, address: string, lat: number, lng: number): Promise<number> {
  const found = await pool.query(
    `SELECT id FROM venues
     WHERE lower(name) = lower($1)
       AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)::geography, 150)
     LIMIT 1`,
    [name, lng, lat]
  );
  if (found.rows[0]) return found.rows[0].id;
  const created = await pool.query(
    `INSERT INTO venues (name, address, location)
     VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326)::geography)
     RETURNING id`,
    [name, address, lng, lat]
  );
  return created.rows[0].id;
}

// Is there already an event at (or near) this venue, at about this time, with a similar title,
// that did NOT come from this exact source record?
async function isDuplicate(raw: RawEvent, venueId: number, sourceId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT title, starts_at FROM events
     WHERE venue_id = $1
       AND status <> 'rejected'
       AND starts_at BETWEEN $2::timestamptz - interval '2 hours' AND $2::timestamptz + interval '2 hours'
       AND NOT (source_id IS NOT DISTINCT FROM $3 AND external_id = $4)`,
    [venueId, raw.startsAt, sourceId, raw.externalId]
  );
  return rows.some((r) =>
    isLikelyDuplicate({ title: raw.title, startsAt: raw.startsAt }, { title: r.title, startsAt: new Date(r.starts_at) })
  );
}

async function ingestOne(source: Source, raw: RawEvent, c: Counters) {
  if (!raw.locationText && !raw.point) {
    c.skipped++; // no location, can't put it on a map
    return;
  }
  const point = raw.point ?? (raw.locationText ? await geocode(raw.locationText) : null) ?? raw.fallbackPoint;
  if (!point) {
    c.skipped++;
    return;
  }

  // Venue name = first part of "Venue Name, 123 Street, City" unless the adapter knows better
  const venueName = (raw.venueName ?? raw.locationText!.split(',')[0]).trim().slice(0, 120);
  const venueId = await findOrCreateVenue(venueName, raw.locationText ?? venueName, point.lat, point.lng);

  if (await isDuplicate(raw, venueId, source.id)) {
    c.duplicates++;
    return;
  }

  // Idempotent upsert: re-running the pipeline updates rows instead of duplicating them.
  // (xmax = 0 is true only for freshly inserted rows.) Status is NOT overwritten on update,
  // so an admin's approve/reject decision sticks.
  const res = await pool.query(
    `INSERT INTO events
       (title, description, starts_at, ends_at, venue_id, source_id, external_id, source_url, status, good_for, price_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (source_id, external_id) DO UPDATE SET
       title = EXCLUDED.title,
       price_cents = EXCLUDED.price_cents,
       description = EXCLUDED.description,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       venue_id = EXCLUDED.venue_id,
       source_url = EXCLUDED.source_url,
       updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [
      raw.title.slice(0, 120),
      raw.description?.slice(0, 2000) ?? null,
      raw.startsAt,
      raw.endsAt ?? null,
      venueId,
      source.id,
      raw.externalId,
      raw.url ?? null,
      source.auto_approve ? 'approved' : 'pending',
      suggestGoodFor(raw.title, raw.description), // set on insert only; not in the UPDATE list
      raw.priceCents ?? null, // null = unknown, never assume free
    ]
  );

  const { id, inserted } = res.rows[0];
  if (inserted) {
    c.inserted++;
    const tags = suggestTags(raw.title, raw.description);
    if (tags.length) {
      await pool.query(
        `INSERT INTO event_tags (event_id, tag_id) SELECT $1, id FROM tags WHERE name = ANY($2::text[])
         ON CONFLICT DO NOTHING`,
        [id, tags]
      );
    }
  } else {
    c.updated++;
  }
}

async function runSource(source: Source) {
  const run = await pool.query('INSERT INTO pipeline_runs (source_id) VALUES ($1) RETURNING id', [source.id]);
  const runId = run.rows[0].id;
  const c: Counters = { fetched: 0, inserted: 0, updated: 0, skipped: 0, duplicates: 0, failed: 0 };
  let error: string | null = null;

  try {
    const adapter = ADAPTERS[source.type];
    if (!adapter) throw new Error(`Unsupported source type: ${source.type}`);
    // What we already have from this source, so slow adapters can skip unchanged events
    const existing = await pool.query('SELECT external_id, starts_at FROM events WHERE source_id = $1', [source.id]);
    const known = new Map<string, Date>(existing.rows.map((r) => [r.external_id, new Date(r.starts_at)]));
    const events = await adapter(source.url, { known });
    c.fetched = events.length;
    for (const raw of events) {
      try {
        await ingestOne(source, raw, c);
      } catch (err) {
        c.failed++; // one bad event must not kill the whole run
        console.error(`[${source.name}] failed on "${raw.title}":`, (err as Error).message);
      }
    }
  } catch (err) {
    error = (err as Error).message;
    console.error(`[${source.name}] source failed:`, error);
  }

  await pool.query(
    `UPDATE pipeline_runs
     SET finished_at = now(), fetched = $2, inserted = $3, updated = $4, skipped = $5,
         duplicates = $6, failed = $7, error = $8
     WHERE id = $1`,
    [runId, c.fetched, c.inserted, c.updated, c.skipped, c.duplicates, c.failed, error]
  );
  if (!error) await pool.query('UPDATE sources SET last_fetched_at = now() WHERE id = $1', [source.id]);
  console.log(`[${source.name}]`, c, error ? `ERROR: ${error}` : '');
}

// `types` limits the run to some source types (e.g. just 'lpl'); default is every supported type.
export async function runPipeline(types: string[] = Object.keys(ADAPTERS)) {
  const { rows } = await pool.query<Source>(
    `SELECT id, name, type, url, auto_approve FROM sources WHERE type = ANY($1::text[]) ORDER BY id`,
    [types.filter((t) => ADAPTERS[t])]
  );
  if (rows.length === 0) console.log('No sources yet. Add one with: npm run add-source -- "Name" <url>');
  for (const source of rows) await runSource(source); // sequential: keeps geocoding polite
}

// Run directly: `npm run pipeline` (all sources) or `npm run pipeline -- --type=lpl,western`
if (require.main === module) {
  const only = process.argv.find((a) => a.startsWith('--type='))?.slice('--type='.length).split(',');
  runPipeline(only)
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
