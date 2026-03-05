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
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200' }));
  app.use(express.json());
  app.use('/api', requireApiKey, router);

  app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });

  startCronJobs();
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
