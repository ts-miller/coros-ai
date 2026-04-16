import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Activity {
  id: number;
  labelId: string;
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
  syncedAt: string;
}

export interface ActivitySummary {
  totalActivities: number;
  totalDistanceKm: number;
  avgTrainingLoad: number;
}

export interface HealthMetric {
  id: number;
  date: number;
  sleepDuration: number | null;
  restingHr: number | null;
  hrv: number | null;
  isMock: boolean;
}

export interface WorkoutStep {
  stepType: string;
  duration?: number;
  distance?: number;
  targetPace?: number;
  targetHrZone?: number;
  reps?: number;
  notes?: string;
}

export interface WorkoutDay {
  date: string;
  title: string;
  type: string;
  warmup: WorkoutStep[];
  mainSet: WorkoutStep[];
  cooldown: WorkoutStep[];
  targetPaceMin?: number;
  targetHrZone?: number;
  estimatedDistance?: number;
  notes: string;
}

export interface WorkoutPlan {
  id: number;
  date: number;
  title: string;
  description: string;
  stepsJson: WorkoutDay;
  status: 'PENDING' | 'PUSHED' | 'FAILED' | 'SKIPPED';
  corosWorkoutId: string | null;
  pushError: string | null;
  createdAt: string;
}

export interface RacePredictions {
  fiveK?: string;
  tenK?: string;
  halfMarathon?: string;
  marathon?: string;
  note: string;
  generatedAt: string;
}

export interface AppSettings {
  corosEmail: string;
  unitSystem: 'metric' | 'imperial';
}

export type GoalType = 'RACE' | 'BASE_BUILDING' | 'JUST_RUN';

export type RaceDistance =
  | '5K'
  | '10K'
  | 'HALF_MARATHON'
  | 'MARATHON'
  | '50K'
  | '50_MILE'
  | '100K'
  | '100_MILE';

export type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface Goal {
  id: number;
  goalType: GoalType;
  raceDistance: RaceDistance | null;
  /** target finish time in seconds */
  targetTimeSeconds: number | null;
  /** ISO date string, e.g. '2026-10-04' */
  raceDate: string | null;
  experienceLevel: ExperienceLevel;
  /** training days per week, 3–7 */
  daysPerWeek: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalPayload {
  goalType: GoalType;
  raceDistance: RaceDistance | null;
  targetTimeSeconds: number | null;
  raceDate: string | null;
  experienceLevel: ExperienceLevel;
  daysPerWeek: number;
}

type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

@Injectable({ providedIn: 'root' })
export class CorosApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  private unwrap<T>(obs: Observable<ApiResponse<T>>): Observable<T> {
    return obs.pipe(
      map((res) => {
        if (!res.success) throw new Error((res as { success: false; error: string }).error);
        return (res as { success: true; data: T }).data;
      }),
    );
  }

  getActivities(days = 30): Observable<{ activities: Activity[]; summary: ActivitySummary }> {
    return this.unwrap(
      this.http.get<ApiResponse<{ activities: Activity[]; summary: ActivitySummary }>>(
        `${this.baseUrl}/activities?days=${days}`,
      ),
    );
  }

  getHealth(days = 30): Observable<{ metrics: HealthMetric[]; mockDataDisclaimer: string | null }> {
    return this.unwrap(
      this.http.get<ApiResponse<{ metrics: HealthMetric[]; mockDataDisclaimer: string | null }>>(
        `${this.baseUrl}/health?days=${days}`,
      ),
    );
  }

  getSchedule(): Observable<WorkoutPlan[]> {
    return this.unwrap(this.http.get<ApiResponse<WorkoutPlan[]>>(`${this.baseUrl}/schedule`));
  }

  getPredictions(): Observable<RacePredictions> {
    return this.unwrap(
      this.http.get<ApiResponse<RacePredictions>>(`${this.baseUrl}/predictions`),
    );
  }

  getSettings(): Observable<AppSettings | null> {
    return this.unwrap(this.http.get<ApiResponse<AppSettings | null>>(`${this.baseUrl}/settings`));
  }

  saveSettings(data: { corosEmail?: string; corosPassword?: string; unitSystem?: string }): Observable<unknown> {
    return this.unwrap(this.http.post<ApiResponse<unknown>>(`${this.baseUrl}/settings`, data));
  }

  getGoal(): Observable<Goal | null> {
    return this.unwrap(this.http.get<ApiResponse<Goal | null>>(`${this.baseUrl}/goal`));
  }

  saveGoal(data: GoalPayload): Observable<Goal> {
    return this.unwrap(this.http.post<ApiResponse<Goal>>(`${this.baseUrl}/goal`, data));
  }

  triggerSync(): Observable<{ synced: number; errors: number }> {
    return this.unwrap(
      this.http.post<ApiResponse<{ synced: number; errors: number }>>(`${this.baseUrl}/sync`, {}),
    );
  }

  triggerGenerate(): Observable<{ generated: number }> {
    return this.unwrap(
      this.http.post<ApiResponse<{ generated: number }>>(`${this.baseUrl}/generate`, {}),
    );
  }

  triggerPush(): Observable<{ pushed: number; failed: number }> {
    return this.unwrap(
      this.http.post<ApiResponse<{ pushed: number; failed: number }>>(`${this.baseUrl}/push`, {}),
    );
  }
}
