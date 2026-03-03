import { GoogleGenAI, Type } from '@google/genai';
import { prisma } from '../lib/prisma.js';
import { AiWorkoutDay } from '../types/coros.js';

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
- "healthMetrics": an array of daily health data (sleep, resting HR, HRV)

Your task is to generate a personalised rolling 7-day training plan starting from tomorrow's date.

Rules:
1. Vary intensity: hard/easy days must alternate (80/20 principle — 80% easy, 20% hard).
2. Weekly long run on Saturday or Sunday.
3. Include at least one full rest day per week.
4. If recent resting HR or HRV indicates fatigue, increase easy days and reduce intensity.
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
  const [activities, healthMetrics] = await Promise.all([
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
        sleepDuration: true,
        restingHr: true,
        hrv: true,
        isMock: true,
      },
    }),
  ]);

  const targetDate = settings.goalDate
    ? settings.goalDate.toISOString().slice(0, 10)
    : 'No specific race date set';

  const userContent = JSON.stringify(
    {
      goal: { description: settings.goal, targetDate },
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
