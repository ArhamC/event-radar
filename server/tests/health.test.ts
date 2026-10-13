import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';

describe('API basics (no database needed)', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects event search without coordinates', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(400);
  });

  it('requires login to submit an event', async () => {
    const res = await request(app).post('/api/events').send({});
    expect(res.status).toBe(401);
  });

  it('requires admin for the moderation queue', async () => {
    const res = await request(app).get('/api/admin/events');
    expect(res.status).toBe(401);
  });

  it('validates register input before touching the database', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
  });
});
