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

/** Shape returned by GET /activity/query */
export interface CorosActivity {
  adjustedPace: number;
  ascent: number;
  avg5x10s: number;
  avgCadence: number;
  avgHr: number;
  avgPower: number;
  avgSpeed: number;
  avgStrkRate: number;
  best: number;
  best500m: number;
  bestKm: number;
  bestLen: number;
  bodyTemperature: number;
  cadence: number;
  /** calories × 1000 (divide by 1000 for kcal) */
  calorie: number;
  date: number;
  descent: number;
  device: string;
  deviceId: string;
  deviceSportMode: number;
  distance: number;
  downhillDesc: number;
  downhillDist: number;
  downhillTime: number;
  endTime: number;
  endTimezone: number;
  hasMessage: number;
  imageUrl: string;
  imageUrlType: number;
  isRunTest: number;
  isShowMs: number;
  labelId: string;
  lengths: number;
  max2s: number;
  maxSlope: number;
  maxSpeed: number;
  /** activity mode / sub-sport code */
  mode: number;
  name: string;
  np: number;
  pitch: number;
  sets: number;
  speedType: number;
  sportType: number;
  startTime: number;
  startTimezone: number;
  step: number;
  subMode: number;
  swolf: number;
  testMaxHr: number;
  testThresholdHr: number;
  /** threshold pace in seconds per km */
  testThresholdPace: number;
  total: number;
  totalDescent: number;
  totalFishingTime: number;
  totalReps: number;
  totalTime: number;
  trainingLoad: number;
  unitType: number;
  waterTemperature: number;
  workoutTime: number;
}

export interface ActivityListResponse {
  count: number;
  dataList: CorosActivity[];
  pageNumber: number;
  totalPage: number;
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
  targetType: number;  // 1=duration(s), 3=reps, 5=distance(cm)
  targetValue: number;
  targetValue2?: number;
  restType: number;
  restValue: number;
  sets: number;
  intensityType: number; // 0=none, 3=pace zone, 2=hr zone
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
  actualDistance: string;
  actualDuration: number;
  actualElevGain: number;
  actualPitch: number;
  actualTrainingLoad: number;
  distanceDisplayUnit: number;
  exerciseBarChart: ScheduleExerciseBarChartItem[];
  planDistance: string;
  planDuration: number;
  planElevGain: number;
  planPitch: number;
  planSets: number;
  planTrainingLoad: number;
}

export interface CorosScheduleUpdatePayload {
  entities: {
    happenDay: string;
    idInPlan: number;
    sortNo: number;
    dayNo: number;
    sortNoInPlan: number;
    sortNoInSchedule: number;
    exerciseBarChart: ScheduleExerciseBarChartItem[];
  }[];
  programs: (CorosWorkoutPayload & {
    exerciseBarChart: ScheduleExerciseBarChartItem[];
    pitch: number;
  })[];
  versionObjects: { id: number; status: number }[];
  pbVersion: number;
}

// ─── Training Analysis (/analyse/query) ──────────────────────────────────────

/** One day entry from the /analyse/query dayList */
export interface AnalyseDayRecord {
  happenDay: number;        // YYYYMMDD
  timestamp: number;        // unix seconds (UTC midnight)
  rhr?: number;             // resting heart rate (bpm)
  testRhr?: number;         // measured RHR from device test
  avgSleepHrv?: number;     // overnight HRV average (ms) — the line shown in the graph
  sleepHrvBase?: number;    // personal HRV baseline (ms) — shaded reference area
  /** Quartile array: [intervalCount, p25, p50, p75] */
  sleepHrvIntervalList?: number[];
  trainingLoad?: number;
  t7d?: number;             // 7-day cumulative training load
  t28d?: number;            // 28-day cumulative training load
  tiredRate?: number;
  tiredRateNew?: number;
  ati?: number;
  cti?: number;
  vo2max?: number;
  staminaLevel?: number;
  performance?: number;     // 2=good, -1=unknown
  distance?: number;
  duration?: number;
}

export interface AnalyseQueryData {
  dayList: AnalyseDayRecord[];
  t7dayList?: AnalyseDayRecord[];
  weekList?: Array<{ firstDayOfWeek: number; trainingLoad: number; recomendTlMax?: number; recomendTlMin?: number }>;
}

// ─── Training Schedule (/training/schedule/query) ────────────────────────────

