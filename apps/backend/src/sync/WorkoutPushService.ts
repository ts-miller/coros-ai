import { prisma } from '../lib/prisma.js';
import { corosWorkoutClient } from '../coros/CorosWorkoutClient.js';
import { AiWorkoutDay } from '../types/coros.js';

export async function runWorkoutPush(): Promise<{ pushed: number; failed: number }> {
  console.log('[WorkoutPush] Starting push of PENDING workouts...');

  const pending = await prisma.workoutPlan.findMany({
    where: { status: 'PENDING' },
    orderBy: { date: 'asc' },
  });

  console.log(`[WorkoutPush] Found ${pending.length} pending workout(s)`);

  let pushed = 0;
  let failed = 0;

  for (const plan of pending) {
    try {
      const workout = plan.stepsJson as unknown as AiWorkoutDay;

      const corosWorkoutId = await corosWorkoutClient.createWorkout(workout);

      await prisma.workoutPlan.update({
        where: { id: plan.id },
        data: { status: 'PUSHED', corosWorkoutId, pushError: null },
      });
      pushed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[WorkoutPush] Failed for plan ${plan.id}:`, message);

      await prisma.workoutPlan.update({
        where: { id: plan.id },
        data: { status: 'FAILED', pushError: message },
      });
      failed++;
    }
  }

  console.log(`[WorkoutPush] Done. pushed=${pushed}, failed=${failed}`);
  return { pushed, failed };
}
