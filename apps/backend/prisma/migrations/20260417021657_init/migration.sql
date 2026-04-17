-- CreateEnum
CREATE TYPE "WorkoutStatus" AS ENUM ('PENDING', 'PUSHED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "Settings" (
    "id" SERIAL NOT NULL,
    "corosEmail" TEXT NOT NULL,
    "corosPwd" TEXT NOT NULL,
    "accessToken" TEXT,
    "userId" TEXT,
    "unitSystem" TEXT NOT NULL DEFAULT 'metric',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" SERIAL NOT NULL,
    "goalType" TEXT NOT NULL DEFAULT 'BASE_BUILDING',
    "raceDistance" TEXT,
    "targetTimeSeconds" INTEGER,
    "raceDate" TIMESTAMP(3),
    "experienceLevel" TEXT NOT NULL DEFAULT 'INTERMEDIATE',
    "daysPerWeek" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" SERIAL NOT NULL,
    "labelId" TEXT NOT NULL,
    "date" INTEGER NOT NULL,
    "sportType" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "totalTime" INTEGER NOT NULL,
    "avgHr" INTEGER,
    "maxHr" INTEGER,
    "avgPace" DOUBLE PRECISION,
    "trainingLoad" DOUBLE PRECISION,
    "aerobicEffect" DOUBLE PRECISION,
    "calories" INTEGER,
    "startTime" BIGINT,
    "endTime" BIGINT,
    "rawSummary" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthMetric" (
    "id" SERIAL NOT NULL,
    "date" INTEGER NOT NULL,
    "sleepDuration" DOUBLE PRECISION,
    "restingHr" INTEGER,
    "hrv" DOUBLE PRECISION,
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutPlan" (
    "id" SERIAL NOT NULL,
    "date" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "stepsJson" JSONB NOT NULL,
    "status" "WorkoutStatus" NOT NULL DEFAULT 'PENDING',
    "corosWorkoutId" TEXT,
    "pushError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_labelId_key" ON "Activity"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthMetric_date_key" ON "HealthMetric"("date");

-- CreateIndex
CREATE INDEX "WorkoutPlan_date_idx" ON "WorkoutPlan"("date");

-- CreateIndex
CREATE INDEX "WorkoutPlan_status_idx" ON "WorkoutPlan"("status");
