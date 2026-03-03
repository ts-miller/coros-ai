import { prisma } from '../lib/prisma.js';
import { decrypt } from '../lib/crypto.js';
import md5 from 'md5';
import {
  COROS_BASE_URL,
  CorosApiResponse,
  CorosWorkoutPayload,
  CorosCalculateResult,
  AiWorkoutDay,
  CorosWorkoutStep,
  SportType,
} from '../types/coros.js';

export class CorosWorkoutClient {
  private accessToken: string | null = null;
  private userId: string | null = null;

  async ensureAuth(): Promise<void> {
    if (this.accessToken && this.userId) return;

    const settings = await prisma.settings.findFirst();
    if (settings?.accessToken && settings.userId) {
      this.accessToken = settings.accessToken;
      this.userId = settings.userId;
      return;
    }

    await this.relogin();
  }

  private async relogin(): Promise<void> {
    const settings = await prisma.settings.findFirst();
    if (!settings) throw new Error('No settings found');
    const plainPwd = decrypt(settings.corosPwd);
    const body = { account: settings.corosEmail, accountType: 2, pwd: md5(plainPwd) };

    const res = await fetch(`${COROS_BASE_URL}/account/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as CorosApiResponse<{ accessToken: string; userId: string }>;
    if (json.result !== '0000' || !json.data) throw new Error('Coros login failed');

    this.accessToken = json.data.accessToken;
    this.userId = json.data.userId;
    // Reset cached token so ensureAuth won't short-circuit on next call
    await prisma.settings.update({
      where: { id: settings.id },
      data: { accessToken: this.accessToken, userId: this.userId },
    });
    console.log('[CorosWorkoutClient] Re-logged in, userId:', this.userId);
  }

  private isTokenError(result: string): boolean {
    return result === '1019' || result === '1030';
  }

  private authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      accessToken: this.accessToken!,
      yfheader: JSON.stringify({ userId: this.userId }),
    };
  }

  private buildPayload(workout: AiWorkoutDay, userId: string): CorosWorkoutPayload {
    const steps: CorosWorkoutStep[] = [];
    let sortNo = 1;

    const addSteps = (list: AiWorkoutDay['warmup'], defaultType = 'warmup') => {
      for (const step of list) {
        const targetType = step.distance ? 4 : step.duration ? 2 : 2;
        const targetValue = step.distance ?? (step.duration ? step.duration : 300);

        // Intensity encoding: 0=none, 1=pace (sec/km * 1000), 2=HR zone
        const intensityType = step.targetPace ? 1 : step.targetHrZone ? 2 : 0;
        const intensityValue = step.targetPace
          ? Math.round(step.targetPace * 1000)
          : step.targetHrZone ?? 0;

        steps.push({
          id: sortNo,
          name: `step_${sortNo}`,
          nameText: step.notes ?? step.stepType ?? defaultType,
          sortNo,
          sportType: SportType.Run,
          targetType,
          targetValue,
          restType: 1,
          restValue: 0,
          sets: step.reps ?? 1,
          intensityType,
          intensityValue,
          intensityDisplayUnit: '0',
          isGroup: false,
          desc: step.notes ?? '',
          descText: step.notes ?? '',
          overview: step.stepType ?? defaultType,
          // Required Coros fields (populated with neutral defaults)
          access: 0,
          animationId: 0,
          coverUrlArrStr: '',
          createTimestamp: 0,
          defaultOrder: 0,
          equipment: [],
          equipmentText: '',
          exerciseType: 0,
          groupId: '',
          hrType: intensityType === 2 ? 1 : 0,
          intensityCustom: 0,
          intensityMultiplier: 0,
          intensityPercent: 0,
          intensityPercentExtend: 0,
          isDefaultAdd: 0,
          isIntensityPercent: false,
          muscle: [],
          muscleRelevance: [],
          muscleText: '',
          originId: '0',
          part: [],
          partText: '',
          secondaryMuscleText: '',
          sourceUrl: '',
          status: 1,
          targetDisplayUnit: 0,
          thumbnailUrl: '',
          userId: 0,
          videoInfos: [],
          videoUrl: '',
          videoUrlArrStr: '',
        });
        sortNo++;
      }
    };

    addSteps(workout.warmup, 'warmup');
    addSteps(workout.mainSet, 'main');
    addSteps(workout.cooldown, 'cooldown');

    return {
      access: 1,
      authorId: userId,
      createTimestamp: 0,
      distance: 0,
      duration: 0,
      essence: 0,
      estimatedType: 0,
      estimatedValue: 0,
      exerciseNum: steps.length,
      exercises: steps,
      fastIntensityTypeName: 'pace',
      headPic: '',
      id: '0',
      idInPlan: '0',
      name: workout.title,
      nickname: '',
      originEssence: 0,
      overview: workout.notes,
      pbVersion: 2,
      planIdIndex: 0,
      poolLength: 2500,
      poolLengthId: 1,
      poolLengthUnit: 2,
      profile: '',
      referExercise: { intensityType: 1, hrType: 0, valueType: 1 },
      sex: 0,
      sets: 0,
      shareUrl: '',
      simple: false,
      sourceId: '0',
      sourceUrl: '',
      sportType: SportType.Run,
      star: 0,
      subType: 65535,
      targetType: 0,
      targetValue: 0,
      thirdPartyId: 0,
      totalSets: 0,
      trainingLoad: 0,
      type: 0,
      unit: 0,
      userId,
      version: 0,
      videoCoverUrl: '',
      videoUrl: '',
    };
  }

  async calculateWorkout(payload: CorosWorkoutPayload, retry = true): Promise<CorosCalculateResult> {
    const res = await fetch(`${COROS_BASE_URL}/training/program/calculate`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as CorosApiResponse<CorosCalculateResult>;
    if (this.isTokenError(json.result) && retry) {
      console.warn(`[CorosWorkoutClient] Token invalid/expired (${json.result}), re-logging in...`);
      await this.relogin();
      return this.calculateWorkout(payload, false);
    }
    if (json.result !== '0000' || !json.data) {
      throw new Error(`Calculate failed (${json.result}): ${json.message}`);
    }
    return json.data;
  }

  async createWorkout(workout: AiWorkoutDay): Promise<string> {
    await this.ensureAuth();

    const payload = this.buildPayload(workout, this.userId!);

    // Step 1: Calculate metrics
    let calculated: CorosCalculateResult;
    try {
      calculated = await this.calculateWorkout(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[WorkoutPush] Calculate step failed: ${msg}. Using zero values.`);
      calculated = { duration: 0, totalSets: payload.exercises.length, trainingLoad: 0 };
    }

