import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../db/pool';
import { config } from '../config';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { signSession, type AuthUser } from '../middleware/auth';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const credentials = z.object({
  email: z.string().email().max(200).transform((s) => s.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

function setSession(res: Response, user: AuthUser) {
  res.cookie('token', signSession(user), {
    httpOnly: true,
    // Cross-site cookies (client and API on different domains) need SameSite=None + Secure
    sameSite: config.isProd ? 'none' : 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post(
  '/register',
  limiter,
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const hash = await bcrypt.hash(password, 12);
    const role = config.adminEmail && email === config.adminEmail ? 'admin' : 'user';
    try {
      const { rows } = await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
        [email, hash, role]
      );
      setSession(res, rows[0]);
      res.status(201).json({ user: rows[0] });
    } catch (err: any) {
      if (err.code === '23505') throw new HttpError(409, 'An account with that email already exists');
      throw err;
    }
  })
);

router.post(
  '/login',
  limiter,
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const { rows } = await pool.query('SELECT id, email, role, password_hash FROM users WHERE email = $1', [email]);
    const row = rows[0];
    // Same message for "no such user" and "wrong password" so we don't leak which emails exist
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    const user = { id: row.id, email: row.email, role: row.role };
    setSession(res, user);
    res.json({ user });
  })
);

router.post('/logout', (_req, res) => {
  res.clearCookie('token', { sameSite: config.isProd ? 'none' : 'lax', secure: config.isProd });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user ?? null });
});

export default router;
