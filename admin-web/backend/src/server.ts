'use strict';
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import pino from 'pino';
import jwt from 'jsonwebtoken';

const { Pool } = require('pg');

const log = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

const PORT       = Number(process.env.PORT || 3002);
const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var required');

// Flyway runs migrations before this process starts (docker-compose dependency).
// Pool connects to whatever schema Flyway has already applied.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'no token' }); return; }
  try {
    (req as any).user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

import { handleMultiSafepayWebhook, createBillingRouter } from './routes/billing';
import { createGdprRouter }          from './routes/gdpr';
import { createLegalRouter }         from './routes/legal';
import { createPublicFlagsRouter, createAdminFlagsRouter }       from './routes/flags';
import { createPublicWaitlistRouter, createAdminWaitlistRouter }  from './routes/waitlist';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use((req, _res, next) => { log.debug({ method: req.method, url: req.url }); next(); });

const ALLOWED_ORIGIN = process.env.ADMIN_ALLOWED_ORIGIN || '';
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  next();
});
app.options('*', (_req, res) => res.sendStatus(204));

app.use((req, _res, next) => { (req as any).pool = pool; next(); });

app.get('/api/mwt/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

// MSP webhook — public, HMAC-verified inside handler
app.post('/api/mwt/billing/webhook/multisafepay', handleMultiSafepayWebhook);

// Public app-facing (called by Tauri client, no auth)
app.use('/api/mwt/flags',    createPublicFlagsRouter(pool));
app.use('/api/mwt/waitlist', createPublicWaitlistRouter(pool));

// Protected admin routes
app.use('/api/mwt/billing',        requireAuth, createBillingRouter(pool));
app.use('/api/mwt/admin/flags',    requireAuth, createAdminFlagsRouter(pool));
app.use('/api/mwt/admin/waitlist', requireAuth, createAdminWaitlistRouter(pool));
app.use('/api/mwt/gdpr',           createGdprRouter(pool));
app.use('/api/mwt/legal',          createLegalRouter(pool));

const FRONTEND = path.join(__dirname, '../../frontend');
app.use(express.static(FRONTEND));
app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  log.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'internal server error' });
});

pool.connect()
  .then((c: any) => { c.release(); log.info('db connected'); })
  .catch((err: any) => { log.error({ err }, 'db connection failed'); process.exit(1); });

app.listen(PORT, () => log.info(`mwt-admin listening on :${PORT}`));
