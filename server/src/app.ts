import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { authRouter, userRouter } from './auth.js';
import { errors, HttpError, secret } from './lib.js';
import { installRoutes } from './routes.js';
export function createApp() {
  secret();
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: (process.env.CLIENT_URL || 'http://localhost:6003').split(','),
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(
    rateLimit({ windowMs: 60000, limit: 400, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path !== '/api/payments/webhook') {
      const origin = req.get('Origin');
      if (
        origin &&
        !(process.env.CLIENT_URL || 'http://localhost:6003').split(',').includes(origin)
      )
        return next(new HttpError(403, 'Origin not allowed'));
      if (req.get('X-App-Request') !== '1')
        return next(new HttpError(403, 'Request header required'));
    }
    next();
  });
  app.use((req, res, next) => {
    if (req.path === '/api/payments/webhook') return next();
    express.json({ limit: '1mb' })(req, res, next);
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', project: 'flowdesk' }));
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  installRoutes(app);
  app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));
  app.use(errors);
  return app;
}
export const app = createApp();
