# **AI Goal Attainability & Health Verification Workflow**

This document outlines the pre-save validation process. Its primary purpose is injury prevention and managing realistic user expectations.

## **1\. When it Triggers**

This process is triggered strictly on POST /api/goals/validate when a user attempts to save a new **time-bound or metric-bound Primary Goal** (Races, Pace improvements, Distance milestones). It does *not* trigger for open-ended goals like "Base Building".

## **2\. The Validation Inputs**

To accurately assess a goal, the backend compiles the following payload for Gemini:

* **Proposed Goal:** Distance, Target Date, Target Time (if applicable).  
* **Current Fitness Baseline:**  
  * Average weekly mileage over the last 30-60 days.  
  * Longest single run completed in the last 30 days.  
  * Fastest recent pace for a given distance (e.g., recent 5K time) to estimate current VO2 Max.  
* **User Parameters:** Experience Level, desired Days Per Week.

## **3\. The Two Pillars of Attainability**

The AI is instructed to evaluate the goal based on two strict physiological parameters:

### **A. The Ramp-Up Constraint (Volume)**

*Rule: Mileage should generally not increase by more than 10-15% per week.*

* **Calculation:** The AI calculates the standard peak weekly mileage required for the chosen distance/experience level (e.g., an Intermediate Marathoner needs to peak around 40-50 miles/week).  
* **Check:** Can the user safely scale from their *Current Weekly Mileage* to the *Required Peak Mileage* within the weeks available before the taper begins, without violating the 10-15% rule?  
* *Example Violation:* Current mileage is 10 miles/week. Marathon is in 8 weeks. Safe peak in 5 weeks (before 3-week taper) is \~20 miles. Required peak is 40\. **Flagged.**

### **B. The Physiological Jump (Pace/Fitness)**

*Rule: Aerobic adaptations take time. Massive leaps in VO2 Max or Lactate Threshold cannot be rushed.*

* **Calculation:** If a target time is provided, the AI compares the target pace against current equivalent race paces.  
* **Check:** Is the pace improvement realistic within the timeframe?  
* *Example Violation:* Current 5K is 30:00 (9:39/mi). Target Marathon pace is 7:30/mi in 12 weeks. **Flagged.**

## **4\. Expected AI Output Schema**

The Gemini prompt enforces a strict JSON response schema so the backend can easily interpret the results and trigger the UI modals.

{  
  "isAttainable": boolean,  
  "flagType": "VOLUME" | "PACE" | "BOTH" | "NONE",  
  "warningMessage": "string (A polite but firm explanation of why it's unsafe, meant to be read by the user)",  
  "recommendation": "string (An alternative, safer goal \- e.g., 'Consider a Half Marathon instead, or push your Marathon to Spring.')"  
}

## **5\. Application Handling**

* If isAttainable: true, the frontend proceeds with the POST /api/goals creation call seamlessly.  
* If isAttainable: false, the frontend halts and displays a modal using the warningMessage and recommendation. The user must check a box stating "I understand the risks, save anyway" to bypass this coach's advice.