# **Feature Requirements Document: Goals Management**

## **1\. Overview**

**Objective:** Extract the goal management functionality from the current "Settings" page into a dedicated, top-level "Goals" page. This feature will allow users to set, track, and review their running goals. It utilizes a "Unified Goal Schema" where users always have one Primary Goal (whether a specific race or an open-ended "Base Building" phase) that steers the AI coach.

## **2\. UI/UX Requirements**

* **Navigation:** Add a new "Goals" item to the main left-hand sidebar menu, positioned directly above "Settings".  
* **Header:** Title "MY RUNNING GOALS".  
* **Tabbed Interface (Simplified to 2 Tabs):**  
  * **CURRENT GOALS:** Displays the Active Primary Goal prominently at the top, followed by any Active Secondary Goals (tune-ups).  
    * *Primary Card Layout:* Title, progress bar (if applicable), current vs. target metrics, target date.  
    * **AI Progress Status:** Displays an AI-generated status indicator (e.g., 🟢 On Track, 🟡 Falling Behind, 🔵 Ahead of Schedule) based on recent workout evaluations.  
    * *Secondary Card Layout:* Smaller cards for tune-up races acting as schedule constraints.  
    * *Actions:* "EDIT GOAL", "MANAGE PROGRESS", "+ CREATE NEW GOAL".  
  * **PAST GOALS:** Displays historical goals.  
    * *Card Layout:* Title, Status (COMPLETED, ARCHIVED), Achievement/End Date, Reason (if archived/abandoned).  
    * *Actions:* "View Progress" (links to historical data/insights).

## **3\. Functional Requirements**

### **3.1. Goal Creation & Editing**

* **The "One Captain" Rule:** The system allows only **one** Active Primary Goal at a time. If a user sets a new Primary Goal, the previous one is automatically archived or marked complete.  
* **Goal Types:**  
  * *Race Goal:* Target distance, target date, optional finish time. Toggle for "Make this my Primary Goal".  
  * *Pace Goal:* Target distance, target pace, target date. (Always Primary).  
  * *Distance Goal:* E.g., "Run a 10K without stopping". (Always Primary).  
  * *Base Building / Just Run:* Endless, non-time-bound goals. (Always Primary).

### **3.2. AI Feasibility & Health Check**

* When saving a new Primary Goal, the frontend triggers POST /api/goals/validate.  
* The AI evaluates the attainability based on current fitness (checks for 10% volume rule violations, unrealistic pace jumps).  
* *Fail Open:* If the AI times out, the goal saves anyway.  
* *Confirmation:* If unhealthy, the user gets a warning modal and must explicitly override it.

### **3.3. Training Plan Generation & Progress Evaluation**

* **Macro-cycle Prioritization:** The AI looks *only* at the single isPrimary goal to determine the periodization block (Base, Build, Peak, Taper).  
* **Micro-cycle Constraints:** The AI looks at secondary/minor races for the upcoming week and adjusts daily schedules (e.g., adding rest before a tune-up 5k).  
* **NEW \- Progress Evaluation:** When generating the upcoming week, the AI reviews the completion and performance of the *previous* week. It evaluates this against the macro-cycle timeline and updates the goal's progressStatus (On Track, Behind, etc.), which is reflected on the UI.

## **4\. Data Model Changes (Prisma)**

// Proposed additions to schema.prisma  
model Goal {  
  id                  String    @id @default(uuid())  
  userId              String  
  user                User      @relation(fields: \[userId\], references: \[id\])  
  title               String  
  type                GoalType  // Enum: RACE, PACE, DISTANCE, JUST\_RUN, BASE\_BUILDING  
  status              GoalStatus // Enum: ACTIVE, COMPLETED, ARCHIVED  
  isPrimary           Boolean   @default(false)   
    
  // Specific Goal Metrics  
  raceDistance        String?     
  targetDate          DateTime?  
  targetTimeSeconds   Int?        
    
  // Progress Tracking  
  progressStatus      ProgressStatus @default(NOT\_EVALUATED)  
  progressNotes       String?   // AI's brief explanation for the status  
    
  // Training Parameters  
  experienceLevel     ExperienceLevel @default(INTERMEDIATE)  
  trainingDaysPerWeek Int             @default(4)  
    
  // AI Coaching Flags  
  aiWarningIgnored    Boolean   @default(false)  
  archivedReason      String?  
    
  createdAt           DateTime  @default(now())  
  updatedAt           DateTime  @updatedAt  
}

enum GoalType { RACE, PACE, DISTANCE, JUST\_RUN, BASE\_BUILDING }  
enum GoalStatus { ACTIVE, COMPLETED, ARCHIVED }  
enum ExperienceLevel { BEGINNER, INTERMEDIATE, ADVANCED }  
enum ProgressStatus { ON\_TRACK, FALLING\_BEHIND, AHEAD, NOT\_EVALUATED }

## **5\. API Endpoints Needed**

* GET /api/goals  
* POST /api/goals/validate  
* POST /api/goals  
* PUT /api/goals/:id  
* DELETE /api/goals/:id