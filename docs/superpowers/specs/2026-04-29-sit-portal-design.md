# SIT Portal — Design Spec
**Date:** 2026-04-29  
**Status:** Ready for implementation planning

---

## Overview

Extend CTT to support System Integration Testing (SIT) alongside the existing UAT workflow. SIT testers (QA role) get their own portal: they pick Jira tickets, author test cases directly in CTT, execute them case-by-case, attach evidence, and formally sign off with a digital signature. Admins retain full read visibility into SIT tasks, separated from UAT.

---

## Goals

- Give QA testers a first-class portal that replaces the current Excel-based SIT workflow
- Preserve UAT data model and flows — zero disruption to existing stakeholders
- Maintain a soft SIT → UAT gate (warn, don't block, if SIT isn't signed off when UAT task is created)
- Match the existing Excel column structure exactly so QA adoption friction is minimal

---

## Scope

**In scope:**
- New `QA` user role
- New Prisma models: `SitTask`, `SitTaskCountry`, `SitTestCase`, `SitEvidence`
- QA portal (dashboard, Jira intake queue, test case authoring, execution, sign-off)
- Admin read view for SIT tasks (separated from UAT, but coherent)
- Jira transitions: Ready for Testing → Testing → SIT Done (configurable per product)
- Sign-off report (HTML, same pattern as UAT) + Jira subtask attachment
- Soft UAT gate: warn admin when creating UAT task if SIT not signed off

**Out of scope (future):**
- SIT → UAT automated task creation trigger
- SIT task templates / bulk import from Excel
- QA performance metrics / reporting dashboard

---

## User Roles

| Role | Can do |
|------|--------|
| ADMIN | Full UAT management, read-only SIT view, manage QA users + product assignments |
| QA | SIT portal only: view Jira queue (assigned products), create/author SIT tasks, execute test cases, sign off |
| STAKEHOLDER | UAT portal only — unchanged |

QA product access reuses the existing `ProductAccess` join pattern (admin assigns QA to products, same as stakeholders today).

---

## Data Model

### New Prisma Models