/**
 * exerciseType values in bar chart / exercise lists:
 *   1 = warmup  2 = main/interval  3 = cooldown  4 = rest/recovery  0 = group
 *
 * targetType values:
 *   0 = open (no target)  2 = duration (seconds)  5 = distance (mm)
 */
export interface ScheduleExerciseBarChartItem {
  exerciseId: string;
  exerciseType: number;
  height: number;
  name: string;
  targetType: number;
  targetValue: number;         // distance in mm (targetType 5) or seconds (targetType 2)
  value: number;               // actual / rendered value
  width: number;               // bar width percentage
  widthFill: number;           // fill percentage (0–100, 100 when completed)
}

/** A single step inside a scheduled program's exercise list */
export interface ScheduleExercise {
  access: number;
  createTimestamp: number;
  defaultOrder: number;
  exerciseType: number;
  groupId: string;             // '0' = not in a group; otherwise ID of the parent group exercise
  id: string;
  intensityPercent?: number;   // e.g. 99000 = 99%
  intensityPercentExtend?: number;
  intensityType: number;       // 0=none, 3=pace zone
  intensityValue: number;      // pace in s/km when intensityType=3
  intensityValueExtend?: number;
  isDefaultAdd: number;
  isGroup: boolean;
  isIntensityPercent: boolean;
  name: string;
  originId: string;
  restType: number;
  restValue: number;
  setCompleteRateArr?: string; // JSON-like string, e.g. "{3:[1.0]}"
  sets: number;
  sortNo: number;
  sportType: number;
  status: number;
  subType: number;
  targetType: number;
  targetValue: number;         // distance in mm or seconds depending on targetType
  userId: number;
  videoInfos: unknown[];
}

/** A workout program attached to the schedule (one day's structured session) */
export interface ScheduleProgram {
  access: number;
  authorId: string;
  createTimestamp: number;
  deleted: number;
  distance: number;            // total distance in mm
  distanceDisplayUnit: number; // 3 = miles
  duration: number;            // estimated duration in seconds
  elevGain: number;
  essence: number;
  estimatedDistance: number;   // mm
  estimatedTime: number;       // seconds
  estimatedType: number;
  estimatedValue: number;
  exerciseBarChart: ScheduleExerciseBarChartItem[];
  exerciseNum: number;
  exercises: ScheduleExercise[];
  headPic: string;             // coach/plan thumbnail URL
  id: string;
  idInPlan: string;
  isTargetTypeConsistent: number;
  name: string;
  nickname: string;            // third-party plan provider name (e.g. "Runna")
  originEssence: number;
  originId: number;
  overview: string;            // human-readable workout description
  pbVersion: number;
  pitch: number;
  planId: string;
  planIdIndex: number;
  sex: number;
  simple: boolean;
  sportType: number;
  star: number;
  status: number;
  subType: number;
  targetType: number;
  targetValue: number;
  thirdPartyId: number;
  totalSets: number;
  trainingLoad: number;
  type: number;
  unit: number;
  userId: string;
  version: number;
}

/** Sport data for an activity matched (or unmatched) to the plan */
export interface ScheduleSportData {
  avgPace: number;             // seconds per km
  avgSpeed: number;
  distance: number;            // mm
  duration: number;            // seconds
  endTime: number;             // unix timestamp
  fitnessSwitch: number;
  happenDay: number;           // YYYYMMDD
  isShowMs: number;
  labelId: string;
  mode: number;
  name: string;
  pitch: number;
  sets: number;
  speedType: number;
  sportType: number;
  startTime: number;           // unix timestamp
  subMode: number;
  trainingLoad: number;
  unitType: number;
}

/** A scheduled workout entity (one planned day entry) */
export interface ScheduleEntity {
  completeRate: string;        // "-1.00" = not yet due, "0" = incomplete, "1.00" = complete
  dayNo: number;               // day number within the plan
  executeStatus: number;       // 0 = not started, 2 = completed
  exerciseBarChart: ScheduleExerciseBarChartItem[];
  happenDay: number;           // YYYYMMDD — the date this workout is scheduled
  id: string;
  idInPlan: string;
  labelId?: string;            // linked activity labelId when completed
  operateUserId: string;
  originId: string;
  planId: string;
  planIdIndex: number;
  planProgramId: string;
  score: string;               // "0"–"100.00" or "-1.00" when not applicable
  sortNo: number;
  sortNoInSchedule?: number;
  sportData?: ScheduleSportData; // populated when the workout has been completed
  standardRate?: string;
  thirdParty: boolean;
  thirdPartyId: number;
  userId: number;
}

