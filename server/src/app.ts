import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { pool } from './db/pool';
import { attachUser } from './middleware/auth';
import { asyncHandler, errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import eventRoutes from './routes/events';
import tagRoutes from './routes/tags';
import adminRoutes from './routes/admin';

export const app = express();

app.set('trust proxy', 1); // needed for secure cookies behind Render/Railway/Fly proxies
app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get(
  '/api/health/db',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query('SELECT PostGIS_Version() AS postgis');
    res.json({ ok: true, postgis: rows[0].postgis });
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);