```prisma
enum SitTaskStatus {
  DRAFT
  READY        // Jira transitioned to "Ready for Testing"
  IN_PROGRESS  // QA actively testing; Jira transitioned to "Testing"
  SIGNED_OFF
}

enum SitCaseStatus {
  NOT_STARTED
  PASS
  CONDITIONAL  // Passes with conditions/caveats — counts toward sign-off eligibility
  FAIL
  BLOCKED
}

enum SitEvidenceType {
  IMAGE
  JAM_LINK
}

model SitTask {
  id            String        @id @default(cuid())
  sprintName    String                            // Sprint name fetched from Jira issue fields (fields.sprint.name) on task creation; editable free text
  jiraTicket    String
  title         String                            // User story name from Jira
  productId     String
  module        String?
  environment   String?                           // e.g. "Staging"
  status        SitTaskStatus @default(DRAFT)
  assigneeId    String?                           // QA user — self-assigned from queue (not admin-assigned)
  signedOffAt   DateTime?
  signedOffById String?
  signatureData String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  updatedById   String?

  product       Product         @relation(...)
  assignee      User?           @relation("SitTaskAssignee", ...)
  signedOffBy   User?           @relation("SitTaskSignedOffBy", ...)
  countries     SitTaskCountry[]
  testCases     SitTestCase[]
  history       SitTaskHistory[]

  @@unique([jiraTicket, productId])           // One SIT task per Jira ticket per product
  @@index([productId, status])
  @@index([assigneeId, status])
}

model SitTaskCountry {
  sitTaskId   String
  countryCode String
  sitTask     SitTask @relation(...)
  country     Country @relation(...)
  @@id([sitTaskId, countryCode])
}

model SitTestCase {
  id             String         @id @default(cuid())
  sitTaskId      String
  seqId          Int                              // TC#1, TC#2 within task
  priority       String?                          // "3-Medium", "1-Critical"
  category       String?                          // "Functionality", "UI"
  name           String
  description    String?
  steps          String?                          // Preconditions + numbered steps (rich text)
  expectedResult String?
  testData       String?
  actualResult              String?
  status                    SitCaseStatus  @default(NOT_STARTED)
  testerName                String?                          // Auto-stamped from session user on action
  testedAt                  DateTime?                        // Auto-stamped on PASS/FAIL/BLOCKED/CONDITIONAL action
  conditionalNote           String?                          // Required when status=CONDITIONAL; explains the condition or deferred requirement
  adminAcknowledgedAt       DateTime?                        // Set when admin acknowledges a CONDITIONAL case
  adminAcknowledgedById     String?
  splitByCountry            Boolean        @default(false)   // When true, QA records per-country results instead of one global result

  sitTask        SitTask                  @relation(...)
  evidence       SitEvidence[]
  defects        SitDefect[]
  countryResults SitTestCaseCountryResult[]

  @@index([sitTaskId, seqId])
}

model SitTestCaseCountryResult {
  id            String        @id @default(cuid())
  sitTestCaseId String
  countryCode   String
  status        SitCaseStatus @default(NOT_STARTED)
  actualResult  String?
  testerName    String?
  testedAt      DateTime?

  testCase      SitTestCase   @relation(...)
  country       Country       @relation(...)

  @@unique([sitTestCaseId, countryCode])
}

enum SitHistoryAction {
  TASK_CREATED
  TASK_PUBLISHED           // DRAFT → READY
  STATUS_CHANGED
  TEST_CASE_ADDED
  TEST_CASE_MODIFIED       // steps, expected result, name, priority, category changed
  TEST_CASE_REMOVED
  TEST_CASE_RESULT_RECORDED    // PASS / FAIL / CONDITIONAL / BLOCKED stamped
  CONDITIONAL_ACKNOWLEDGED     // Admin acknowledged a CONDITIONAL test case
  DEFECT_LINKED
  DEFECT_UNLINKED
  EVIDENCE_ADDED
  SCOPE_NOTE_ADDED             // freetext scope change note from QA
  SIGNED_OFF
}

model SitTaskHistory {
  id        String            @id @default(cuid())
  sitTaskId String
  actorId   String
  action    SitHistoryAction
  message   String                               // Human-readable summary
  before    Json?                                // Snapshot before change
  after     Json?                                // Snapshot after change
  createdAt DateTime          @default(now())

  sitTask   SitTask           @relation(...)
  actor     User              @relation(...)

  @@index([sitTaskId, createdAt])
}

model SitDefect {
  id            String      @id @default(cuid())
  sitTestCaseId String
  jiraKey       String                           // e.g. "EO-456" — defect ticket
  summary       String?                          // Pulled from Jira on link
  status        String?                          // Jira status e.g. "Open", "In Progress"
  priority      String?                          // Jira priority e.g. "High"
  url           String?                          // Direct link to Jira defect ticket
  createdAt     DateTime    @default(now())

  testCase      SitTestCase @relation(...)

  @@index([sitTestCaseId])
  @@index([jiraKey])
}

model SitEvidence {
  id            String          @id @default(cuid())
  sitTestCaseId String
  type          SitEvidenceType
  url           String?                           // Jam.dev link: https://jam.dev/c/...
  imageData     String?                           // Base64 for uploaded images
  filename      String?
  createdAt     DateTime        @default(now())

  testCase      SitTestCase     @relation(...)
}
```

### Changes to Existing Models

**`UserRole` enum** — add `QA`

**`Product` model** — add three optional Jira transition fields:
```prisma
jiraReadyForTestingTransition  String?   // default "Ready for Testing"
jiraTestingTransition          String?   // default "Testing"
jiraSitDoneTransition          String?   // default "SIT Done"
```

No changes to `Task`, `TaskStep`, or any UAT models.

---

## SIT Task Lifecycle

```
DRAFT → READY → IN_PROGRESS → SIGNED_OFF
          ↑           ↑              ↑
   Jira: "Ready   Jira: "Testing"  Jira: configurable
   for Testing"                    + subtask + report
```

**Status transitions:**
- `DRAFT → READY`: QA publishes task (all test cases authored, environment set). CTT fires Jira transition "Ready for Testing".
- `READY → IN_PROGRESS`: QA records first test case result. CTT fires Jira transition "Testing".
- `IN_PROGRESS → SIGNED_OFF`: QA signs off (digital signature). CTT fires Jira "SIT Done" transition + creates Jira subtask with HTML sign-off report attached (same pattern as UAT).

---

## QA Portal — Pages & Views

### Dashboard (`/qa/dashboard`)
- Sprint-grouped SIT task list — all SIT tasks for QA's assigned products (not just personally claimed tasks)
- Status summary per task: X PASS / Y FAIL / Z NOT_STARTED
- Link to Jira queue

### Jira SIT Queue (`/qa/jira-queue`)
- Same visual style as admin Jira intake (galaxy cards)
- Filtered to QA's assigned products
- Shows "Ready for Testing" Jira tickets not yet linked to a SIT task
- "Create SIT Task" button per card → opens task creation form

### SIT Task Creation
- Pre-fills: Jira ticket, title, product, sprint (editable)
- QA sets: environment, countries (multi-select), module
- Navigates to task detail where QA authors test cases

