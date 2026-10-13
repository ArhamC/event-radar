import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

const router = Router();

const listQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(100).max(100_000).default(10_000), // meters
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  tags: z.string().max(200).optional(), // comma-separated vibes, matches ANY
  free: z.enum(['true', 'false']).optional(),
  goodFor: z.enum(['solo', 'group']).optional(), // 'both' events match either
  q: z.string().max(100).optional(),
});

// Shared SELECT list. Geography -> lat/lng via geometry cast.
const EVENT_COLUMNS = `
  e.id, e.title, e.description, e.starts_at, e.ends_at, e.price_cents, e.source_url, e.good_for,
  v.name AS venue_name, v.address,
  ST_Y(v.location::geometry) AS lat,
  ST_X(v.location::geometry) AS lng,
  ARRAY(
    SELECT t.name FROM event_tags et JOIN tags t ON t.id = et.tag_id
    WHERE et.event_id = e.id ORDER BY t.name
  ) AS tags`;

// ---- The headline query: radius + date + vibe filtering ----
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const from = q.from ?? new Date();
    const to = q.to ?? new Date(Date.now() + 30 * 24 * 3600 * 1000);

    const params: unknown[] = [q.lng, q.lat, q.radius, from, to];
    const where: string[] = [
      `e.status = 'approved'`,
      `ST_DWithin(v.location, pt.g, $3)`, // uses the GiST index
      // still counts if it has started but not ended yet
      `COALESCE(e.ends_at, e.starts_at + interval '3 hours') >= $4`,
      `e.starts_at <= $5`,
    ];

    if (q.tags) {
      const names = q.tags.split(',').map((s) => s.trim()).filter(Boolean);
      params.push(names);
      where.push(`EXISTS (
        SELECT 1 FROM event_tags x JOIN tags tt ON tt.id = x.tag_id
        WHERE x.event_id = e.id AND tt.name = ANY($${params.length}::text[]))`);
    }
    if (q.free === 'true') where.push('e.price_cents = 0');
    if (q.goodFor) {
      params.push(q.goodFor);
      where.push(`e.good_for IN ($${params.length}, 'both')`);
    }
    if (q.q) {
      params.push(`%${q.q.replace(/[%_]/g, '')}%`);
      where.push(`(e.title ILIKE $${params.length} OR v.name ILIKE $${params.length})`);
    }

    let favSelect = 'false AS is_favorite';
    if (req.user) {
      params.push(req.user.id);
      favSelect = `EXISTS (SELECT 1 FROM favorites f WHERE f.event_id = e.id AND f.user_id = $${params.length}) AS is_favorite`;
    }

    const sql = `
      WITH pt AS (SELECT ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography AS g)
      SELECT ${EVENT_COLUMNS},
             ST_Distance(v.location, pt.g) AS distance_m,
             ${favSelect}
      FROM pt
      CROSS JOIN events e
      JOIN venues v ON v.id = e.venue_id
      WHERE ${where.join('\n        AND ')}
      ORDER BY e.starts_at
      LIMIT 200`;

    const { rows } = await pool.query(sql, params);
    res.json({ events: rows });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query(
      `SELECT ${EVENT_COLUMNS} FROM events e JOIN venues v ON v.id = e.venue_id
       WHERE e.id = $1 AND e.status = 'approved'`,
      [id]
    );
    if (!rows[0]) throw new HttpError(404, 'Event not found');
    res.json({ event: rows[0] });
  })
);

const createBody = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    priceCents: z.number().int().min(0).max(100_000).default(0),
    sourceUrl: z.string().url().max(500).optional(),
    venue: z.object({
      name: z.string().trim().min(2).max(120),
      address: z.string().trim().max(200).optional(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    }),
    tags: z.array(z.string().max(40)).max(6).default([]),
    goodFor: z.enum(['solo', 'group', 'both']).default('both'),
  })
  .refine((b) => !b.endsAt || b.endsAt > b.startsAt, {
    message: 'End time must be after the start time',
    path: ['endsAt'],
  })
  .refine((b) => b.startsAt.getTime() > Date.now() - 3600 * 1000, {
    message: 'Start time is in the past',
    path: ['startsAt'],
  });

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const b = createBody.parse(req.body);
    // Admins publish directly. Everyone else goes into the moderation queue.
    const status = req.user!.role === 'admin' ? 'approved' : 'pending';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const venue = await client.query(
        `INSERT INTO venues (name, address, location)
         VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326)::geography)
         RETURNING id`,
        [b.venue.name, b.venue.address ?? null, b.venue.lng, b.venue.lat]
      );
      const ev = await client.query(
        `INSERT INTO events (title, description, starts_at, ends_at, venue_id, price_cents, source_url, status, created_by, good_for)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [b.title, b.description ?? null, b.startsAt, b.endsAt ?? null, venue.rows[0].id, b.priceCents, b.sourceUrl ?? null, status, req.user!.id, b.goodFor]
      );
      if (b.tags.length) {
        await client.query(
          `INSERT INTO event_tags (event_id, tag_id) SELECT $1, id FROM tags WHERE name = ANY($2::text[])`,
          [ev.rows[0].id, b.tags]
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ id: ev.rows[0].id, status });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  '/:id/favorite',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const del = await pool.query('DELETE FROM favorites WHERE user_id = $1 AND event_id = $2', [req.user!.id, id]);
    if (del.rowCount) return res.json({ favorite: false });
    try {
      await pool.query('INSERT INTO favorites (user_id, event_id) VALUES ($1, $2)', [req.user!.id, id]);
    } catch (err: any) {
      if (err.code === '23503') throw new HttpError(404, 'Event not found');
      throw err;
    }
    res.json({ favorite: true });
  })
);

export default router;
