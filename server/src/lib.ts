import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export const userSelect = { id: true, name: true, email: true, role: true, createdAt: true };
export function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  return s;
}
export const cookieName = 'flowdesk_session';
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: (process.env.COOKIE_SAME_SITE || 'lax') as 'lax' | 'none' | 'strict',
    path: '/',
  };
}
export function token(user: { id: string; sessionVersion: number }) {
  return jwt.sign({ ver: user.sessionVersion }, secret(), {
    subject: user.id,
    expiresIn: '8h',
    algorithm: 'HS256',
  });
}
export async function identity(raw: string) {
  try {
    const p = jwt.verify(raw, secret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
    const u = await db.user.findUnique({
      where: { id: p.sub },
      select: { ...userSelect, sessionVersion: true },
    });
    if (!u || u.sessionVersion !== p.ver) fail(401, 'Session expired');
    return u;
  } catch {
    return fail(401, 'Invalid or expired session');
  }
}
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve()
    .then(async () => {
      const raw = req.cookies?.[cookieName] || req.headers.authorization?.replace(/^Bearer /, '');
      if (!raw) fail(401, 'Sign in required');
      res.locals.user = await identity(raw);
      next();
    })
    .catch(next);
};
export const roles =
  (...allowed: string[]) =>
  (_req: Request, res: Response, next: NextFunction) => {
    if (!allowed.includes(res.locals.user.role))
      return next(new HttpError(403, 'Insufficient permissions'));
    next();
  };
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export function pagination(req: Request) {
  const { page, limit } = pageSchema.parse(req.query);
  return { page, limit, skip: (page - 1) * limit };
}
export function param(req: Request, key = 'id') {
  return String(req.params[key]);
}
export function errors(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof z.ZodError)
    return res.status(400).json({ message: 'Validation failed', issues: err.flatten() });
  if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
  const e = err as { code?: string; name?: string };
  if (e.code === 'P2002') return res.status(409).json({ message: 'This record already exists' });
  if (e.code === 'P2025') return res.status(404).json({ message: 'Record not found' });
  if (e.code === 'P2003') return res.status(409).json({ message: 'Record is still referenced' });
  if (e.name === 'MulterError') return res.status(400).json({ message: 'Upload exceeds limits' });
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error' });
}
export async function transaction<T>(
  fn: (tx: import('@prisma/client').Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 4; i++) {
    try {
      return await db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2034' || i === 3) throw e;
    }
  }
  throw new Error('Transaction failed');
}