    // Step 2: Patch calculated values and send /add
    const addPayload: CorosWorkoutPayload = {
      ...payload,
      distance: '0', // Coros /add requires string "0"
      duration: calculated.duration,
      sets: calculated.totalSets,
      totalSets: calculated.totalSets,
      trainingLoad: calculated.trainingLoad,
      pitch: 0,
    };

    const res = await fetch(`${COROS_BASE_URL}/training/program/add`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(addPayload),
    });

    const text = await res.text();
    let json: CorosApiResponse<{ id?: string }>;
    try {
      json = JSON.parse(text) as CorosApiResponse<{ id?: string }>;
    } catch {
      throw new Error(`Coros /add non-JSON response: ${text.slice(0, 500)}`);
    }

    if (this.isTokenError(json.result)) {
      console.warn(`[CorosWorkoutClient] Token invalid/expired (${json.result}) on /add, re-logging in and retrying...`);
      await this.relogin();
      return this.createWorkout(workout);
    }

    if (json.result !== '0000') {
      // Log full response for reverse-engineering debugging
      console.error('[WorkoutPush] /add rejected:', JSON.stringify(json, null, 2));
      throw new Error(`Coros /add failed (${json.result}): ${json.message}`);
    }

    const workoutId = json.data?.id ?? json.apiCode ?? 'unknown';
    console.log(`[WorkoutPush] Created workout "${workout.title}", corosId=${workoutId}`);
    return workoutId;
  }
}

export const corosWorkoutClient = new CorosWorkoutClient();
