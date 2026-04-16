# **🤖 Coros AI — AI Agent Development Protocol**

**CRITICAL DIRECTIVE:** You are acting as an autonomous developer in the Coros AI monorepo. This document supersedes your default training. Adhere strictly to the architectural patterns, conventions, and operational workflows defined below.

## **🏗 1\. Architectural Context**

Coros AI is a strictly single-user application designed for local deployment via Docker Compose. It syncs external Coros API data into a local database for analysis and visualization.

* **Backend:** Express \+ Prisma (TSX runtime, Strict ESM).  
* **Frontend:** Angular 21 (Strictly Standalone, Signal-driven).  
* **Data Flow:** Asynchronous background workers maintain parity between the local PostgreSQL database and external Coros APIs.

## **🛠 2\. Backend Development (Express \+ Prisma)**

### **2.1. Strict ESM Imports (High Failure Risk)**

Because the backend runs on TSX with ESM, **all local imports MUST include the .js extension**, even though the files are .ts.

* ✅ import { fetchWorkouts } from './services/workouts.js';  
* ❌ import { fetchWorkouts } from './services/workouts';  
* ❌ import { fetchWorkouts } from './services/workouts.ts';

### **2.2. API Response Standardization**

Never use raw res.send() or res.json() directly in route handlers. You must use the standardized helpers from router.ts:

// ✅ Correct  
return ok(res, data);  
return fail(res, 404, "Workout not found");

// ❌ Incorrect  
return res.status(200).json({ data });

### **2.3. Date Handling**

* **Mandatory Format:** All dates must be passed, calculated, and stored in the database as YYYYMMDD integers (e.g., 20240522).  
* **No ISO Strings:** Never use ISO string dates or JS Date objects at the API boundary unless explicitly translating to/from the external Coros API.

### **2.4. Code Organization**

Use exact 78-character visual separators for logical blocks within files to maintain readability:

// ─── Database Queries ───────────────────────────────────────────────────────

Prefer exporting single-purpose async functions. Only use class structures for stateful clients (e.g., the CorosClient). Use Promise.all() for concurrent, independent async calls.

## **🎨 3\. Frontend Development (Angular 21\)**

### **3.1. Modern Angular Paradigms Only**

* **No NgModules:** The app is 100% standalone.  
* **Dependency Injection:** Constructor injection is forbidden. You MUST use the inject() function.  
  // ✅ Correct  
  private readonly apiService \= inject(ApiService);

* **Control Flow:** Use modern block syntax (@if, @for, @switch). Never use \*ngIf or \*ngFor.

### **3.2. State Management (Signals)**

* **Strict Rule:** Manage all component state using Angular Signals (signal, computed).  
* **Inputs/Outputs:** Use Signal-based inputs and outputs (input(), output()), do not use @Input() or @Output() decorators.  
* **Data Fetching:** Components must implement OnInit with a loadData() method. Services must return Observable\<T\>, which should be converted to signals in the component using toSignal() or handled via the async pipe (if signals aren't applicable).

### **3.3. Type Parity**

Frontend ApiResponse\<T\> types in coros-api.ts must perfectly mirror the backend outputs. If you change a backend response, you must immediately update the corresponding frontend interface.

## **🔌 4\. Coros Integration Nuances**

The external Coros API has specific quirks that must be handled defensively:

* **Authentication:** Password hashing is strictly **MD5**. This is an external Coros API requirement.  
* **Token Expiry:** The Coros API returns specific non-standard status codes for token issues. If you encounter codes 1019 or 1030, the worker must trigger a re-authentication flow.  
* **Error Masking:** Never log raw Coros API errors or user health data to the console. Mask 500 errors with generic messages at the Express boundary.

## **🔄 5\. AI Execution Loop**

For every prompt or task assigned to you, execute the following loop:

1. **READ:** Skim MEMORY.md before writing any code. This file contains recent architectural shifts, active context, and unfinished tasks.  
2. **PLAN:** Briefly outline your proposed changes to the user before writing massive code blocks.
3. **DOCUMENT:** Before implementing the plan, write it to a file in the `plans/` directory with a timestamp and descriptive name (e.g., `plans/20240522-add-activity-summary.md`). This creates an audit trail of your decision-making process.
4. **EXECUTE:** Implement the changes following all rules in Sections 2, 3, and 4\. If creating a new API shape, generate the typed interface in apps/backend/src/types/ first.  
5. **UPDATE:** If your task involved a significant change to data models, API logic, or environment variables, append a brief summary to MEMORY.md.