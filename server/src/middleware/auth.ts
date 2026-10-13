import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { HttpError } from './errorHandler';

export interface AuthUser {
  id: number;
  email: string;
  role: 'user' | 'admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Runs on every request: if there's a valid session cookie, attach req.user.
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (token) {
    try {
      const p = jwt.verify(token, config.jwtSecret) as unknown as { sub: number; email: string; role: 'user' | 'admin' };
      req.user = { id: Number(p.sub), email: p.email, role: p.role };
    } catch {
      // expired or tampered token: treat as logged out
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please log in first'));
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please log in first'));
  if (req.user.role !== 'admin') return next(new HttpError(403, 'Admins only'));
  next();
}

export function signSession(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
}
