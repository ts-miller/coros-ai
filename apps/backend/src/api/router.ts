import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { encrypt } from '../lib/crypto.js';
import { runActivitySync } from '../sync/ActivitySyncService.js';
import { runHealthMetricSync } from '../sync/HealthMetricSyncService.js';
import { runAiCoaching, getAiPredictions } from '../ai/CoachingService.js';
import { runWorkoutPush } from '../sync/WorkoutPushService.js';
import type { GoalType, RaceDistance, ExperienceLevel } from '../types/coros.js';

const VALID_GOAL_TYPES: GoalType[] = ['RACE', 'BASE_BUILDING', 'JUST_RUN'];
const VALID_RACE_DISTANCES: RaceDistance[] = ['5K', '10K', 'HALF_MARATHON', 'MARATHON', '50K', '50_MILE', '100K', '100_MILE'];
const VALID_EXPERIENCE_LEVELS: ExperienceLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

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

    const existing = await prisma.settings.findFirst();

    const data: Record<string, unknown> = {};
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
          corosEmail: corosEmail!,
          corosPwd: encrypt(corosPassword!),
        },
      });
      ok(res, { id: created.id });
    }
  }),
);

// ─── Goal ─────────────────────────────────────────────────────────────────────

router.get(
  '/goal',
  asyncHandler(async (_req, res) => {
    const goal = await prisma.goal.findFirst();
    ok(res, goal ?? null);
  }),
);

router.post(
  '/goal',
  asyncHandler(async (req, res) => {
    const {
      goalType,
      raceDistance,
      targetTimeSeconds,
      raceDate,
      experienceLevel,
      daysPerWeek,
    } = req.body as {
      goalType?: string;
      raceDistance?: string | null;
      targetTimeSeconds?: number | null;
      raceDate?: string | null;
      experienceLevel?: string;
      daysPerWeek?: number;
    };

    if (!goalType || !VALID_GOAL_TYPES.includes(goalType as GoalType)) {
      return fail(res, 400, `goalType must be one of: ${VALID_GOAL_TYPES.join(', ')}`);
    }
    if (goalType === 'RACE' && (!raceDistance || !VALID_RACE_DISTANCES.includes(raceDistance as RaceDistance))) {
      return fail(res, 400, `raceDistance is required for RACE goals and must be one of: ${VALID_RACE_DISTANCES.join(', ')}`);
    }
    if (raceDistance !== undefined && raceDistance !== null && !VALID_RACE_DISTANCES.includes(raceDistance as RaceDistance)) {
      return fail(res, 400, `raceDistance must be one of: ${VALID_RACE_DISTANCES.join(', ')}`);
    }
    if (!experienceLevel || !VALID_EXPERIENCE_LEVELS.includes(experienceLevel as ExperienceLevel)) {
      return fail(res, 400, `experienceLevel must be one of: ${VALID_EXPERIENCE_LEVELS.join(', ')}`);
    }
    const days = Number(daysPerWeek);
    if (!Number.isInteger(days) || days < 3 || days > 7) {
      return fail(res, 400, 'daysPerWeek must be an integer between 3 and 7');
    }
    if (targetTimeSeconds !== undefined && targetTimeSeconds !== null) {
      if (!Number.isInteger(targetTimeSeconds) || targetTimeSeconds <= 0) {
        return fail(res, 400, 'targetTimeSeconds must be a positive integer');
      }
    }

    const data = {
      goalType: goalType as GoalType,
      raceDistance: (goalType === 'RACE' ? (raceDistance as RaceDistance) : null),
      targetTimeSeconds: targetTimeSeconds ?? null,
      raceDate: raceDate ? new Date(raceDate) : null,
      experienceLevel: experienceLevel as ExperienceLevel,
      daysPerWeek: days,
    };

    const existing = await prisma.goal.findFirst();
    if (existing) {
      const updated = await prisma.goal.update({ where: { id: existing.id }, data });
      ok(res, updated);
    } else {
      const created = await prisma.goal.create({ data });
      ok(res, created);
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
