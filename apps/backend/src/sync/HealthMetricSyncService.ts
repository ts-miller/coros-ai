import { prisma } from '../lib/prisma.js';
import { corosClient } from '../coros/CorosClient.js';

function dateIntToYYYYMMDD(d: number): string {
  const s = String(d);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export async function runHealthMetricSync(): Promise<{ upserted: number }> {
  console.log('[HealthSync] Syncing health metrics from Coros /analyse/query (last ~4 weeks)...');

  let data = null;
  try {
    data = await corosClient.getTrainingAnalysis();
  } catch (err) {
    console.warn('[HealthSync] /analyse/query failed, falling back to no-op:', err);
  }

  if (!data || !data.dayList?.length) {
    console.warn('[HealthSync] No data returned from /analyse/query. Skipping sync.');
    return { upserted: 0 };
  }

  let upserted = 0;

  for (const day of data.dayList) {
    const dateInt = day.happenDay;

    // Only store days where we have at least one useful metric
    if (day.avgSleepHrv === undefined && day.rhr === undefined) continue;

    const payload = {
      hrv: day.avgSleepHrv ?? null,
      restingHr: day.rhr ?? null,
      // sleepDuration is not available from this endpoint
      isMock: false,
    };

    await prisma.healthMetric.upsert({
      where: { date: dateInt },
      create: { date: dateInt, ...payload },
      update: payload,
    });
    upserted++;
  }

  console.log(`[HealthSync] Done. upserted=${upserted} real records from /analyse/query over last ~4 weeks.`);
  return { upserted };
}

