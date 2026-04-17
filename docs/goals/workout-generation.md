# **AI Workout Generation & Goal Periodization Workflow**

This document outlines how the AI Coach synthesizes the user's Primary Goal, timeline, and recent data to generate a rolling 7-day schedule, while also continuously evaluating their progress.

## **1\. The Nightly Generation Loop (Rolling 7-Day Window)**

While the AI maintains a 7-day micro-cycle schedule, it evaluates and updates this window dynamically every night to ensure the plan reflects the user's latest physiological data.

**Trigger:** Runs every night via cron job (or on-demand if the user changes settings/goals).

**Data Gathered for the Prompt:**

1. **The Primary Goal:** Type, target date, target time, experience level.  
2. **Timeline Context:** Calculated by the backend (e.g., "Week 4 of 16").  
3. **Recent Performance Data:** The last 14 days of Coros workouts (planned vs. actual completion, average HR, paces hit, HRV trends).  
4. **Upcoming Secondary Goals:** Any tune-up races in the next 14 days.  
5. **Currently Scheduled Workouts:** The workouts already established for the upcoming 7 days.

## **2\. Phase 1: Progress Evaluation ("On Track" Check)**

Before writing or adjusting the week, the AI acts as an analyst. It looks at the user's recent running history and compares it to the trajectory needed for the Primary Goal.

**The AI evaluates:**

* *Volume Adherence:* Did they skip their long runs?  
* *Pace Adherence:* If they have a time goal, are their interval/tempo paces indicating they can hit the target?  
* *Recovery:* Is their HRV tanking, indicating they are overtraining?

**Output of Phase 1:**

The AI outputs a ProgressStatus (ON\_TRACK, FALLING\_BEHIND, AHEAD) and a brief progressNote (e.g., *"Missed the last two long runs; we need to safely build volume back up to stay on track for the marathon."*). This is saved to the database and displayed on the Goals UI.

## **3\. Phase 2: Macro-Cycle Positioning**

The AI determines the current training block based on the weeks remaining until the targetDate:

* **\> 12 Weeks Out (Base Phase):** Focus on Zone 2, aerobic capacity.  
* **8 \- 12 Weeks Out (Build Phase):** Introduce lactate threshold work, increase long run distance.  
* **3 \- 8 Weeks Out (Peak Phase):** Race-specific paces, maximum safe volume, VO2 max intervals.  
* **1 \- 3 Weeks Out (Taper Phase):** Drastic volume reduction, maintain intensity to stay sharp.  
* *If Goal is "Base Building" (No Date):* Locked in Base Phase indefinitely.

## **4\. Phase 3: Writing the 7-Day Micro-Cycle & Schedule Stability**

Using the established Phase, the AI generates the specific workouts for the user's selected trainingDaysPerWeek. Because this runs nightly, the AI must balance adaptation with predictability.

**Schedule Stability (Resistance to Change as a Light Weight):**

Established workouts within the upcoming 7-day window should be treated as a "light weight" or anchor. The AI should avoid trivial, unnecessary shuffling so the user doesn't wake up to a completely different schedule every day for no reason. However, the AI remains flexible and *can* alter an established upcoming workout if:

* *Better Optimization:* A slight shift makes the overall week more balanced or progressive.  
* *Physiological Need:* HRV drops into the "Red" zone, or the user failed a previous workout due to high heart rate.  
* *Behavioral Shift:* The user skipped a key workout (like a long run) earlier in the week, requiring a structural shift to fit it in safely.  
* *New Constraints:* The user manually added a tune-up race.

**Injecting Constraints:**

If a Secondary Goal (tune-up race) exists in the upcoming week:

1. The AI assigns the race distance to the race day.  
2. It replaces the hard workout/long run for that week with the race.  
3. It schedules a rest/shakeout day immediately prior to the race.