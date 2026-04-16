import { GoogleGenAI, Type } from '@google/genai';
import { prisma } from '../lib/prisma.js';
import { AiWorkoutDay } from '../types/coros.js';

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

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are an expert IAAF-certified running coach with 20 years of experience coaching athletes from beginners to sub-elite. You specialise in evidence-based periodisation, progressive overload, and injury prevention.

You will be given a JSON object containing:
- "goal": a structured object describing the athlete's training goal (see Goal Context rules below)
- "hrvContext": pre-computed HRV and resting HR readiness signals
- "activities": an array of recent training activities (from most to least recent)
- "healthMetrics": an array of daily health data (resting HR, HRV)

────────────────────────────────────────────────────────────────────────────────
GOAL CONTEXT RULES — apply these to shape the weekly structure
────────────────────────────────────────────────────────────────────────────────

The goal.type field will be one of three values:

  RACE — athlete is training for a specific race:
    - Use classic periodisation: Base → Build → Peak → Taper
    - Use goal.weeksUntilRace to determine current phase:
        * >12 weeks: Base phase — high volume, mostly easy running (zones 1–2), strides only, no race-pace work
        * 8–12 weeks: Build phase — introduce tempo (zone 3), hill repeats, some threshold work
        * 4–8 weeks: Peak phase — race-specific sessions (intervals at race pace, VO2max work), long run near race distance
        * 2–4 weeks: Early taper — reduce volume 20%, maintain intensity, no new stress
        * <2 weeks: Final taper — volume cut 40%, only short easy runs and strides, protect legs
    - If no raceDate was set, treat as 12 weeks out (Base phase).
    - Use goal.raceDistance to calibrate long run length and target pace:
        * 5K: long run up to 10–12 km, intervals at 5K pace
        * 10K: long run up to 14–16 km, cruise intervals at 10K pace
        * HALF_MARATHON: long run up to 20–22 km, tempo at HM pace
        * MARATHON: long run up to 35 km, marathon-pace miles in long run
        * 50K / 50_MILE / 100K / 100_MILE: trail-focused, back-to-back long runs on weekend, walk breaks acceptable
    - If goal.targetTimeSeconds is set, calculate target pace from it and use it for pace-specific sessions.
    - If goal.targetTimeSeconds is not set, estimate appropriate paces from recent activity data.

  BASE_BUILDING — athlete is building general aerobic fitness without a specific race:
    - Focus entirely on aerobic development: 90%+ of runs in zones 1–2
    - Long run each weekend, increasing by ~10% per week
    - No intervals or race-pace work; strides are acceptable once per week after easy runs
    - Introduce tempo only after 3+ weeks of consistent easy volume
    - Primary goal: accumulate easy mileage and build the aerobic engine

  JUST_RUN — athlete wants to stay active and enjoy running without aggressive goals:
    - Maintain current fitness; do not aggressively increase volume or intensity
    - Provide variety: mix easy runs, one longer run, optional strides
    - Avoid hard interval sessions; include at most one moderate workout per week
    - Prioritise enjoyment and consistency over performance metrics

────────────────────────────────────────────────────────────────────────────────
EXPERIENCE LEVEL CALIBRATION — use goal.experienceLevel
────────────────────────────────────────────────────────────────────────────────

  BEGINNER:
    - Maximum 3–4 running days; the remaining days are rest or cross-training
    - Keep sessions simple: easy run, long run, optional strides
    - No intervals or structured speedwork in the first weeks
    - Long run capped at 10–12 km for 5K/10K goals, 18 km for HM goals
    - Include explicit run/walk guidance in notes if pace exceeds recent ability

  INTERMEDIATE:
    - Standard periodisation; 4–5 running days per week
    - One quality session per week (tempo, intervals, or progression run)
    - Long run up to race distance or 90% thereof
    - Workout complexity: cruise intervals, threshold repeats, fartlek

  ADVANCED:
    - 5–7 running days; double days acceptable in peak weeks
    - Two quality sessions per week separated by at least 2 easy days
    - Complex sessions: VO2max intervals, race-pace long runs, progression runs, strides after tempos
    - Long runs can include marathon-pace segments or back-to-back efforts

