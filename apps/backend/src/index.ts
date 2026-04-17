import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { router } from './api/router.js';
import { requireApiKey } from './api/authMiddleware.js';
import { startCronJobs } from './jobs/scheduler.js';
import { prisma } from './lib/prisma.js';

const PORT = process.env.PORT ?? 3000;

async function main() {
  // Verify DB connection
  await prisma.$connect();
  console.log('[DB] Connected to PostgreSQL');

  const app = express();
  
  // CORS Configuration: Default to wildcard in production for homelab ease-of-use
  let origin: string | string[] | boolean;
  const corsEnv = process.env.CORS_ORIGIN;
  
  if (corsEnv === '*') {
    origin = '*';
  } else if (corsEnv) {
    origin = corsEnv.split(',');
    if (origin.length === 1) origin = origin[0];
  } else if (process.env.NODE_ENV === 'production') {
    origin = '*';
  } else {
    origin = ['http://localhost:4200', 'http://coros.localhost:4200'];
  }

  app.use(cors({ origin }));
  app.use(express.json());
  app.use('/api', requireApiKey, router);

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Server] Listening on 0.0.0.0:${PORT}`);
  });

  startCronJobs();
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