### SIT Task Detail (`/qa/sit-tasks/[id]`)
- Header: task metadata (Jira ticket, sprint, environment, countries, status)
- Test case table (ordered by `seqId`): sortable, inline editing
- Per-row actions: expand to see/edit steps, record result, attach evidence
- "Publish" button (DRAFT → READY), "Sign Off" button (when all cases actioned)

### Test Case Execution (inline within task detail)
- Expand any test case row to see full steps + expected result
- "Actual Result" text field
- PASS / FAIL / BLOCKED action buttons — auto-stamps `testerName` (from session) + `testedAt`
- Evidence section: upload image OR paste Jam.dev URL (multiple per case). Images stored as base64 in DB, consistent with UAT. *(Future: migrate to Vercel Blob for CDN-served files — `@vercel/blob` replaces base64 column with a URL; worth revisiting when evidence volume grows.)*
- **Defect/condition section** (shown when status is FAIL or CONDITIONAL): CTT fetches linked issues from Jira for the parent user story (`GET /rest/api/3/issue/{jiraTicket}?fields=issuelinks`) as a selectable list. QA picks relevant defect(s) or manually enters a Jira key. For CONDITIONAL, QA must also fill `conditionalNote` explaining what the condition or deferred requirement is (required field). Linked defects show key, summary, status, and priority pulled from Jira.
- **Per-country split** (optional): QA can toggle "split by country" on any test case — this replaces the single global result with individual PASS/FAIL/CONDITIONAL rows per country from `SitTaskCountry`.
- Can re-record result (e.g. FAIL → re-test → PASS); defect links remain unless manually removed

### History Section (bottom of task detail)
Chronological audit trail of all scope and execution changes, auto-generated — QA never has to write it manually:

| Action | Example entry |
|--------|--------------|
| Test case added | "TC#4 'Verify promo code' added by Alia" |
| Test case modified | "TC#2 steps updated by Alia — expected result changed" (shows before/after diff) |
| Test case removed | "TC#3 'Long loading' removed by Alia" |
| Result recorded | "TC#1 marked PASS by Alia" |
| Result changed | "TC#2 changed FAIL → PASS by Alia after retest" |
| Defect linked | "EO-456 linked to TC#2 by Alia" |
| Scope note | QA can also add a freetext note ("Scope reduced — EO-3066 deferred to Sprint 6") |
| Status changes | "Task published", "Testing started", "Signed off" |

All entries show actor name + timestamp. Visible to both QA and admin.

### Sign-Off
- Available only when ALL test cases are PASS or CONDITIONAL (no FAIL, BLOCKED, or NOT_STARTED remaining); CONDITIONAL cases must have `conditionalNote` filled
- If any FAIL or BLOCKED exist, sign-off button is disabled with explanation
- Summary shown: pass / conditional / fail counts
- Signature canvas (same component as UAT)
- On submit: SIGNED_OFF + Jira transitions (fire-and-forget) + report generation + Jira comment via subtask (same pattern as UAT)
- **Post sign-off — CONDITIONAL acknowledgment gate:** if any CONDITIONAL cases exist, SIT shows as "Signed off — X conditional item(s) pending admin review". Admin is notified (same notification mechanism as Jira queue SIT alerts). Admin must acknowledge each conditional case in their SIT tab before the soft UAT gate fully clears. Until then, creating a UAT task for this ticket shows: "SIT signed off with X unacknowledged conditional item(s)."

---

## Admin View — SIT Visibility

### Within Task Management (`/admin/tasks`)
- New "SIT" tab alongside existing UAT task list
- SIT tab shows all SIT tasks across assigned products
- Read-only: admin cannot edit test cases or reassign QA tasks
- Columns: Jira ticket, Sprint, Product, Countries, QA assignee, Status, Sign-off date

### Jira Queue (`/admin/jira-intake`)
- SIT sign-off detection (existing) remains unchanged
- Soft gate states when creating a UAT task:
  - 🔴 No SIT task exists → "SIT not started yet — proceed with caution?"
  - 🟡 SIT signed off but has unacknowledged CONDITIONAL items → "SIT signed off with X conditional item(s) pending your review"
  - ✅ SIT signed off, all CONDITIONALs acknowledged → no warning

### Admin SIT Tab — CONDITIONAL Acknowledgment
- CONDITIONAL test cases shown with amber badge and `conditionalNote`
- Admin clicks "Acknowledge" per item → sets `adminAcknowledgedAt` + logs `CONDITIONAL_ACKNOWLEDGED` history entry
- Can add an acknowledgment comment (e.g. "Accepted — will be addressed in Sprint 6")

### User Management (existing admin database page)
- Add QA to the role dropdown
- QA product assignment works the same as stakeholder product access

---

## Jira Integration