/** Per-sport-type summary within a week stage */
export interface WeekStageSportSummary {
  actualDistance: string;      // mm as decimal string
  actualDuration: number;      // seconds
  actualElevGain: number;
  actualPitch: number;
  actualTrainingLoad: number;
  planDistance: string;        // mm as decimal string
  planDuration: number;
  planElevGain: number;
  planPitch: number;
  planSets: number;
  planTrainingLoad: number;
}

export interface WeekStageSumByType {
  sportType: number;
  trainSum: WeekStageSportSummary;
}

/** Aggregate training summary for a week stage (includes ATI/CTI and load ratios) */
export interface WeekStageTrainSum extends WeekStageSportSummary {
  actualAti: number;
  actualCti: number;
  actualTiredRate: number;
  actualTiredRateNew: number;
  actualTrainingLoadRatio: number;
  planAti: number;
  planCti: number;
  planTiredRate: number;
  planTiredRateNew: number;
  planTrainingLoadRatio: number;
}

export interface WeekStage {
  firstDayInWeek: number;      // YYYYMMDD — Monday of the week
  planId: string;
  stage: number;
  sumByType: WeekStageSumByType[];
  trainSum: WeekStageTrainSum;
}

/** Lightweight sub-plan object nested inside the schedule response */
export interface ScheduleSubPlan {
  access: number;
  authorId: string;
  category: number;
  competitions: unknown[];
  createTime: string;
  endDay: number;              // YYYYMMDD
  eventTags: unknown[];
  executeStatus: number;
  id: string;
  inSchedule: number;
  likeTpIds: unknown[];
  maxIdInPlan: string;
  maxPlanProgramId: string;
  maxWeeks: number;
  minWeeks: number;
  name: string;
  overview: string;
  pbVersion: number;
  planIcon: number;
  planIdIndex: number;
  sourceUrl: string;
  sportDatasInPlan: unknown[];
  sportDatasNotInPlan: unknown[];
  starTimestamp: number;
  startDay: number;            // YYYYMMDD
  status: number;
  thirdPartyId: number;
  totalDay: number;
  unit: number;
  updateTime: string;
  updateTimestamp: number;
  userId: string;
  userInfos: unknown[];
  version: number;
  weekStages: unknown[];
}

/** Top-level `data` object returned by GET /training/schedule/query */
export interface CorosScheduleData {
  access: number;
  authorId: string;
  category: number;
  createTime: string;
  endDay: number;              // YYYYMMDD
  entities: ScheduleEntity[];  // one entry per planned workout day within the queried date range
  executeStatus: number;
  id: string;
  inSchedule: number;
  likeTpIds: string[];
  maxIdInPlan: string;
  maxPlanProgramId: string;
  name: string;
  pauseInApp: number;
  pbVersion: number;
  planIdIndex: number;
  programs: ScheduleProgram[]; // full workout definitions for each idInPlan
  score: number;
  sourceUrl: string;
  sportDatasInPlan: ScheduleSportData[];
  sportDatasNotInPlan: ScheduleSportData[];
  starTimestamp: number;
  startDay: number;            // YYYYMMDD
  status: number;
  subPlans: ScheduleSubPlan[];
  thirdPartyId: number;
  totalDay: number;
  type: number;
  unit: number;
  updateTime: string;
  updateTimestamp: number;
  userId: string;
  userInfos: unknown[];
  version: number;
  weekStages: WeekStage[];
}

/** Full response envelope for GET /training/schedule/query */
export type CorosScheduleQueryResponse = CorosApiResponse<CorosScheduleData>;

// ─── Goal Types ───────────────────────────────────────────────────────────────

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

/** Matches the Prisma Goal model — returned by GET /goal and POST /goal */
export interface GoalData {
  id: number;
  goalType: GoalType;
  /** null for non-race goals */
  raceDistance: RaceDistance | null;
  /** optional target finish time in seconds */
  targetTimeSeconds: number | null;
  /** ISO date string of the target race day, or null */
  raceDate: string | null;
  experienceLevel: ExperienceLevel;
  /** training days per week, 3–7 */
  daysPerWeek: number;
  createdAt: string;
  updatedAt: string;
}
