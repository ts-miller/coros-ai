import { corosClient } from '../coros/CorosClient.js';
import { prisma } from '../lib/prisma.js';

/**
 * Returns a YYYYMMDD integer for N days ago.
 */
function daysAgo(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return Number(d.toISOString().slice(0, 10).replace(/-/g, ''));
}

export async function runActivitySync(lookbackDays = 30): Promise<{ synced: number; errors: number }> {
  console.log(`[ActivitySync] Starting sync for last ${lookbackDays} days...`);
  const startDay = daysAgo(lookbackDays);
  const endDay = daysAgo(0);

  const activities = await corosClient.getAllRunningActivities(startDay, endDay);
  console.log(`[ActivitySync] Fetched ${activities.length} running activities from Coros`);

  let synced = 0;
  let errors = 0;

  for (const act of activities) {
    try {
      // Fetch full summary for HR, pace, etc.
      const detail = await corosClient.getActivityDetail(act.labelId, act.sportType);
      const summary = detail?.summary;

      await prisma.activity.upsert({
        where: { labelId: act.labelId },
        create: {
          labelId: act.labelId,
          date: act.date,
          sportType: act.sportType,
          name: act.name,
          distance: act.distance,
          totalTime: act.totalTime,
          avgHr: summary?.avgHr ?? null,
          maxHr: summary?.maxHr ?? null,
          avgPace: summary?.avgPace ?? null,
          trainingLoad: summary?.trainingLoad ?? act.trainingLoad ?? null,
          aerobicEffect: summary?.aerobicEffect ?? null,
          calories: summary?.calories ?? null,
          startTime: BigInt(act.startTime),
          endTime: BigInt(act.endTime),
          rawSummary: summary ? (summary as object) : undefined,
        },
        update: {
          name: act.name,
          distance: act.distance,
          totalTime: act.totalTime,
          avgHr: summary?.avgHr ?? null,
          maxHr: summary?.maxHr ?? null,
          avgPace: summary?.avgPace ?? null,
          trainingLoad: summary?.trainingLoad ?? act.trainingLoad ?? null,
          aerobicEffect: summary?.aerobicEffect ?? null,
          calories: summary?.calories ?? null,
          rawSummary: summary ? (summary as object) : undefined,
          syncedAt: new Date(),
        },
      });
      synced++;
    } catch (err) {
      errors++;
      console.error(`[ActivitySync] Failed to sync activity ${act.labelId}:`, err);
    }
  }

  console.log(`[ActivitySync] Done. synced=${synced}, errors=${errors}`);
  return { synced, errors };
}
