import { GoogleGenAI, Type } from '@google/genai';
import { prisma } from '../lib/prisma.js';

// ─── Strongly-typed shapes for the Prisma selects used in runAiCoaching ──────

interface ActivityRow {
  date: number;
  sportType: number;
  name: string;
  distance: number;
  totalTime: number;
  avgHr: number | null;
  maxHr: number | null;
  avgPace: number | null;
  trainingLoad: number | null;
  aerobicEffect: number | null;
  calories: number | null;
}

interface HealthMetricRow {
  date: number;
  restingHr: number | null;
  hrv: number | null;
  isMock: boolean;
}

// ─── JSON Schema for the 7-day plan ──────────────────────────────────────────

const WORKOUT_STEP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    stepType: { type: Type.STRING },
    duration: { type: Type.NUMBER },
    distance: { type: Type.NUMBER },
    targetPace: { type: Type.NUMBER },
    targetHrZone: { type: Type.NUMBER },
    reps: { type: Type.NUMBER },
    notes: { type: Type.STRING },
  },
  required: ['stepType'],
};

const WORKOUT_DAY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    date: { type: Type.STRING },
    title: { type: Type.STRING },
    type: { type: Type.STRING },
    warmup: { type: Type.ARRAY, items: WORKOUT_STEP_SCHEMA },
    mainSet: { type: Type.ARRAY, items: WORKOUT_STEP_SCHEMA },
    cooldown: { type: Type.ARRAY, items: WORKOUT_STEP_SCHEMA },
    targetPaceMin: { type: Type.NUMBER },
    targetHrZone: { type: Type.NUMBER },
    estimatedDistance: { type: Type.NUMBER },
    notes: { type: Type.STRING },
  },
  required: ['date', 'title', 'type', 'warmup', 'mainSet', 'cooldown', 'notes'],
};

const PLAN_SCHEMA = {
  type: Type.ARRAY,
  items: WORKOUT_DAY_SCHEMA,
};

// ─── JSON Schema for Goal Validation ──────────────────────────────────────────

const GOAL_VALIDATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isAttainable: { type: Type.BOOLEAN },
    flagType: { type: Type.STRING, enum: ['VOLUME', 'PACE', 'BOTH', 'NONE'] },
    warningMessage: { type: Type.STRING },
    recommendation: { type: Type.STRING },
  },
  required: ['isAttainable', 'flagType', 'warningMessage', 'recommendation'],
};

// ─── JSON Schema for the combined output (Progress + Plan) ───────────────────

const COACHING_OUTPUT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    progressStatus: { type: Type.STRING, enum: ['ON_TRACK', 'FALLING_BEHIND', 'AHEAD'] },
    progressNotes: { type: Type.STRING },
    plan: {
      type: Type.ARRAY,
      items: WORKOUT_DAY_SCHEMA,
    },
  },
  required: ['progressStatus', 'progressNotes', 'plan'],
};

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are an expert IAAF-certified running coach with 20 years of experience coaching athletes from beginners to sub-elite. You specialise in evidence-based periodisation, progressive overload, and injury prevention.

You will be given a JSON object containing:
- "primaryGoal": the main structured goal steerining the training.
- "secondaryGoals": tune-up races or minor goals acting as schedule constraints.
- "hrvContext": pre-computed HRV and resting HR readiness signals.
- "activities": an array of recent training activities.
- "healthMetrics": an array of daily health data.

────────────────────────────────────────────────────────────────────────────────
PHASE 1: PROGRESS EVALUATION
────────────────────────────────────────────────────────────────────────────────
Before generating the plan, evaluate the athlete's progress against the primaryGoal over the last 14 days of "activities".
Compare actual completion, volume, and paces hit against what is required for the goal distance and target date.
- ON_TRACK: Meeting volume targets, hitting required paces, good recovery.
- FALLING_BEHIND: Missed key workouts (long runs), significantly slower paces than required, or poor recovery (tanking HRV).
- AHEAD: Completing all workouts with ease, paces are faster than target race pace with low heart rate.

Output a progressStatus and a brief progressNotes explanation.