| Event | Jira Action |
|-------|-------------|
| Task → READY | Transition to `jiraReadyForTestingTransition` (default: "Ready for Testing") |
| Task → IN_PROGRESS | Transition to `jiraTestingTransition` (default: "Testing") |
| Task → SIGNED_OFF | Transition to `jiraSitDoneTransition` + create subtask "SIT Sign-off Report — [title]" + attach HTML report |

All Jira calls are fire-and-forget (never block sign-off).

---

## Sign-Off Report

Same pattern as UAT sign-off report (`lib/signoffReport.ts`). New `lib/sitSignoffReport.ts` generates an HTML report containing:
- Task metadata (Jira ticket, sprint, product, environment, countries, signed-off by, date)
- Test case table: TC#, Name, Category, Priority, Steps, Expected, Actual, Status, Tester, Date
- Defects column: linked Jira defect keys per FAIL/CONDITIONAL test case (clickable links)
- Evidence thumbnails / Jam.dev links per case
- Signature image

---

## New Routes

```
GET  /qa/dashboard                      QA dashboard
GET  /qa/jira-queue                     QA Jira intake
POST /api/sit-tasks                     Create SIT task
GET  /api/sit-tasks/[id]                Get task + test cases
PUT  /api/sit-tasks/[id]                Update task metadata / status
POST /api/sit-tasks/[id]/test-cases     Create test case
PUT  /api/sit-tasks/[id]/test-cases/[tcId]   Update test case (result, tester, testedAt)
POST /api/sit-tasks/[id]/test-cases/[tcId]/evidence   Upload evidence
DELETE /api/sit-tasks/[id]/test-cases/[tcId]/evidence/[evId]
POST /api/sit-tasks/[id]/signoff        Sign off (same pattern as UAT signoff route)
GET  /api/sit-tasks/[id]/signoff-report HTML report
GET  /api/admin/sit-tasks               Admin read view
```

---

## Resolved Questions

1. **QA task visibility** — product-scoped: QA sees all SIT tasks for their assigned products (not user-scoped)
2. **FAIL blocks sign-off** — confirmed; sign-off button disabled if any FAIL/BLOCKED/NOT_STARTED
3. **Sprint from Jira issue** — fetched from `fields.sprint.name` on the Jira issue when QA creates the SIT task; pre-populated as editable free text (`sprintName`). No `jiraBoardId` needed — sprint data comes directly from the issue.
4. **QA self-assigns** — QA claims tasks from the Jira queue; admin does not assign
5. **Sign-off: PASS + CONDITIONAL** — all cases must be PASS or CONDITIONAL (with mandatory note); FAIL or BLOCKED blocks sign-off. CONDITIONAL cases require admin acknowledgment post sign-off before soft UAT gate fully clears.
6. **Evidence storage** — base64 in DB, consistent with UAT. Vercel Blob flagged as future improvement.
7. **Notifications on sign-off** — Jira comment via subtask (same as UAT) + Jira SIT Done transition + admin notified via existing Jira queue alert mechanism.
8. **Countries per test case** — one global result by default; QA can toggle `splitByCountry` per test case for per-country results via `SitTestCaseCountryResult`.
9. **One SIT task per Jira ticket** — enforced via `@@unique([jiraTicket, productId])`.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add SitTask, SitTaskCountry, SitTestCase, SitTestCaseCountryResult, SitEvidence, SitDefect, SitTaskHistory models; add QA to UserRole; add 3 Jira transition fields to Product |
| `prisma/migrations/...` | New migration |
| `lib/sitSignoffReport.ts` | HTML report generator for SIT |
| `app/api/sit-tasks/...` | All new API routes |
| `app/api/jira/sprints/route.ts` | Fetch active sprints from Jira Board API for sprint dropdown |
| `app/api/jira/defects/route.ts` | Fetch linked defect issues for a user story from Jira (`issuelinks`) |
| `app/api/sit-tasks/[id]/test-cases/[tcId]/defects` | Link / unlink defect tickets to a test case |
| `app/api/sit-tasks/[id]/history` | Get task history; POST scope note |
| `lib/sitHistory.ts` | `createSitHistory()` helper — called on every mutating action |
| `app/qa/...` | New QA portal pages |
| `views/QaDashboard.tsx` | QA dashboard view |
| `views/QaJiraQueue.tsx` | QA Jira intake (filtered) |
| `views/QaSitTaskDetail.tsx` | Task detail + test case authoring + execution |
| `views/AdminTaskManagement.tsx` | Add SIT tab (read-only) |
| `views/AdminJiraIntake.tsx` | Add soft gate warning for UAT creation |
| `views/AdminDatabase.tsx` | Add QA to role management |
| `lib/auth.ts` | Handle QA role routing |
| `App.tsx` | QA view states + routing |
| `types.ts` | New SIT types |
