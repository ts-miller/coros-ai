import { prisma } from '../lib/prisma.js';
import { corosWorkoutClient } from '../coros/CorosWorkoutClient.js';
import { AiWorkoutDay } from '../types/coros.js';
import { getDateIntDaysAgo, getDateIntDaysAhead } from '../lib/date.js';

export async function runWorkoutPush(): Promise<{ pushed: number; failed: number }> {
  console.log('[WorkoutSync] Starting full sync of upcoming workouts...');

  const today = getDateIntDaysAgo(0);
  const twoWeeksOut = getDateIntDaysAhead(14);

  // 1. Fetch ALL upcoming workouts (not just pending)
  const plans = await prisma.workoutPlan.findMany({
    where: { date: { gte: today, lte: twoWeeksOut } },
    orderBy: { date: 'asc' },
  });

  if (plans.length === 0) {
    console.log('[WorkoutSync] No upcoming workouts to sync.');
    return { pushed: 0, failed: 0 };
  }

  // 2. Identify date range and clear existing workouts on Coros to prevent stacking
  const minDate = String(today);
  const maxDate = String(twoWeeksOut);

  try {
    console.log(`[WorkoutSync] Cleaning Coros calendar from ${minDate} to ${maxDate}...`);
    const schedule = await corosWorkoutClient.getSchedule(minDate, maxDate);
    const existing = schedule.entities || [];
    const programs = schedule.programs || [];
    
    // Create a set of program IDs that were created by coros-ai
    const corosAiProgramIds = new Set(
      programs.filter(p => p.nickname === 'coros-ai').map(p => p.id)
    );

    // Filter to entities that were created by coros-ai
    const toDelete = existing.filter(e => corosAiProgramIds.has(e.planProgramId));
    
    if (toDelete.length > 0) {
      console.log(`[WorkoutSync] Clearing ${toDelete.length} coros-ai entries from Coros...`);
      await corosWorkoutClient.deleteWorkouts(toDelete.map(e => ({
        id: e.id,
        planProgramId: e.planProgramId,
        planId: e.planId
      })));
    }
  } catch (err) {
    console.warn('[WorkoutSync] Failed to clear existing Coros schedule. Continuing...', err);
  }

  console.log(`[WorkoutSync] Pushing ${plans.length} workout(s) to Coros...`);

  let pushed = 0;
  let failed = 0;

  for (const plan of plans) {
    try {
      const workout = plan.stepsJson as unknown as AiWorkoutDay;

      // Skip pushing Rest days to Coros
      if (workout.type === 'Rest') {
        if (plan.status !== 'SKIPPED') {
          await prisma.workoutPlan.update({
            where: { id: plan.id },
            data: { status: 'SKIPPED' },
          });
        }
        continue;
      }

      const corosWorkoutId = await corosWorkoutClient.createWorkoutOnCalendar(workout);

      await prisma.workoutPlan.update({
        where: { id: plan.id },
        data: { status: 'PUSHED', corosWorkoutId, pushError: null },
      });
      pushed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[WorkoutSync] Failed for plan ${plan.id}:`, message);

      await prisma.workoutPlan.update({
        where: { id: plan.id },
        data: { status: 'FAILED', pushError: message },
      });
      failed++;
    }
  }

  console.log(`[WorkoutSync] Done. pushed=${pushed}, failed=${failed}`);
  return { pushed, failed };
}
