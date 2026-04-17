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
  ScheduleEntity,
  CorosScheduleData,
} from '../types/coros.js';

export class CorosWorkoutClient {
  private accessToken: string | null = null;
  private userId: string | null = null;

  async ensureAuth(): Promise<void> {
    if (this.accessToken && this.userId) return;

    const settings = await prisma.settings.findFirst();
    if (settings?.accessToken && settings.corosUserId) {
      this.accessToken = settings.accessToken;
      this.userId = settings.corosUserId;
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
      data: { accessToken: this.accessToken, corosUserId: this.userId },
    });
    console.log('[CorosWorkoutClient] Re-logged in, corosUserId:', this.userId);
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

    const formatPace = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const addSteps = (list: AiWorkoutDay['warmup'], defaultType = 'warmup') => {
      const exerciseTypeMap: Record<string, number> = {
        warmup: 1,
        interval: 2,
        steady: 2,
        active: 2,
        recovery: 4,
        cooldown: 3,
      };

      for (const step of list) {
        // Coros uses targetType 5 for distance in cm, 1 for duration in seconds
        const targetType = step.distance ? 5 : 1;
        // Search and math indicate distance targetValue is in centimeters (m * 100)
        const targetValue = step.distance ? Math.round(step.distance * 100) : (step.duration ?? 300);

        // Intensity encoding: 0=none, 3=pace (sec/km), 2=HR zone
        const intensityType = step.targetPace ? 3 : (step.targetHrZone ? 2 : 0);
        const intensityValue = step.targetPace
          ? Math.round(step.targetPace)
          : (step.targetHrZone ?? 0);

        const sType = (step.stepType ?? defaultType).toLowerCase();
        const exerciseType = exerciseTypeMap[sType] ?? 2;

        // Generate a descriptive name
        let name = '';
        if (step.distance) {
          name += `${step.distance / 1000}km`;
        } else if (step.duration) {
          const mins = Math.floor(step.duration / 60);
          name += `${mins}min`;
        }

        if (step.targetPace) {
          name += ` @ ${formatPace(step.targetPace)}/km`;
        } else if (step.targetHrZone) {
          name += ` @ Z${step.targetHrZone}`;
        }

        if (!name) name = sType.charAt(0).toUpperCase() + sType.slice(1);

        steps.push({
          id: sortNo,
          name: name,
          nameText: name,
          sortNo,
          sportType: SportType.Run,
          targetType,
          targetValue,
          targetValue2: targetValue,
          restType: 1,
          restValue: 0,
          sets: step.reps ?? 1,
          intensityType,
          intensityValue,
          intensityDisplayUnit: '0',
          isGroup: false,
          desc: step.notes ?? name,
          descText: step.notes ?? name,
          overview: step.stepType ?? defaultType,
          // Required Coros fields (populated with neutral defaults)
          access: 0,
          animationId: 0,
          coverUrlArrStr: '',
          createTimestamp: 0,
          defaultOrder: 0,
          equipment: [],
          equipmentText: '',
          exerciseType,
          groupId: '0',
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
          userId: userId,
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

    const totalDuration = steps.reduce((acc, s) => acc + (s.targetType === 1 ? (s.targetValue as number) : 0), 0);
    const totalDistance = steps.reduce((acc, s) => acc + (s.targetType === 5 ? (s.targetValue as number) : 0), 0);

    return {
      access: 1,
      authorId: userId,
      createTimestamp: 0,
      distance: totalDistance,
      duration: totalDuration,
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
      nickname: 'coros-ai',
      originEssence: 0,
      overview: workout.notes,
      pbVersion: 2,
      planIdIndex: 0,
      poolLength: 0,
      poolLengthId: 0,
      poolLengthUnit: 0,
      profile: '',
      referExercise: { intensityType: 3, hrType: 0, valueType: 1 },
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
      totalSets: steps.length,
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

  async getSchedule(startDate: string, endDate: string): Promise<CorosScheduleData> {
    await this.ensureAuth();
    const url = `${COROS_BASE_URL}/training/schedule/query?startDate=${startDate.replace(/-/g, '')}&endDate=${endDate.replace(/-/g, '')}&supportRestExercise=1`;
    
    const res = await fetch(url, {
      method: 'GET',
      headers: this.authHeaders(),
    });

    const json = (await res.json()) as CorosApiResponse<CorosScheduleData>;
    if (this.isTokenError(json.result)) {
      await this.relogin();
      return this.getSchedule(startDate, endDate);
    }

    if (!json.data) throw new Error(`Failed to fetch schedule: ${json.message}`);
    return json.data;
  }

  async deleteWorkouts(entities: { id: string; planProgramId: string; planId: string }[]): Promise<void> {
    if (entities.length === 0) return;
    await this.ensureAuth();

    const versionObjects = entities.map(e => ({
      id: e.id,
      planProgramId: e.planProgramId,
      planId: e.planId,
      status: 3, // 3 = Delete
    }));

    const payload = {
      versionObjects,
      pbVersion: 2,
    };

    const res = await fetch(`${COROS_BASE_URL}/training/schedule/update`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as CorosApiResponse;
    if (this.isTokenError(json.result)) {
      await this.relogin();
      return this.deleteWorkouts(entities);
    }

    if (json.result !== '0000') {
      throw new Error(`Coros delete failed (${json.result}): ${json.message}`);
    }
    console.log(`[CorosWorkoutClient] Deleted ${entities.length} workout(s) from calendar`);
  }

  async createWorkoutOnCalendar(workout: AiWorkoutDay): Promise<string> {
    await this.ensureAuth();

    const payload = this.buildPayload(workout, this.userId!);

    // Step 1: Calculate metrics to get exerciseBarChart and totals
    const calculated = await this.calculateWorkout(payload);

    // Step 2: Push to calendar using /schedule/update
    // Using idInPlan=2 as per user's devtools example as a template
    const idInPlan = 2;
    const happenDay = workout.date.replace(/-/g, '');

    const updatePayload: any = {
      entities: [
        {
          happenDay,
          idInPlan,
          sortNo: 0,
          dayNo: 0,
          sortNoInPlan: 0,
          sortNoInSchedule: 0,
          exerciseBarChart: calculated.exerciseBarChart,
        },
      ],
      programs: [
        {
          ...payload,
          idInPlan,
          distance: calculated.planDistance,
          duration: calculated.planDuration,
          totalSets: calculated.planSets,
          sets: calculated.planSets,
          trainingLoad: calculated.planTrainingLoad,
          pitch: 0,
          exerciseBarChart: calculated.exerciseBarChart,
          distanceDisplayUnit: calculated.distanceDisplayUnit,
        },
      ],
      versionObjects: [{ id: idInPlan, status: 1 }],
      pbVersion: 2,
    };

    const res = await fetch(`${COROS_BASE_URL}/training/schedule/update`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(updatePayload),
    });

    const json = (await res.json()) as CorosApiResponse;

    if (this.isTokenError(json.result)) {
      console.warn(`[CorosWorkoutClient] Token invalid/expired (${json.result}) on /schedule/update, re-logging in and retrying...`);
      await this.relogin();
      return this.createWorkoutOnCalendar(workout);
    }

    if (json.result !== '0000') {
      console.error('[WorkoutPush] /schedule/update rejected:', JSON.stringify(json, null, 2));
      throw new Error(`Coros /schedule/update failed (${json.result}): ${json.message}`);
    }

    console.log(`[WorkoutPush] Scheduled workout "${workout.title}" on ${happenDay}`);
    return `cal-${happenDay}`;
  }

  async createWorkout(workout: AiWorkoutDay, dateStr?: string): Promise<string> {
    await this.ensureAuth();

    const payload = this.buildPayload(workout, this.userId!);

    // Step 1: Calculate metrics
    let calculated: CorosCalculateResult;
    try {
      calculated = await this.calculateWorkout(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[WorkoutPush] Calculate step failed: ${msg}. Using zero values.`);
      calculated = {
        planDuration: 0,
        planSets: payload.exercises.length,
        planTrainingLoad: 0,
        actualDistance: '0',
        actualDuration: 0,
        actualElevGain: 0,
        actualPitch: 0,
        actualTrainingLoad: 0,
        distanceDisplayUnit: 0,
        exerciseBarChart: [],
        planDistance: '0',
        planElevGain: 0,
        planPitch: 0,
      };
    }

    // Step 2: Patch calculated values and send /add
    const happenDay = (dateStr ?? workout.date).replace(/-/g, '');
    const addPayload: CorosWorkoutPayload = {
      ...payload,
      distance: '0', // Coros /add requires string "0"
      duration: calculated.planDuration,
      sets: calculated.planSets,
      totalSets: calculated.planSets,
      trainingLoad: calculated.planTrainingLoad,
      pitch: 0,
      happenDay: Number(happenDay),
      day: Number(happenDay),
      date: Number(happenDay),
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
      return this.createWorkout(workout, dateStr);
    }

    if (json.result !== '0000') {
      // Log full response for reverse-engineering debugging
      console.error('[WorkoutPush] /add rejected:', JSON.stringify(json, null, 2));
      throw new Error(`Coros /add failed (${json.result}): ${json.message}`);
    }

    const workoutId = String(json.data ?? 'unknown');
    console.log(`[WorkoutPush] Created workout "${workout.title}" on calendar ${happenDay}, corosId=${workoutId}`);
    
    // Note: We'd love to delete from library here to avoid clutter,
    // but /training/program/delete currently returns 1009.
    // Given the user's priority is calendar sync, we'll keep the library entry for now.

    return workoutId;
  }
}

export const corosWorkoutClient = new CorosWorkoutClient();
