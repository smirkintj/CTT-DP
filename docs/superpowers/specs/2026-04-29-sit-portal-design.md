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
  sprintId      String                            // Jira sprint ID (fetched from Jira Board API, displayed as sprint name)
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

  @@index([jiraTicket])
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
  actualResult   String?
  status         SitCaseStatus  @default(NOT_STARTED)
  testerName     String?                          // Auto-stamped from session user on action
  testedAt       DateTime?                        // Auto-stamped on PASS/FAIL/BLOCKED action

  sitTask        SitTask        @relation(...)
  evidence       SitEvidence[]
  defects        SitDefect[]

  @@index([sitTaskId, seqId])
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
- Evidence section: upload image OR paste Jam.dev URL (multiple per case)
- **Defect section** (shown when status is FAIL): CTT fetches linked issues from Jira for the parent user story (`GET /rest/api/3/issue/{jiraTicket}?fields=issuelinks`) and displays them as a selectable list. QA picks the relevant defect(s) or manually enters a Jira key. Linked defects show key, summary, status, and priority pulled from Jira. Defects persist as `SitDefect` records on the test case.
- Can re-record result (e.g. FAIL → re-test → PASS); defect links remain unless manually removed

### Sign-Off
- Available only when ALL test cases are PASS or CONDITIONAL (no FAIL, BLOCKED, or NOT_STARTED remaining)
- If any FAIL or BLOCKED exist, sign-off button is disabled with explanation
- Summary shown: pass/conditional/fail counts
- Signature canvas (same component as UAT)
- On submit: SIGNED_OFF + Jira transitions + report generation (fire-and-forget)

---

## Admin View — SIT Visibility

### Within Task Management (`/admin/tasks`)
- New "SIT" tab alongside existing UAT task list
- SIT tab shows all SIT tasks across assigned products
- Read-only: admin cannot edit test cases or reassign QA tasks
- Columns: Jira ticket, Sprint, Product, Countries, QA assignee, Status, Sign-off date

### Jira Queue (`/admin/jira-intake`)
- SIT sign-off detection (existing) remains unchanged
- Soft gate: if creating UAT task for a Jira ticket that has no signed-off SIT task → show amber warning banner "SIT not signed off yet — proceed with caution?"

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
3. **Sprint ID from Jira** — fetched via Jira Board API (`GET /rest/agile/1.0/board/{boardId}/sprint`), stored as Jira sprint ID, displayed as sprint name; requires `jiraBoardId` field on Product
4. **QA self-assigns** — QA claims tasks from the Jira queue; admin does not assign
5. **Sign-off: PASS + CONDITIONAL** — all cases must be PASS or CONDITIONAL; FAIL or BLOCKED blocks sign-off

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add SitTask, SitTaskCountry, SitTestCase, SitEvidence models; add QA to UserRole; add 3 Jira fields to Product |
| `prisma/migrations/...` | New migration |
| `lib/sitSignoffReport.ts` | HTML report generator for SIT |
| `app/api/sit-tasks/...` | All new API routes |
| `app/api/jira/sprints/route.ts` | Fetch active sprints from Jira Board API for sprint dropdown |
| `app/api/jira/defects/route.ts` | Fetch linked defect issues for a user story from Jira (`issuelinks`) |
| `app/api/sit-tasks/[id]/test-cases/[tcId]/defects` | Link / unlink defect tickets to a test case |
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
