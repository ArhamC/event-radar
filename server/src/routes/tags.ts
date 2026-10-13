import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query('SELECT name FROM tags ORDER BY name');
    res.json({ tags: rows.map((r) => r.name) });
  })
);

export default router;
