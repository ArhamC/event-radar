import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

router.get(
  '/events',
  asyncHandler(async (req, res) => {
    const status = z.enum(['pending', 'approved', 'rejected', 'cancelled']).default('pending').parse(req.query.status ?? 'pending');
    const { rows } = await pool.query(
      `SELECT e.id, e.title, e.description, e.starts_at, e.ends_at, e.price_cents, e.source_url, e.status, e.good_for,
              v.name AS venue_name, v.address,
              ST_Y(v.location::geometry) AS lat, ST_X(v.location::geometry) AS lng,
              COALESCE(s.name, 'user submission') AS source,
              ARRAY(SELECT t.name FROM event_tags et JOIN tags t ON t.id = et.tag_id WHERE et.event_id = e.id ORDER BY t.name) AS tags
       FROM events e
       JOIN venues v ON v.id = e.venue_id
       LEFT JOIN sources s ON s.id = e.source_id
       WHERE e.status = $1
       ORDER BY e.created_at DESC
       LIMIT 100`,
      [status]
    );
    res.json({ events: rows });
  })
);

router.patch(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { status } = z.object({ status: z.enum(['approved', 'rejected', 'cancelled']) }).parse(req.body);
    const r = await pool.query('UPDATE events SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
    if (!r.rowCount) throw new HttpError(404, 'Event not found');
    res.json({ id, status });
  })
);

export default router;
