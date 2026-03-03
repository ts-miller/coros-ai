import cron from 'node-cron';
import { runActivitySync } from '../sync/ActivitySyncService.js';
import { runHealthMetricSync } from '../sync/HealthMetricSyncService.js';
import { runAiCoaching } from '../ai/CoachingService.js';
import { runWorkoutPush } from '../sync/WorkoutPushService.js';

export function startCronJobs(): void {
  // Daily at 02:00: sync activities + health metrics
  cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] Daily sync starting...');
    try {
      await runActivitySync();
      await runHealthMetricSync(30);
      console.log('[Cron] Daily sync complete');
    } catch (err) {
      console.error('[Cron] Daily sync failed:', err);
    }
  });

  // Every Monday at 03:00: generate AI plan then push to Coros
  cron.schedule('0 3 * * 1', async () => {
    console.log('[Cron] Weekly AI plan generation starting...');
    try {
      await runAiCoaching();
      await runWorkoutPush();
      console.log('[Cron] Weekly AI plan generation + push complete');
    } catch (err) {
      console.error('[Cron] Weekly plan failed:', err);
    }
  });

  console.log('[Cron] Jobs registered: daily-sync @ 02:00, weekly-plan @ Mon 03:00');
}