────────────────────────────────────────────────────────────────────────────────
PHASE 2: MACRO-CYCLE POSITIONING (for the primaryGoal)
────────────────────────────────────────────────────────────────────────────────
The goal.type field will be:
  RACE / PACE / DISTANCE — athlete has a specific target:
    - Use weeksUntilRace to determine phase:
        * >12 weeks: Base phase — high volume, zones 1–2, strides only.
        * 8–12 weeks: Build phase — introduce tempo (zone 3), hills, threshold.
        * 3–8 weeks: Peak phase — race-specific paces, VO2max intervals.
        * 1–3 weeks: Taper phase — reduce volume 30-50%, maintain intensity.
    - If no targetDate, default to Base Phase.
  BASE_BUILDING / JUST_RUN:
    - Locked in Base Phase indefinitely. Focus on aerobic engine.

────────────────────────────────────────────────────────────────────────────────
PHASE 3: MICRO-CYCLE GENERATION (7-Day Plan)
────────────────────────────────────────────────────────────────────────────────
1. Generate a COMPLETE 7-day schedule starting from tomorrow.
2. Schedule exactly goal.trainingDaysPerWeek running days.
3. For all other days in the 7-day period, schedule a "Rest" day.
4. Incorporate secondaryGoals: If a tune-up race exists this week, prioritize it. Schedule a rest/shakeout day before and make the race the "long run" for that week.
5. 80/20 principle: 80% easy, 20% hard. Never two hard sessions back-to-back.
6. Schedule stability: Avoid unnecessary shuffling of established routines unless physiological signals (HRV) or missed workouts require it.
7. Intensity Targets:
   - For "Easy Run", "Recovery Run", and "Long Run": Use targetHrZone (1-5). Avoid targetPace unless it is a "Steady" run.
   - For "Intervals", "Tempo Run", and "VO2max": Use targetPace (seconds per km).
   - For "Rest": No targets.
8. All paces in seconds per km. All distances in metres.
9. Respond ONLY with the JSON object containing progressStatus, progressNotes, and plan.`;

// ─── Service ──────────────────────────────────────────────────────────────────

/** Helper to identify the primary user in this single-user app */
async function getPrimaryUser() {
  const email = 'user@example.com';
  return prisma.user.findUnique({ where: { email } });
}

export async function validateGoal(payload: any): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required');

  const ai = new GoogleGenAI({ apiKey });
  const user = await getPrimaryUser();
  if (!user) throw new Error('User not found');

  // Gather baseline data
  const activities = await prisma.activity.findMany({
    where: { date: { gte: getDateIntDaysAgo(60) } },
    orderBy: { date: 'desc' },
  });

  const prompt = `Evaluate the attainability and health risk of this proposed running goal.
Proposed Goal: ${JSON.stringify(payload)}
Recent Activity (last 60 days): ${JSON.stringify(activities.slice(0, 30))}

Apply these rules:
1. Volume: Weekly mileage shouldn't increase >15%. Can they reach peak volume safely before the target date?
2. Pace: Is the target pace realistic relative to recent paces and the timeframe?

Respond with JSON matching the required schema.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: GOAL_VALIDATION_SCHEMA,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Empty response from Gemini');
  return JSON.parse(text);
}

