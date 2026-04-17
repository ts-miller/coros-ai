import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { encrypt } from '../lib/crypto.js';
import { runActivitySync } from '../sync/ActivitySyncService.js';
import { runHealthMetricSync } from '../sync/HealthMetricSyncService.js';
import { runAiCoaching, getAiPredictions, validateGoal } from '../ai/CoachingService.js';
import { runWorkoutPush } from '../sync/WorkoutPushService.js';
import { GoalType, GoalStatus, ExperienceLevel } from '@prisma/client';
import { getDateIntDaysAgo, getDateIntDaysAhead } from '../lib/date.js';

export const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown) {
  return res.json({ success: true, data });
}

function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ success: false, error: message });
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[API Error]', message);
      fail(res, 500, message);
    });
  };
}

/**
 * Since this is currently a single-user app without real auth,
 * we use a fixed email to identify the primary user.
 */
async function getOrCreateUser() {
  const email = 'user@example.com';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email },
    });
  }
  return user;
}

// ─── Activities ───────────────────────────────────────────────────────────────

router.get(
  '/activities',
  asyncHandler(async (req, res) => {
    const days = Number(req.query['days'] ?? 30);
    const cutoff = getDateIntDaysAgo(days);

    const activities = await prisma.activity.findMany({
      where: { date: { gte: cutoff } },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        labelId: true,
        date: true,
        sportType: true,
        name: true,
        distance: true,
        totalTime: true,
        avgHr: true,
        maxHr: true,
        avgPace: true,
        trainingLoad: true,
        aerobicEffect: true,
        calories: true,
        syncedAt: true,
      },
    });

    let totalDistance = 0;
    let totalLoad = 0;
    for (const a of activities) {
      totalDistance += a.distance ?? 0;
      totalLoad += (a.trainingLoad as number | null) ?? 0;
    }

    const summary = {
      totalActivities: activities.length,
      totalDistanceKm: +(totalDistance / 1000).toFixed(1),
      avgTrainingLoad: activities.length ? +(totalLoad / activities.length).toFixed(1) : 0,
    };

    ok(res, { activities, summary });
  }),
);

// ─── Health Metrics ───────────────────────────────────────────────────────────

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const days = Number(req.query['days'] ?? 30);
    const cutoff = getDateIntDaysAgo(days);

    const metrics = await prisma.healthMetric.findMany({
      where: { date: { gte: cutoff } },
      orderBy: { date: 'desc' },
    });

    const hasMock = metrics.some((m: { isMock: boolean }) => m.isMock);

    ok(res, {
      metrics,
      mockDataDisclaimer: hasMock
        ? 'Some health metrics are placeholder data. Sleep data from Coros is not yet available through the API.'
        : null,
    });
  }),
);

// ─── Schedule ─────────────────────────────────────────────────────────────────

router.get(
  '/schedule',
  asyncHandler(async (req, res) => {
    const today = getDateIntDaysAgo(0);
    const twoWeeksOut = getDateIntDaysAhead(14);

    const plans = await prisma.workoutPlan.findMany({
      where: { date: { gte: today, lte: twoWeeksOut } },
      orderBy: { date: 'asc' },
    });

    ok(res, plans);
  }),
);

// ─── Predictions ──────────────────────────────────────────────────────────────

router.get(
  '/predictions',
  asyncHandler(async (_req, res) => {
    const predictions = await getAiPredictions();
    ok(res, predictions);
  }),
);

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const user = await getOrCreateUser();
    const settings = await prisma.settings.findUnique({
      where: { userId: user.id },
      select: { corosEmail: true, unitSystem: true },
    });
    ok(res, settings ?? null);
  }),
);

router.post(
  '/settings',
  asyncHandler(async (req, res) => {
    const { corosEmail, corosPassword, unitSystem } = req.body as {
      corosEmail?: string;
      corosPassword?: string;
      unitSystem?: string;
    };

    const user = await getOrCreateUser();
    const existing = await prisma.settings.findUnique({ where: { userId: user.id } });

    const data: any = {};
    if (corosEmail !== undefined) data['corosEmail'] = corosEmail;
    if (corosPassword !== undefined) data['corosPwd'] = encrypt(corosPassword);
    if (unitSystem !== undefined) data['unitSystem'] = unitSystem;

    if (existing) {
      const updated = await prisma.settings.update({ where: { id: existing.id }, data });
      ok(res, { id: updated.id });
    } else {
      if (!corosEmail || !corosPassword) {
        return fail(res, 400, 'corosEmail and corosPassword are required for initial setup');
      }
      const created = await prisma.settings.create({
        data: {
          userId: user.id,
          corosEmail: corosEmail!,
          corosPwd: encrypt(corosPassword!),
          unitSystem: unitSystem || 'metric',
        },
      });
      ok(res, { id: created.id });
    }
  }),
);

