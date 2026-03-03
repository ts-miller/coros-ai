import { prisma } from '../lib/prisma.js';

/**
 * Generates mock health metrics when real Coros health endpoints are unavailable.
 *
 * NOTE: Coros does not currently expose sleep/HRV data through any known
 * reverse-engineered API endpoint. When a real endpoint is discovered, replace
 * `generateMockMetric` with actual API calls. All mock records are flagged with
 * `isMock: true` so the UI can display a disclaimer to the user.
 */

function randBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function generateMockMetric(dateInt: number) {
  return {
    sleepDuration: randBetween(5.5, 8.5),   // hours
    restingHr: Math.round(randBetween(44, 58)), // bpm
    hrv: randBetween(35, 75),                 // ms
    isMock: true,
  };
}

function daysAgo(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return Number(d.toISOString().slice(0, 10).replace(/-/g, ''));
}

function dateIntToYYYYMMDD(d: number): string {
  const s = String(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export async function runHealthMetricSync(lookbackDays = 30): Promise<{ upserted: number }> {
  console.log(`[HealthSync] Syncing health metrics for last ${lookbackDays} days (mock mode)...`);

  let upserted = 0;

  for (let i = 0; i < lookbackDays; i++) {
    const dateInt = daysAgo(i);

    // Skip if we already have a real metric for this date
    const existing = await prisma.healthMetric.findUnique({ where: { date: dateInt } });
    if (existing && !existing.isMock) {
      continue; // real data present, skip
    }

    const mock = generateMockMetric(dateInt);

    await prisma.healthMetric.upsert({
      where: { date: dateInt },
      create: { date: dateInt, ...mock },
      update: mock,
    });
    upserted++;
  }

  console.log(`[HealthSync] Done. upserted=${upserted}`);
  return { upserted };
}