export async function runAiCoaching(): Promise<{ generated: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required');

  const ai = new GoogleGenAI({ apiKey });
  const user = await getPrimaryUser();
  if (!user) throw new Error('User not found');

  // Fetch data
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const [settings, goals, activities, healthMetrics] = await Promise.all([
    prisma.settings.findUnique({ where: { userId: user.id } }),
    prisma.goal.findMany({ where: { userId: user.id, status: 'ACTIVE' } }),
    prisma.activity.findMany({
      orderBy: { date: 'desc' },
      take: 60,
    }),
    prisma.healthMetric.findMany({
      orderBy: { date: 'desc' },
      take: 30,
    }),
  ]);

  if (!settings) throw new Error('No settings found');

  const primaryGoal = goals.find(g => g.isPrimary) || goals[0];
  const secondaryGoals = goals.filter(g => !g.isPrimary);

  // ── Build structured goal context ────────────────────────────────────────────
  const todayMs = today.getTime();
  let weeksUntilRace: number | null = null;
  if (primaryGoal?.targetDate) {
    const msUntil = primaryGoal.targetDate.getTime() - todayMs;
    weeksUntilRace = Math.max(0, Math.round(msUntil / (7 * 24 * 60 * 60 * 1000)));
  }

  const goalContext = primaryGoal ? {
    id: primaryGoal.id,
    type: primaryGoal.type,
    title: primaryGoal.title,
    raceDistance: primaryGoal.raceDistance,
    targetDate: primaryGoal.targetDate?.toISOString().slice(0, 10),
    targetTimeSeconds: primaryGoal.targetTimeSeconds,
    weeksUntilRace,
    experienceLevel: primaryGoal.experienceLevel,
    trainingDaysPerWeek: primaryGoal.trainingDaysPerWeek,
  } : null;

  // ── Pre-compute HRV context ──────────────────────────────────────────────────
  const hrvValues = healthMetrics.filter(m => m.hrv !== null).slice(0, 7).map(m => m.hrv as number);
  const hrv7dAvg = hrvValues.length ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length) : null;
  const latestHrv = hrvValues[0] ?? null;
  let hrvFlag = 'insufficient';
  if (hrv7dAvg && latestHrv) {
    const ratio = latestHrv / hrv7dAvg;
    hrvFlag = ratio >= 0.97 ? 'green' : ratio >= 0.90 ? 'yellow' : 'red';
  }

  const hrvContext = { latestHrv, hrv7dAvg, hrvFlag, note: 'HRV measurements from COROS.' };

  const userContent = JSON.stringify({
    today: todayStr,
    primaryGoal: goalContext,
    secondaryGoals: secondaryGoals.map(g => ({ title: g.title, type: g.type, date: g.targetDate?.toISOString().slice(0, 10) })),
    hrvContext,
    activities,
    healthMetrics,
  }, null, 2);

  console.log('sending prompt to Gemini')

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: userContent,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: COACHING_OUTPUT_SCHEMA,
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Empty response from Gemini');
  const result = JSON.parse(text);

  // Update Progress Status in DB
  if (primaryGoal) {
    await prisma.goal.update({
      where: { id: primaryGoal.id },
      data: {
        progressStatus: result.progressStatus,
        progressNotes: result.progressNotes,
      },
    });
  }

  // Upsert plans
  let generated = 0;
  for (const day of result.plan) {
    const dateInt = Number(day.date.replace(/-/g, ''));

    // Find all existing plans for this date to handle potential duplicates from previous bug
    const existingPlans = await prisma.workoutPlan.findMany({
      where: { date: dateInt },
      orderBy: { createdAt: 'desc' },
    });

    const primaryPlan = existingPlans[0];

    // Clean up duplicates if they exist
    if (existingPlans.length > 1) {
      const idsToDelete = existingPlans.slice(1).map(p => p.id);
      await prisma.workoutPlan.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    await prisma.workoutPlan.upsert({
      where: {
        id: primaryPlan?.id ?? -1,
      },
      create: {
        date: dateInt,
        title: day.title,
        description: `${day.type}: ${day.notes}`,
        stepsJson: day as object,
        status: 'PENDING',
      },
      update: {
        title: day.title,
        description: `${day.type}: ${day.notes}`,
        stepsJson: day as object,
        status: 'PENDING',
        pushError: null,
      },
    });
    generated++;
  }

  return { generated };
}

function getDateIntDaysAgo(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return Number(`${year}${month}${day}`);
}

// ─── Race Predictions ─────────────────────────────────────────────────────────

export interface RacePredictions {
  fiveK?: string;
  tenK?: string;
  halfMarathon?: string;
  marathon?: string;
  note: string;
  generatedAt: string;
}

export async function getAiPredictions(): Promise<RacePredictions> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required');

  const ai = new GoogleGenAI({ apiKey });

  const activities = await prisma.activity.findMany({
    orderBy: { date: 'desc' },
    take: 20,
    select: { date: true, distance: true, totalTime: true, avgHr: true, trainingLoad: true },
  });

  if (activities.length < 3) {
    return {
      note: 'Not enough training data yet for predictions. Sync more activities first.',
      generatedAt: new Date().toISOString(),
    };
  }

  const prompt = `Based on this recent running data, estimate realistic race time predictions.
Return JSON with keys: fiveK, tenK, halfMarathon, marathon (all as "MM:SS" or "H:MM:SS" strings), and a "note" key with a brief coaching insight.
Only include distances the athlete could realistically race given their training.
Data: ${JSON.stringify(activities, null, 2)}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Empty response from Gemini');

  try {
    const parsed = JSON.parse(text) as RacePredictions;
    return { ...parsed, generatedAt: new Date().toISOString() };
  } catch {
    return {
      note: 'Could not generate predictions at this time.',
      generatedAt: new Date().toISOString(),
    };
  }
}
