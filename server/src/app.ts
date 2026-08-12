import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler, notFoundHandler } from './errors';
import { requireAuth } from './auth/guards';
import { authRoutes } from './auth/session';
import { usersRoutes } from './modules/users/routes';
import { leadsRoutes } from './modules/leads/routes';
import { splitRoutes } from './modules/split/routes';
import { syncRoutes } from './modules/sync/routes';
import { adminRoutes } from './modules/admin/routes';
import { clientsRoutes } from './modules/clients/routes';
import { hrRoutes } from './modules/hr/routes';
import { documentsRoutes } from './modules/documents/routes';
import { telephonyRoutes } from './modules/telephony/routes';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, same-origin, curl, etc.)
        if (!origin) return callback(null, true);
        // In development, allow any localhost port
        if (config.nodeEnv !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        // In production, allow configured APP_ORIGIN or any .onrender.com domain
        if (origin === config.appOrigin || origin.endsWith('.onrender.com')) {
          return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again in a few minutes.' } },
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
  });

  app.use('/api', apiLimiter);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'smart-solution-crm', time: new Date().toISOString() });
  });

  app.post('/api/auth/request-otp', authLimiter, authRoutes.requestOtp);
  app.post('/api/auth/verify-otp', authLimiter, authRoutes.verifyOtp);

  app.use('/api/auth', requireAuth, (req, res) => {
    if (req.path === '/me') authRoutes.me(req, res);
    else if (req.path === '/logout') authRoutes.logout(req, res);
    else res.status(404).json({ error: { message: 'Not found' } });
  });

  app.use('/api/admin/users', usersRoutes);
  app.use('/api/admin/split', splitRoutes);
  app.use('/api/admin/sync', syncRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/leads', leadsRoutes);
  app.use('/api/clients', clientsRoutes);
  app.use('/api/hr', hrRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/telephony', telephonyRoutes);

  // In production, serve the built React client SPA bundle
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