// ─── Goals ────────────────────────────────────────────────────────────────────

router.get(
  '/goals',
  asyncHandler(async (_req, res) => {
    const user = await getOrCreateUser();
    const goals = await prisma.goal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    ok(res, goals);
  }),
);

router.post(
  '/goals',
  asyncHandler(async (req, res) => {
    const user = await getOrCreateUser();
    const {
      title,
      type,
      isPrimary,
      raceDistance,
      targetDate,
      targetTimeSeconds,
      experienceLevel,
      trainingDaysPerWeek,
      aiWarningIgnored,
    } = req.body;

    if (!title || !type) {
      return fail(res, 400, 'Title and type are required');
    }

    // "One Captain" Rule: Archive existing primary goal if setting a new one as primary
    if (isPrimary) {
      await prisma.goal.updateMany({
        where: { userId: user.id, isPrimary: true, status: 'ACTIVE' },
        data: { isPrimary: false, status: 'ARCHIVED', archivedReason: 'Replaced by new primary goal' },
      });
    }

    const goal = await prisma.goal.create({
      data: {
        userId: user.id,
        title,
        type: type as GoalType,
        isPrimary: !!isPrimary,
        raceDistance,
        targetDate: targetDate ? new Date(targetDate) : null,
        targetTimeSeconds: targetTimeSeconds ? Number(targetTimeSeconds) : null,
        experienceLevel: (experienceLevel as ExperienceLevel) || 'INTERMEDIATE',
        trainingDaysPerWeek: Number(trainingDaysPerWeek) || 4,
        aiWarningIgnored: !!aiWarningIgnored,
        status: 'ACTIVE',
      },
    });

    ok(res, goal);
  }),
);

router.put(
  '/goals/:id',
  asyncHandler(async (req, res) => {
    const user = await getOrCreateUser();
    const id = req.params['id'] as string;
    const body = req.body;

    const existing = await prisma.goal.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) return fail(res, 404, 'Goal not found');

    // Handle primary goal switch
    if (body.isPrimary && !existing.isPrimary) {
      await prisma.goal.updateMany({
        where: { userId: user.id, isPrimary: true, status: 'ACTIVE', id: { not: id } },
        data: { isPrimary: false, status: 'ARCHIVED', archivedReason: 'Replaced by primary goal promotion' },
      });
    }

    const data: any = { ...body };
    if (data.targetDate) data.targetDate = new Date(data.targetDate);
    if (data.targetTimeSeconds) data.targetTimeSeconds = Number(data.targetTimeSeconds);
    if (data.trainingDaysPerWeek) data.trainingDaysPerWeek = Number(data.trainingDaysPerWeek);

    const updated = await prisma.goal.update({
      where: { id },
      data,
    });

    ok(res, updated);
  }),
);

router.delete(
  '/goals/:id',
  asyncHandler(async (req, res) => {
    const user = await getOrCreateUser();
    const id = req.params['id'] as string;

    // We could either delete or archive. Requirement says ARCHIVED in status enum.
    // Let's mark as archived instead of hard delete if it was active.
    const goal = await prisma.goal.findFirst({ where: { id, userId: user.id } });
    if (!goal) return fail(res, 404, 'Goal not found');

    const updated = await prisma.goal.update({
      where: { id },
      data: { status: 'ARCHIVED', isPrimary: false },
    });

    ok(res, updated);
  }),
);

router.post(
  '/goals/validate',
  asyncHandler(async (req, res) => {
    const result = await validateGoal(req.body);
    ok(res, result);
  }),
);

// ─── Manual Triggers ──────────────────────────────────────────────────────────

router.post(
  '/sync',
  asyncHandler(async (_req, res) => {
    const result = await runActivitySync();
    await runHealthMetricSync();
    ok(res, result);
  }),
);

router.post(
  '/generate',
  asyncHandler(async (_req, res) => {
    const result = await runAiCoaching();
    ok(res, result);
  }),
);

router.post(
  '/push',
  asyncHandler(async (_req, res) => {
    const result = await runWorkoutPush();
    ok(res, result);
  }),
);

// ─── Health check ─────────────────────────────────────────────────────────────

router.get('/ping', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});
