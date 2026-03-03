// ─── Coros API Types ──────────────────────────────────────────────────────────

export const COROS_BASE_URL = 'https://teamapi.coros.com';

export const SportType = {
  Run: 100,
  IndoorRun: 101,
  TrailRun: 102,
  TrackRun: 103,
  Hike: 104,
  RoadBike: 200,
  IndoorBike: 201,
  MountainBike: 202,
  PoolSwim: 300,
  OpenWaterSwim: 301,
  GymCardio: 400,
  Strength: 402,
  Walk: 900,
} as const;

export type SportTypeValue = (typeof SportType)[keyof typeof SportType];

export const RUNNING_SPORT_TYPES: SportTypeValue[] = [
  SportType.Run,
  SportType.IndoorRun,
  SportType.TrailRun,
  SportType.TrackRun,
];

// ─── Login ────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  account: string;
  accountType: 2;
  pwd: string; // MD5 hex of plaintext password
}

export interface LoginData {
  accessToken: string;
  userId: string;
  nickname: string;
  email: string;
  headPic: string;
  countryCode: string;
  birthday: number;
}

export interface CorosApiResponse<T = unknown> {
  result: string;
  message: string;
  apiCode?: string;
  data?: T;
}

// ─── Activities ───────────────────────────────────────────────────────────────

export interface CorosActivity {
  date: number;
  device: string;
  distance: number;
  imageUrl: string;
  endTime: number;
  endTimezone: number;
  labelId: string;
  name: string;
  sportType: number;
  total: number;
  startTime: number;
  startTimezone: number;
  totalTime: number;
  trainingLoad: number;
  unitType: number;
  workoutTime: number;
}

export interface ActivityListResponse {
  count: number;
  dataList: CorosActivity[];
  pageable?: {
    page: number;
    pageSize: number;
  };
}

export interface ActivitySummary {
  avgHr?: number;
  maxHr?: number;
  avgPower?: number;
  maxPower?: number;
  avgCadence?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  avgPace?: number;
  distance?: number;
  totalTime?: number;
  workoutTime?: number;
  calories?: number;
  elevGain?: number;
  trainingLoad?: number;
  aerobicEffect?: number;
  anaerobicEffect?: number;
  startTimestamp?: number;
  endTimestamp?: number;
  sportType?: number;
  name?: string;
  currentVo2Max?: number;
}

export interface ActivityDetailResponse {
  summary: ActivitySummary;
  lapList?: unknown[];
  zoneList?: unknown[];
}

// ─── Workout Push ─────────────────────────────────────────────────────────────

export interface WorkoutStep {
  /** 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'steady' */
  stepType: string;
  /** seconds */
  duration?: number;
  /** metres */
  distance?: number;
  /** seconds per km */
  targetPace?: number;
  /** HR zone 1–5 */
  targetHrZone?: number;
  /** reps e.g. for strides */
  reps?: number;
  notes?: string;
}

export interface AiWorkoutDay {
  date: string; // ISO YYYY-MM-DD
  title: string;
  type: string; // e.g. "Easy Run" | "Intervals" | "Long Run" | "Rest"
  warmup: WorkoutStep[];
  mainSet: WorkoutStep[];
  cooldown: WorkoutStep[];
  targetPaceMin?: number;
  targetHrZone?: number;
  estimatedDistance?: number; // metres
  notes: string;
}

// ─── Coros Workout Payload (Training Hub) ────────────────────────────────────

export interface CorosWorkoutStep {
  id: number;
  name: string;
  nameText: string;
  sortNo: number;
  sportType: number;
  targetType: number;  // 1=pace, 2=duration(s), 3=reps, 4=distance(m)
  targetValue: number;
  restType: number;
  restValue: number;
  sets: number;
  intensityType: number; // 0=none, 1=pace zone, 2=hr zone
  intensityValue: number;
  intensityDisplayUnit: string;
  isGroup: boolean;
  desc: string;
  descText: string;
  overview: string;
  [key: string]: unknown;
}

export interface CorosWorkoutPayload {
  access: number;
  authorId: string;
  createTimestamp: number;
  distance: number | string;
  duration: number;
  essence: number;
  estimatedType: number;
  estimatedValue: number;
  exerciseNum: number;
  exercises: CorosWorkoutStep[];
  id: string;
  idInPlan: string;
  name: string;
  overview: string;
  pbVersion: number;
  poolLength: number;
  poolLengthId: number;
  poolLengthUnit: number;
  referExercise: { intensityType: number; hrType: number; valueType: number };
  sets: number;
  shareUrl: string;
  simple: boolean;
  sportType: number;
  star: number;
  subType: number;
  targetType: number;
  targetValue: number;
  totalSets: number;
  trainingLoad: number;
  userId: string;
  version: number;
  [key: string]: unknown;
}

export interface CorosCalculateResult {
  duration: number;
  totalSets: number;
  trainingLoad: number;
}