────────────────────────────────────────────────────────────────────────────────
TRAINING DAYS — use goal.daysPerWeek
────────────────────────────────────────────────────────────────────────────────
- Schedule exactly goal.daysPerWeek running days in the 7-day plan.
- The remaining days must be Rest days (type="Rest").
- Always include Saturday or Sunday as the long run day.
- Spread rest days to maximise recovery between hard sessions.

────────────────────────────────────────────────────────────────────────────────
HRV INTERPRETATION RULES
────────────────────────────────────────────────────────────────────────────────
- HRV values are overnight measurements from COROS.
- Use the pre-computed hrvContext fields; do not re-calculate.
- hrvFlag = green → proceed with planned load
- hrvFlag = yellow → reduce intensity by one zone; replace intervals with an easy run
- hrvFlag = red → easy/recovery day only; no hard efforts this week
- A rising HRV trend (hrvTrend = rising) over 3+ days: progressive load is safe
- A falling HRV trend (hrvTrend = falling): hold volume, cut intensity
- rhrElevated = true reinforces any fatigue signal

────────────────────────────────────────────────────────────────────────────────
UNIVERSAL RULES
────────────────────────────────────────────────────────────────────────────────
1. 80/20 principle: 80% easy (zones 1–2), 20% hard (zones 3–5).
2. Hard/easy days must alternate; never schedule two hard sessions back-to-back.
3. Always include at least one full rest day per week.
4. Progressive overload: increase weekly volume by no more than 10% vs. the previous week.
5. All paces in seconds per km (e.g. 5:00/km = 300). All distances in metres.
6. HR zones: 1=very easy (<65% maxHR), 2=easy (65–75%), 3=moderate (75–85%), 4=hard (85–92%), 5=max (>92%).
7. For rest days: type="Rest", warmup=[], mainSet=[], cooldown=[], estimatedDistance=0.
8. Every non-rest workout must have a meaningful warmup and cooldown.
9. Respond ONLY with the JSON array — no markdown, no explanation, no prose.`;

// ─── Service ──────────────────────────────────────────────────────────────────

/** Format seconds as H:MM:SS for human-readable goal context */
function formatSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export async function runAiCoaching(): Promise<{ generated: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required');

  const ai = new GoogleGenAI({ apiKey });

  // Fetch settings and structured goal in parallel
  const [settings, goal, activities, healthMetrics]: [
    Awaited<ReturnType<typeof prisma.settings.findFirst>>,
    Awaited<ReturnType<typeof prisma.goal.findFirst>>,
    ActivityRow[],
    HealthMetricRow[],
  ] = await Promise.all([
    prisma.settings.findFirst(),
    prisma.goal.findFirst(),
    prisma.activity.findMany({
      orderBy: { date: 'desc' },
      take: 60,
      select: {
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
      },
    }),
    prisma.healthMetric.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      select: {
        date: true,
        restingHr: true,
        hrv: true,
        isMock: true,
      },
    }),
  ]);

  if (!settings) throw new Error('No settings found');

  // ── Build structured goal context ────────────────────────────────────────────
  const todayMs = Date.now();

  let weeksUntilRace: number | null = null;
  if (goal?.raceDate) {
    const msUntil = goal.raceDate.getTime() - todayMs;
    weeksUntilRace = Math.max(0, Math.round(msUntil / (7 * 24 * 60 * 60 * 1000)));
  }

  const goalContext = goal
    ? {
        type: goal.goalType,
        raceDistance: goal.raceDistance ?? null,
        targetTime: goal.targetTimeSeconds ? formatSeconds(goal.targetTimeSeconds) : null,
        targetTimeSeconds: goal.targetTimeSeconds ?? null,
        raceDate: goal.raceDate ? goal.raceDate.toISOString().slice(0, 10) : null,
        weeksUntilRace,
        experienceLevel: goal.experienceLevel,
        daysPerWeek: goal.daysPerWeek,
      }
    : {
        type: 'BASE_BUILDING',
        raceDistance: null,
        targetTime: null,
        targetTimeSeconds: null,
        raceDate: null,
        weeksUntilRace: null,
        experienceLevel: 'INTERMEDIATE',
        daysPerWeek: 4,
        note: 'No goal configured — defaulting to Base Building.',
      };
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Pre-compute HRV context so Gemini doesn't have to derive it ─────────────
  const hrvValues = healthMetrics
    .filter((m) => m.hrv !== null)
    .slice(0, 7)
    .map((m) => m.hrv as number);

  const hrv7dAvg = hrvValues.length
    ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length)
    : null;

  const latestHrv = hrvValues[0] ?? null;

  let hrvFlag: 'green' | 'yellow' | 'red' | 'insufficient' = 'insufficient';
  if (hrv7dAvg !== null && latestHrv !== null) {
    const ratio = latestHrv / hrv7dAvg;
    if (ratio >= 0.97) hrvFlag = 'green';
    else if (ratio >= 0.90) hrvFlag = 'yellow';
    else hrvFlag = 'red';
  }

  const hrvTrend: 'rising' | 'falling' | 'stable' | 'insufficient' =
    hrvValues.length >= 3
      ? hrvValues[0] > hrvValues[2]
        ? 'rising'
        : hrvValues[0] < hrvValues[2]
        ? 'falling'
        : 'stable'
      : 'insufficient';

  const rhrValues = healthMetrics
    .filter((m) => m.restingHr !== null)
    .slice(0, 7)
    .map((m) => m.restingHr as number);

  const rhr7dAvg = rhrValues.length
    ? Math.round(rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length)
    : null;

  const latestRhr = rhrValues[0] ?? null;
  const rhrElevated = rhr7dAvg !== null && latestRhr !== null && latestRhr - rhr7dAvg > 5;

  const hrvContext = {
    latestHrv,
    hrv7dAvg,
    hrvFlag,
    hrvTrend,
    latestRhr,
    rhr7dAvg,
    rhrElevated,
    note: 'HRV values are overnight measurements from COROS avgSleepHrv. Sleep duration not available.',
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const userContent = JSON.stringify(
    {
      goal: goalContext,
      hrvContext,
      activities,
      healthMetrics,
    },
    null,
    2,
  );

  console.log('[AICoach] Sending request to Gemini...');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userContent,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: PLAN_SCHEMA,
      temperature: 0.4,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error('Gemini returned empty response');

  let plan: AiWorkoutDay[];
  try {
    plan = JSON.parse(raw) as AiWorkoutDay[];
  } catch {
    throw new Error(`Failed to parse Gemini JSON: ${raw.slice(0, 500)}`);
  }

  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error('Gemini returned an empty or invalid plan');
  }

  console.log(`[AICoach] Received ${plan.length} workout days from Gemini`);

  // Upsert workout plans
  let generated = 0;
  for (const day of plan) {
    const dateInt = Number(day.date.replace(/-/g, ''));

    await prisma.workoutPlan.upsert({
      where: {
        id: (
          await prisma.workoutPlan.findFirst({
            where: { date: dateInt, status: 'PENDING' },
            select: { id: true },
          })
        )?.id ?? -1,
      },
      create: {
        date: dateInt,
        title: day.title,
        description: `${day.type}: ${day.notes}`,
        stepsJson: day as unknown as object,
        status: 'PENDING',
      },
      update: {
        title: day.title,
        description: `${day.type}: ${day.notes}`,
        stepsJson: day as unknown as object,
        status: 'PENDING',
        pushError: null,
      },
    });
    generated++;
  }

  console.log(`[AICoach] Saved ${generated} workout plans`);
  return { generated };
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
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  });

  try {
    const parsed = JSON.parse(response.text ?? '{}') as RacePredictions;
    return { ...parsed, generatedAt: new Date().toISOString() };
  } catch {
    return {
      note: 'Could not generate predictions at this time.',
      generatedAt: new Date().toISOString(),
    };
  }
}
