import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { db } from './db.js';
import {
  asyncRoute,
  authenticate,
  roles,
  userSelect,
  token,
  cookieName,
  cookieOptions,
  fail,
  param,
} from './lib.js';
export const authRouter = Router();
const account = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().email().toLowerCase(),
    password: z.string().min(10).max(72),
  })
  .strict();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
authRouter.post(
  '/register',
  limiter,
  asyncRoute(async (req, res) => {
    const data = account.parse(req.body);
    const u = await db.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await bcrypt.hash(data.password, 12),
        role: 'USER',
      },
      select: { ...userSelect, sessionVersion: true },
    });
    res.cookie(cookieName, token(u), { ...cookieOptions(), maxAge: 8 * 3600000 });
    res.status(201).json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }),
);
authRouter.post(
  '/login',
  limiter,
  asyncRoute(async (req, res) => {
    const data = account.pick({ email: true, password: true }).parse(req.body);
    const u = await db.user.findUnique({ where: { email: data.email } });
    if (!u || !(await bcrypt.compare(data.password, u.passwordHash)))
      fail(401, 'Invalid email or password');
    res.cookie(cookieName, token(u), { ...cookieOptions(), maxAge: 8 * 3600000 });
    res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }),
);
authRouter.get(
  '/me',
  authenticate,
  asyncRoute(async (_req, res) => {
    const { sessionVersion, ...user } = res.locals.user;
    res.json({ user });
  }),
);
authRouter.post(
  '/logout',
  authenticate,
  asyncRoute(async (_req, res) => {
    await db.user.update({
      where: { id: res.locals.user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    res.clearCookie(cookieName, cookieOptions());
    res.status(204).end();
  }),
);
export const userRouter = Router();
userRouter.use(authenticate, roles('ADMIN'));
userRouter.get(
  '/',
  asyncRoute(async (_req, res) =>
    res.json(
      await db.user.findMany({ select: userSelect, orderBy: { createdAt: 'desc' }, take: 100 }),
    ),
  ),
);
userRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const { role, ...data } = account.extend({ role: z.enum(['ADMIN', 'USER']) }).parse(req.body);
    res
      .status(201)
      .json(
        await db.user.create({
          data: {
            name: data.name,
            email: data.email,
            passwordHash: await bcrypt.hash(data.password, 12),
            role,
          },
          select: userSelect,
        }),
      );
  }),
);
userRouter.patch(
  '/:id',
  asyncRoute(async (req, res) => {
    if (param(req) === res.locals.user.id) fail(400, 'You cannot change your own role');
    const { role } = z
      .object({ role: z.enum(['ADMIN', 'USER']) })
      .strict()
      .parse(req.body);
    res.json(
      await db.user.update({
        where: { id: param(req) },
        data: { role, sessionVersion: { increment: 1 } },
        select: userSelect,
      }),
    );
  }),
);
