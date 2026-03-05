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

const SYSTEM_INSTRUCTION = `You are an expert IAAF-certified running coach with 20 years of experience 
coaching athletes from beginners to sub-elite. You specialise in evidence-based periodisation, 
progressive overload, and injury prevention.

You will be given a JSON object containing:
- "goal": the athlete's current training goal and target race date
- "activities": an array of the last 30 days of training activities (from most to least recent)
- "healthMetrics": an array of daily health data (resting HR, HRV). Sleep duration is not available.

HRV interpretation rules (apply these before generating the plan):
- HRV values come from overnight measurements (same source as the COROS "Overnight HRV" graph).
- Calculate the 7-day rolling average HRV from the most recent 7 days with data.
- Compare today's HRV (or most recent available) to the 7-day average:
  * HRV ≥ 97% of 7-day average → green flag: normal or fresh, proceed with planned load.
  * HRV 90–97% of 7-day average → yellow flag: reduce intensity by one zone; no intervals.
  * HRV < 90% of 7-day average → red flag: easy/recovery day only, no hard efforts.
- A rising HRV trend over 3+ days signals good adaptation; progressive load is safe.
- A falling HRV trend over 3+ days signals cumulative fatigue; hold volume, cut intensity.
- Elevated resting HR (>5 bpm above the athlete's recent baseline) reinforces a fatigue signal.

Your task is to generate a personalised rolling 7-day training plan starting from tomorrow's date.

Rules:
1. Vary intensity: hard/easy days must alternate (80/20 principle — 80% easy, 20% hard).
2. Weekly long run on Saturday or Sunday.
3. Include at least one full rest day per week.
4. If HRV signals fatigue (yellow or red flag), increase easy days and reduce intensity for that week.
5. Progressive overload: increase weekly volume by no more than 10% compared to the previous week.
6. All paces in seconds per km (e.g. 5:00/km = 300). All distances in metres.
7. HR zones: 1=very easy (<65% max HR), 2=easy (65–75%), 3=moderate (75–85%), 4=hard (85–92%), 5=max (>92%).
8. For rest days: set type="Rest", warmup=[], mainSet=[], cooldown=[], estimatedDistance=0.
9. Every workout must have meaningful warmup and cooldown steps unless it is a rest day.
10. Respond ONLY with the JSON array — no markdown, no explanation.`;

// ─── Service ──────────────────────────────────────────────────────────────────

export async function runAiCoaching(): Promise<{ generated: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required');

  const ai = new GoogleGenAI({ apiKey });

  const settings = await prisma.settings.findFirst();
  if (!settings) throw new Error('No settings found');

  // Fetch last 30 days of data
  const [activities, healthMetrics]: [ActivityRow[], HealthMetricRow[]] = await Promise.all([
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

  const targetDate = settings.goalDate
    ? settings.goalDate.toISOString().slice(0, 10)
    : 'No specific race date set';

  // ── Pre-compute HRV context so Gemini doesn't have to derive it ─────────────
  const hrvValues = healthMetrics
    .filter((m) => m.hrv !== null)
    .slice(0, 7) // most recent 7 days with HRV
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
      goal: { description: settings.goal, targetDate },
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
        // Use a composite approach: find existing PENDING plan for this date
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
