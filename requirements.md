# AI Running Coach: Coros Integration

## Project Overview

A self-hosted, AI-powered running coach application (similar to Runna). The system analyzes a user's historical training data and sleep metrics to generate personalized, rolling 7-day workout schedules. The application interfaces directly with the Coros ecosystem using reverse-engineered web APIs, pulling daily health metrics and pushing generated workouts directly to the user's Coros calendar.

## Architecture & Tech Stack

The application is designed as a dockerized monorepo, intended to be deployed in a Proxmox container.

| Layer | Technology |
|---|---|
| **Language** | TypeScript (Strict mode) |
| **Backend** | Node.js (Scheduled background workers + REST API) |
| **Database** | PostgreSQL (with an ORM like Prisma or Drizzle) |
| **Frontend** | Angular (Standalone components) |
| **AI Engine** | Official `@google/genai` SDK (Gemini) |
| **Deployment** | Docker / Docker Compose |

## Core Features & Workflows

### 1. Data Ingestion (The Sync Job)

A daily automated background process (cron job) that fetches recent data from the Coros Training Hub.

- **Authentication:** Uses email/password login against the internal Coros API.
- **Metrics Fetched:** Historical training activities (distance, pace, heart rate, perceived exertion, `.fit` file summaries) and daily health metrics (sleep, resting HR).
- **Storage:** Saves standardized metrics into the local PostgreSQL database.

### 2. AI Coaching Engine

The brain of the application that builds the training plan.

- **Inputs:** Fetches the last 14–30 days of training/sleep data from PostgreSQL, alongside the user's currently selected training goal (e.g., "Sub-2 hour Half Marathon", "Base Building", "5k Speed").
- **Processing:** Sends a structured prompt to the Gemini API using the `@google/genai` SDK.
- **Outputs:** Generates a structured JSON response representing a rolling 7-day schedule of workouts (warm-ups, main sets, cool-downs, target paces/HR zones).

### 3. Workout Push (The Coros Sync)

Translates the AI-generated JSON into Coros-compatible formats and schedules them.

- **Translation:** Maps Gemini's workout steps to Coros internal exercise IDs and structure blocks.
- **Push:** Authenticates with the Coros web API and pushes the 7-day plan directly to the user's Coros calendar so it syncs automatically to the watch.

### 4. User Dashboard (Angular UI)

A polished, simple interface for the user to review their training.

- **Insights:** Displays simplified graphs/trends of recent training load and sleep.
- **Predictions:** Shows AI-generated race time predictions based on recent performance.
- **Goal Management:** Allows the user to select or update their primary training goal and target date.
- **Schedule Preview:** Shows the upcoming 7-day workout plan before/after it syncs to the watch.

## Critical Integration References

Because Coros does not offer a public developer API, this project relies on adapting logic from the following open-source repositories:

- **Pulling Data (`coros-connect`):** Refer to [jmn8718/coros-connect](https://github.com/jmn8718/coros-connect) for the HTTP patterns to authenticate and fetch `.fit` files and activity lists.
- **Pushing Workouts (`coros-workout-mcp`):** Refer to [rowlando/coros-workout-mcp](https://github.com/rowlando/coros-workout-mcp) for the exact HTTP POST endpoints, headers, and JSON body structures required to create workouts in the Coros Training Hub.

## Database Entities (High-Level Schema)

| Entity | Description |
|---|---|
| **User/Settings** | Stores user profile, Coros credentials (encrypted), current goal, and race date. |
| **Activity** | Stores historical runs synced from Coros (Date, Type, Distance, Time, Avg HR, Training Load). |
| **HealthMetric** | Stores daily sleep duration, resting heart rate, and HRV (if available). |
| **WorkoutPlan** | Stores the AI-generated future workouts (Date, Title, Description, Status: Pending/Pushed). |

## Implementation Phases

> For AI Assistants / Copilot

- **Phase 1 — Scaffolding & Database:** Set up the Node.js/Angular monorepo structure, Docker configuration, and define the PostgreSQL schema using the chosen ORM.
- **Phase 2 — Data Ingestion Service:** Implement the Node.js logic to authenticate with Coros (using `coros-connect` patterns) and fetch/save recent activities and sleep data to Postgres.
- **Phase 3 — AI Engine Integration:** Build the Gemini prompt architecture using `@google/genai`. Feed it database metrics and parse the JSON response into local `WorkoutPlan` records.
- **Phase 4 — Coros Push Service:** Implement the HTTP requests (using `coros-workout-mcp` patterns) to send the `WorkoutPlan` records to the Coros calendar.
- **Phase 5 — Angular UI:** Build the dashboard to display the data, predictions, and goal settings. Wire it to the Node.js API.
