import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { encrypt } from '../lib/crypto.js';
import { runActivitySync } from '../sync/ActivitySyncService.js';
import { runHealthMetricSync } from '../sync/HealthMetricSyncService.js';
import { runAiCoaching, getAiPredictions } from '../ai/CoachingService.js';
import { runWorkoutPush } from '../sync/WorkoutPushService.js';

export const router = Router();

// ─── Helper ───────────────────────────────────────────────────────────────────

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
    const settings = await prisma.settings.findFirst({
      select: { goal: true, goalDate: true, corosEmail: true, unitSystem: true },
    });
    ok(res, settings ?? null);
  }),
);

router.post(
  '/settings',
  asyncHandler(async (req, res) => {
    const { goal, goalDate, corosEmail, corosPassword, unitSystem } = req.body as {
      goal?: string;
      goalDate?: string;
      corosEmail?: string;
      corosPassword?: string;
      unitSystem?: string;
    };

    const existing = await prisma.settings.findFirst();

    const data: Record<string, unknown> = {};
    if (goal !== undefined) data['goal'] = goal;
    if (goalDate !== undefined) data['goalDate'] = goalDate ? new Date(goalDate) : null;
    if (corosEmail !== undefined) data['corosEmail'] = corosEmail;
    if (corosPassword !== undefined) data['corosPwd'] = encrypt(corosPassword);
    if (unitSystem !== undefined) data['unitSystem'] = unitSystem;

    if (existing) {
      const updated = await prisma.settings.update({ where: { id: existing.id }, data });
      ok(res, { id: updated.id, goal: updated.goal, goalDate: updated.goalDate });
    } else {
      if (!corosEmail || !corosPassword) {
        return fail(res, 400, 'corosEmail and corosPassword are required for initial setup');
      }
      const created = await prisma.settings.create({
        data: {
          corosEmail: corosEmail!,
          corosPwd: encrypt(corosPassword!),
          goal: goal ?? 'Base Building',
          goalDate: goalDate ? new Date(goalDate) : null,
        },
      });
      ok(res, { id: created.id, goal: created.goal, goalDate: created.goalDate });
    }
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

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateIntDaysAgo(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return Number(d.toISOString().slice(0, 10).replace(/-/g, ''));
}

function getDateIntDaysAhead(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return Number(d.toISOString().slice(0, 10).replace(/-/g, ''));
}
