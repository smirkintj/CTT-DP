# SIT Portal — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete SIT portal backend — schema, history helper, Jira helpers, sign-off report generator, and all API routes — so QA testers can create SIT tasks, execute test cases, and sign off, while admins can read and acknowledge conditional items.

**Architecture:** New Prisma models (SitTask, SitTestCase, SitEvidence, SitDefect, SitTaskHistory, SitTaskCountry, SitTestCaseCountryResult) sit beside the existing UAT Task model without touching it. All API routes follow the existing Next.js App Router pattern: `getServerSession` → role check → Prisma → `NextResponse.json`. A `createSitHistory()` helper (mirroring `lib/taskHistory.ts`) is called on every mutating action. Sign-off fires Jira transitions + subtask attachment fire-and-forget.

**Tech Stack:** Next.js 15 App Router, Prisma + Neon PostgreSQL, next-auth, TypeScript, Tailwind. No test framework — verify via `npm run build` and manual curl/browser checks. Commit after every task.

**Spec:** `docs/superpowers/specs/2026-04-29-sit-portal-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add all SIT models, enums, QA role, Product Jira transition fields |
| `types.ts` | Modify | Add SIT interfaces, SIT view states, Role.QA |
| `lib/auth.ts` | Modify | Allow QA role through session; add QA home route |
| `app/AppRouteShell.tsx` | Modify | Add QA route cases |
| `lib/sitHistory.ts` | Create | `createSitHistory()` — called by every mutating SIT route |
| `lib/jira.ts` | Modify | Add `fetchJiraIssueSprint()` and `fetchJiraIssueLinks()` |
| `lib/sitSignoffReport.ts` | Create | HTML sign-off report for SIT (mirrors `lib/signoffReport.ts`) |
| `app/api/sit-tasks/route.ts` | Create | GET list (QA + admin), POST create |
| `app/api/sit-tasks/[id]/route.ts` | Create | GET single task, PUT update metadata/status |
| `app/api/sit-tasks/[id]/test-cases/route.ts` | Create | POST create test case |
| `app/api/sit-tasks/[id]/test-cases/[tcId]/route.ts` | Create | PUT update result/status/fields |
| `app/api/sit-tasks/[id]/test-cases/[tcId]/evidence/route.ts` | Create | POST add evidence, GET Jira links |
| `app/api/sit-tasks/[id]/test-cases/[tcId]/evidence/[evidenceId]/route.ts` | Create | DELETE specific evidence |
| `app/api/sit-tasks/[id]/test-cases/[tcId]/defects/route.ts` | Create | POST link defect |
| `app/api/sit-tasks/[id]/test-cases/[tcId]/defects/[defectId]/route.ts` | Create | DELETE specific defect |
| `app/api/sit-tasks/[id]/history/route.ts` | Create | GET history, POST scope note |
| `app/api/sit-tasks/[id]/signoff/route.ts` | Create | POST sign off (signature + Jira fire-and-forget) |
| `app/api/sit-tasks/[id]/signoff-report/route.ts` | Create | GET HTML report |
| `app/api/admin/sit-tasks/route.ts` | Create | GET all SIT tasks for admin |
| `app/api/admin/sit-tasks/[id]/acknowledge/route.ts` | Create | POST acknowledge CONDITIONAL test case |
| `app/api/jira/sit-queue/route.ts` | Create | GET Jira issues in "Ready for Testing" for QA's products |

---

## Task 1: Prisma Schema — SIT Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add QA to UserRole enum**

Find the `enum UserRole` block and add `QA`:
```prisma
enum UserRole {
  ADMIN
  STAKEHOLDER
  QA
}
```

- [ ] **Step 2: Add three Jira transition fields to Product model**

Find `model Product` and add after the existing `jiraReadyToDeployTransition` line:
```prisma
  jiraReadyForTestingTransition String?
  jiraTestingTransition         String?
  jiraSitDoneTransition         String?
```

- [ ] **Step 3: Add all SIT enums**

Add after the existing enums section:
```prisma
enum SitTaskStatus {
  DRAFT
  READY
  IN_PROGRESS
  SIGNED_OFF
}

enum SitCaseStatus {
  NOT_STARTED
  PASS
  CONDITIONAL
  FAIL
  BLOCKED
}

enum SitEvidenceType {
  IMAGE
  JAM_LINK
}

enum SitHistoryAction {
  TASK_CREATED
  TASK_PUBLISHED
  STATUS_CHANGED
  TEST_CASE_ADDED
  TEST_CASE_MODIFIED
  TEST_CASE_REMOVED
  TEST_CASE_RESULT_RECORDED
  CONDITIONAL_ACKNOWLEDGED
  DEFECT_LINKED
  DEFECT_UNLINKED
  EVIDENCE_ADDED
  SCOPE_NOTE_ADDED
  SIGNED_OFF
}
```

- [ ] **Step 4: Add SitTask model**

```prisma
model SitTask {
  id            String        @id @default(cuid())
  sprintName    String
  jiraTicket    String
  title         String
  productId     String
  module        String?
  environment   String?
  status        SitTaskStatus @default(DRAFT)
  assigneeId    String?
  signedOffAt   DateTime?
  signedOffById String?
  signatureData String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  updatedById   String?

  product     Product          @relation(fields: [productId], references: [id])
  assignee    User?            @relation("SitTaskAssignee", fields: [assigneeId], references: [id])
  signedOffBy User?            @relation("SitTaskSignedOffBy", fields: [signedOffById], references: [id])
  updatedBy   User?            @relation("SitTaskUpdatedBy", fields: [updatedById], references: [id])
  countries   SitTaskCountry[]
  testCases   SitTestCase[]
  history     SitTaskHistory[]

  @@unique([jiraTicket, productId])
  @@index([productId, status])
  @@index([assigneeId, status])
}

model SitTaskCountry {
  sitTaskId   String
  countryCode String
  sitTask     SitTask @relation(fields: [sitTaskId], references: [id], onDelete: Cascade)
  country     Country @relation(fields: [countryCode], references: [code])
  @@id([sitTaskId, countryCode])
}
```

- [ ] **Step 5: Add SitTestCase and SitTestCaseCountryResult models**

```prisma
model SitTestCase {
  id                    String        @id @default(cuid())
  sitTaskId             String
  seqId                 Int
  priority              String?
  category              String?
  name                  String
  description           String?
  steps                 String?
  expectedResult        String?
  testData              String?
  actualResult          String?
  status                SitCaseStatus @default(NOT_STARTED)
  testerName            String?
  testedAt              DateTime?
  conditionalNote       String?
  adminAcknowledgedAt   DateTime?
  adminAcknowledgedById String?
  splitByCountry        Boolean       @default(false)

  sitTask        SitTask                    @relation(fields: [sitTaskId], references: [id], onDelete: Cascade)
  adminAcknowledgedBy User?                @relation("SitCaseAcknowledgedBy", fields: [adminAcknowledgedById], references: [id])
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

  testCase SitTestCase @relation(fields: [sitTestCaseId], references: [id], onDelete: Cascade)
  country  Country     @relation(fields: [countryCode], references: [code])

  @@unique([sitTestCaseId, countryCode])
}
```

- [ ] **Step 6: Add SitEvidence, SitDefect, SitTaskHistory models**

```prisma
model SitEvidence {
  id            String          @id @default(cuid())
  sitTestCaseId String
  type          SitEvidenceType
  url           String?
  imageData     String?
  filename      String?
  createdAt     DateTime        @default(now())

  testCase SitTestCase @relation(fields: [sitTestCaseId], references: [id], onDelete: Cascade)
}

model SitDefect {
  id            String   @id @default(cuid())
  sitTestCaseId String
  jiraKey       String
  summary       String?
  status        String?
  priority      String?
  url           String?
  createdAt     DateTime @default(now())

  testCase SitTestCase @relation(fields: [sitTestCaseId], references: [id], onDelete: Cascade)

  @@index([sitTestCaseId])
  @@index([jiraKey])
}

model SitTaskHistory {
  id        String           @id @default(cuid())
  sitTaskId String
  actorId   String
  action    SitHistoryAction
  message   String
  before    Json?
  after     Json?
  createdAt DateTime         @default(now())

  sitTask SitTask @relation(fields: [sitTaskId], references: [id], onDelete: Cascade)
  actor   User    @relation("SitHistoryActor", fields: [actorId], references: [id])

  @@index([sitTaskId, createdAt])
}
```

- [ ] **Step 7: Verify the schema compiles**

```bash
npx prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 8: Commit schema**

```bash
git add prisma/schema.prisma
git commit -m "feat(sit): add SIT models to Prisma schema — SitTask, SitTestCase, SitEvidence, SitDefect, SitTaskHistory, SitTaskCountry, SitTestCaseCountryResult; add QA role; add Jira SIT transition fields to Product"
```

---

## Task 2: Run Migration

**Files:**
- Create: `prisma/migrations/<timestamp>_sit_portal/migration.sql` (auto-generated)

- [ ] **Step 1: Create and apply the migration**

```bash
npx prisma migrate dev --name sit_portal
```
Expected: `Your database is now in sync with your schema.` and a new migration file created.

- [ ] **Step 2: Regenerate Prisma client**

```bash
npx prisma generate
```
Expected: `Generated Prisma Client`

- [ ] **Step 3: Commit migration**

```bash
git add prisma/migrations/
git commit -m "feat(sit): apply sit_portal migration"
```

---

## Task 3: Types — SIT Interfaces and ViewState

**Files:**
- Modify: `types.ts`

- [ ] **Step 1: Add Role.QA to the Role enum**

Find `export enum Role {` and add:
```typescript
export enum Role {
  ADMIN = 'ADMIN',
  STAKEHOLDER = 'STAKEHOLDER',
  QA = 'QA',
}
```

- [ ] **Step 2: Add QA view states to ViewState**

Find the `ViewState` type and extend it:
```typescript
export type ViewState =
  | 'LOGIN'
  | 'DASHBOARD_STAKEHOLDER'
  | 'DASHBOARD_ADMIN'
  | 'TASK_DETAIL'
  | 'IMPORT_WIZARD'
  | 'ADMIN_TASK_MANAGEMENT'
  | 'ADMIN_DATABASE'
  | 'ADMIN_JIRA_INTAKE'
  | 'INBOX'
  | 'KNOWLEDGE_BASE'
  | 'QA_DASHBOARD'
  | 'QA_JIRA_QUEUE'
  | 'QA_SIT_TASK_DETAIL';
```

- [ ] **Step 3: Add SIT interfaces**

Add at the bottom of `types.ts`:
```typescript
export type SitTaskStatus = 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'SIGNED_OFF';
export type SitCaseStatus = 'NOT_STARTED' | 'PASS' | 'CONDITIONAL' | 'FAIL' | 'BLOCKED';
export type SitEvidenceType = 'IMAGE' | 'JAM_LINK';
export type SitHistoryAction =
  | 'TASK_CREATED' | 'TASK_PUBLISHED' | 'STATUS_CHANGED'
  | 'TEST_CASE_ADDED' | 'TEST_CASE_MODIFIED' | 'TEST_CASE_REMOVED'
  | 'TEST_CASE_RESULT_RECORDED' | 'CONDITIONAL_ACKNOWLEDGED'
  | 'DEFECT_LINKED' | 'DEFECT_UNLINKED' | 'EVIDENCE_ADDED'
  | 'SCOPE_NOTE_ADDED' | 'SIGNED_OFF';

export interface SitCountryResult {
  countryCode: string;
  status: SitCaseStatus;
  actualResult: string | null;
  testerName: string | null;
  testedAt: string | null;
}

export interface SitEvidence {
  id: string;
  type: SitEvidenceType;
  url: string | null;
  filename: string | null;
  createdAt: string;
}

export interface SitDefect {
  id: string;
  jiraKey: string;
  summary: string | null;
  status: string | null;
  priority: string | null;
  url: string | null;
}

export interface SitTestCase {
  id: string;
  seqId: number;
  priority: string | null;
  category: string | null;
  name: string;
  description: string | null;
  steps: string | null;
  expectedResult: string | null;
  testData: string | null;
  actualResult: string | null;
  status: SitCaseStatus;
  testerName: string | null;
  testedAt: string | null;
  conditionalNote: string | null;
  adminAcknowledgedAt: string | null;
  splitByCountry: boolean;
  evidence: SitEvidence[];
  defects: SitDefect[];
  countryResults: SitCountryResult[];
}

export interface SitTaskSummary {
  id: string;
  sprintName: string;
  jiraTicket: string;
  title: string;
  productId: string;
  productName: string;
  module: string | null;
  environment: string | null;
  status: SitTaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  signedOffAt: string | null;
  countryCodes: string[];
  testCaseCount: number;
  passCount: number;
  failCount: number;
  conditionalCount: number;
  blockedCount: number;
  notStartedCount: number;
  hasUnacknowledgedConditionals: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SitTaskDetail extends SitTaskSummary {
  testCases: SitTestCase[];
  history: SitHistoryEntry[];
}

export interface SitHistoryEntry {
  id: string;
  action: SitHistoryAction;
  message: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorName: string;
  createdAt: string;
}
```

- [ ] **Step 4: Build check**

> ⚠️ **Requires Task 2 (migration) to be complete first.** If the migration hasn't been applied yet, Prisma will emit type errors for all new models — that is expected. Run `npx prisma migrate dev --name sit_portal && npx prisma generate` before this step.

```bash
npm run build 2>&1 | tail -20
```
Expected: no TypeScript errors related to types.ts

- [ ] **Step 5: Commit**

```bash
git add types.ts
git commit -m "feat(sit): add SIT types — Role.QA, ViewState QA states, SitTask/SitTestCase/SitEvidence interfaces"
```

---

## Task 4: Auth + Routing — QA Role

**Files:**
- Modify: `lib/auth.ts`
- Modify: `app/AppRouteShell.tsx`

- [ ] **Step 1: Allow QA through in auth.ts**

In `lib/auth.ts`, find where user role is set on the session/token and verify `QA` flows through (it will automatically since role is stored as a string — just confirm no allowlist is filtering it out).

If there's a role validation guard like `if (!['ADMIN', 'STAKEHOLDER'].includes(role))`, add `'QA'` to it.

- [ ] **Step 2: Add QA routes to AppRouteShell.tsx**

Open `app/AppRouteShell.tsx` and add QA cases to the `onRouteChange` switch:
```typescript
case 'QA_DASHBOARD':
  router.push('/qa/dashboard');
  return;
case 'QA_JIRA_QUEUE':
  router.push('/qa/jira-queue');
  return;
case 'QA_SIT_TASK_DETAIL':
  router.push('/qa/sit-tasks');
  return;
```

- [ ] **Step 3: Create QA page stubs** (so build doesn't fail on missing pages)

```bash
mkdir -p app/qa/dashboard app/qa/jira-queue "app/qa/sit-tasks/[id]"
```

Create `app/qa/dashboard/page.tsx`:
```typescript
import AppRouteShell from '../../AppRouteShell';
export default function Page() {
  return <AppRouteShell initialView="QA_DASHBOARD" />;
}
```

Create `app/qa/jira-queue/page.tsx`:
```typescript
import AppRouteShell from '../../AppRouteShell';
export default function Page() {
  return <AppRouteShell initialView="QA_JIRA_QUEUE" />;
}
```

Create `app/qa/sit-tasks/[id]/page.tsx`:
```typescript
import AppRouteShell from '../../../AppRouteShell';
export default function Page() {
  return <AppRouteShell initialView="QA_SIT_TASK_DETAIL" />;
}
```

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts app/AppRouteShell.tsx app/qa/
git commit -m "feat(sit): add QA role routing — AppRouteShell QA routes, page stubs"
```

---

## Task 5: lib/sitHistory.ts

**Files:**
- Create: `lib/sitHistory.ts`

Reference pattern: `lib/taskHistory.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/sitHistory.ts
import prisma from './prisma';
import { SitHistoryAction } from '@prisma/client';

interface CreateSitHistoryParams {
  sitTaskId: string;
  actorId: string;
  action: SitHistoryAction;
  message: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export async function createSitHistory({
  sitTaskId,
  actorId,
  action,
  message,
  before,
  after,
}: CreateSitHistoryParams): Promise<void> {
  await prisma.sitTaskHistory.create({
    data: {
      sitTaskId,
      actorId,
      action,
      message,
      before: before ?? undefined,
      after: after ?? undefined,
    },
  });
}
```

- [ ] **Step 2: Build check**

> ⚠️ **Requires Task 2 (migration + `prisma generate`) to be complete first.**

```bash
npm run build 2>&1 | grep -E 'error|Error' | head -10
```
Expected: no errors in sitHistory.ts

- [ ] **Step 3: Commit**

```bash
git add lib/sitHistory.ts
git commit -m "feat(sit): add createSitHistory helper"
```

---

## Task 6: lib/jira.ts — Sprint and Issue Links Fetchers

**Files:**
- Modify: `lib/jira.ts`

- [ ] **Step 1: Add fetchJiraIssueSprint()**

Add after `searchJiraIssues`:
```typescript
/** Fetch sprint name from a Jira issue's sprint field (Agile).
 *  Returns sprint name string or null if not found / not configured. */
export async function fetchJiraIssueSprint(
  issueKey: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<string | null> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return null;
  try {
    const res = await fetch(
      `${creds.baseUrl}/rest/agile/1.0/issue/${encodeURIComponent(issueKey)}?fields=sprint`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.fields?.sprint?.name as string) ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Add fetchJiraIssueLinks()**

```typescript
export interface JiraLinkedIssue {
  key: string;
  summary: string;
  status: string;
  priority: string | null;
  url: string;
  linkType: string;
}

/** Fetch all linked issues for a Jira issue (for defect selection). */
export async function fetchJiraIssueLinks(
  issueKey: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<JiraLinkedIssue[]> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return [];
  try {
    const res = await fetch(
      `${creds.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=issuelinks,summary`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const links: JiraLinkedIssue[] = [];
    for (const link of data?.fields?.issuelinks ?? []) {
      const linked = link.outwardIssue ?? link.inwardIssue;
      if (!linked) continue;
      links.push({
        key: linked.key,
        summary: linked.fields?.summary ?? '',
        status: linked.fields?.status?.name ?? '',
        priority: linked.fields?.priority?.name ?? null,
        url: `${creds.baseUrl}/browse/${linked.key}`,
        linkType: link.type?.name ?? '',
      });
    }
    return links;
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Build check**

> ⚠️ **Requires Task 2 (migration + `prisma generate`) to be complete first.**

```bash
npm run build 2>&1 | grep -E 'error TS' | head -10
```

- [ ] **Step 4: Commit**

```bash
git add lib/jira.ts
git commit -m "feat(sit): add fetchJiraIssueSprint and fetchJiraIssueLinks to jira lib"
```

---

## Task 7: lib/sitSignoffReport.ts

**Files:**
- Create: `lib/sitSignoffReport.ts`

Reference: `lib/signoffReport.ts` for structure.

- [ ] **Step 1: Create the report generator**

```typescript
// lib/sitSignoffReport.ts
import prisma from './prisma';

export async function generateSitSignoffReportHtml(
  sitTaskId: string,
  opts: { autoPrint?: boolean } = {}
): Promise<string> {
  const task = await prisma.sitTask.findUniqueOrThrow({
    where: { id: sitTaskId },
    include: {
      product: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
      signedOffBy: { select: { name: true, email: true } },
      countries: { select: { countryCode: true } },
      testCases: {
        orderBy: { seqId: 'asc' },
        include: {
          evidence: true,
          defects: true,
          countryResults: { orderBy: { countryCode: 'asc' } },
        },
      },
    },
  });

  const fmt = (d: Date | string | null) =>
    d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      PASS: '#16a34a',
      CONDITIONAL: '#d97706',
      FAIL: '#dc2626',
      BLOCKED: '#7c3aed',
      NOT_STARTED: '#6b7280',
    };
    return `<span style="color:${colors[s] ?? '#000'};font-weight:600">${s}</span>`;
  };

  const countries = task.countries.map((c) => c.countryCode).join(', ');

  const testCaseRows = task.testCases
    .map((tc) => {
      const defectLinks = tc.defects
        .map((d) => `<a href="${d.url ?? '#'}">${d.jiraKey}</a>`)
        .join(', ');

      const evidenceLinks = tc.evidence
        .map((e) =>
          e.type === 'JAM_LINK'
            ? `<a href="${e.url}">🎬 Recording</a>`
            : `<span>📷 ${e.filename ?? 'Image'}</span>`
        )
        .join(' · ');

      const countryRows = tc.splitByCountry
        ? tc.countryResults
            .map(
              (cr) =>
                `<tr style="background:#fafafa"><td style="padding-left:24px">${cr.countryCode}</td><td></td><td></td><td>${statusBadge(cr.status)}</td><td>${cr.actualResult ?? ''}</td><td>${cr.testerName ?? ''}</td><td>${fmt(cr.testedAt)}</td><td></td><td></td></tr>`
            )
            .join('')
        : '';

      return `
        <tr>
          <td>${tc.seqId}</td>
          <td>${tc.name}</td>
          <td>${tc.category ?? ''}</td>
          <td>${statusBadge(tc.status)}</td>
          <td>${tc.actualResult ?? ''}</td>
          <td>${tc.testerName ?? ''}</td>
          <td>${fmt(tc.testedAt)}</td>
          <td>${defectLinks}</td>
          <td>${evidenceLinks}</td>
        </tr>
        ${countryRows}
        ${tc.conditionalNote ? `<tr><td colspan="9" style="background:#fffbeb;padding:4px 8px;font-size:11px;color:#92400e">⚠ Conditional: ${tc.conditionalNote}</td></tr>` : ''}
      `;
    })
    .join('');

  const autoPrintScript = opts.autoPrint
    ? `<script>window.addEventListener('load', () => window.print());</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>SIT Sign-off Report — ${task.title}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; margin: 32px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 16px 0; background: #f8fafc; padding: 12px; border-radius: 8px; }
    .meta span { color: #64748b; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th { background: #1e293b; color: white; padding: 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .sig { margin-top: 32px; }
    .sig img { border: 1px solid #e2e8f0; border-radius: 4px; max-height: 80px; }
    @media print { body { margin: 0; } }
  </style>
  ${autoPrintScript}
</head>
<body>
  <h1>SIT Sign-off Report</h1>
  <div class="meta">
    <div><span>Jira Ticket</span><br/><strong>${task.jiraTicket}</strong></div>
    <div><span>Sprint</span><br/><strong>${task.sprintName}</strong></div>
    <div><span>Product</span><br/><strong>${task.product.name}</strong></div>
    <div><span>Module</span><br/><strong>${task.module ?? '—'}</strong></div>
    <div><span>Environment</span><br/><strong>${task.environment ?? '—'}</strong></div>
    <div><span>Countries</span><br/><strong>${countries}</strong></div>
    <div><span>Signed Off By</span><br/><strong>${task.signedOffBy?.name ?? task.signedOffBy?.email ?? '—'}</strong></div>
    <div><span>Signed Off At</span><br/><strong>${fmt(task.signedOffAt)}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Test Case</th><th>Category</th><th>Status</th>
        <th>Actual Result</th><th>Tester</th><th>Date</th><th>Defects</th><th>Evidence</th>
      </tr>
    </thead>
    <tbody>${testCaseRows}</tbody>
  </table>

  ${task.signatureData ? `<div class="sig"><p><strong>Signature:</strong></p><img src="${task.signatureData}" alt="Signature"/></div>` : ''}
</body>
</html>`;
}
```

- [ ] **Step 2: Build check**

> ⚠️ **Requires Task 2 (migration + `prisma generate`) to be complete first.**

```bash
npm run build 2>&1 | grep -E 'error TS' | head -10
```

- [ ] **Step 3: Commit**

```bash
git add lib/sitSignoffReport.ts
git commit -m "feat(sit): add generateSitSignoffReportHtml — SIT sign-off report generator"
```

---

## Task 8: API — GET/POST /api/sit-tasks

**Files:**
- Create: `app/api/sit-tasks/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/sit-tasks/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction, SitTaskStatus } from '@prisma/client';

const sitTaskInclude = {
  product: { select: { name: true } },
  assignee: { select: { name: true, email: true } },
  countries: { select: { countryCode: true } },
  testCases: { select: { status: true, adminAcknowledgedAt: true } },
} as const;

function mapSitTask(t: any) {
  const tcs: Array<{ status: string; adminAcknowledgedAt: Date | null }> = t.testCases ?? [];
  return {
    id: t.id,
    sprintName: t.sprintName,
    jiraTicket: t.jiraTicket,
    title: t.title,
    productId: t.productId,
    productName: t.product.name,
    module: t.module,
    environment: t.environment,
    status: t.status,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? t.assignee?.email ?? null,
    signedOffAt: t.signedOffAt?.toISOString() ?? null,
    countryCodes: t.countries.map((c: any) => c.countryCode),
    testCaseCount: tcs.length,
    passCount: tcs.filter((tc) => tc.status === 'PASS').length,
    failCount: tcs.filter((tc) => tc.status === 'FAIL').length,
    conditionalCount: tcs.filter((tc) => tc.status === 'CONDITIONAL').length,
    blockedCount: tcs.filter((tc) => tc.status === 'BLOCKED').length,
    notStartedCount: tcs.filter((tc) => tc.status === 'NOT_STARTED').length,
    hasUnacknowledgedConditionals: tcs.some((tc) => tc.status === 'CONDITIONAL' && !tc.adminAcknowledgedAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');

  const role = session.user.role;
  if (role !== 'QA' && role !== 'ADMIN') return forbidden('Forbidden', 'ROLE_REQUIRED');

  // Scope to products this user can access (QA is always product-scoped; admin sees all)
  let productFilter: { productId?: { in: string[] } } = {};
  if (role === 'QA') {
    const productAccesses = await prisma.userProductAccess.findMany({
      where: { userId: session.user.id },
      select: { productId: true },
    });
    const productIds = productAccesses.map((p) => p.productId);
    if (productIds.length === 0) return NextResponse.json([]); // No products assigned → empty list
    productFilter = { productId: { in: productIds } };
  }

  const tasks = await prisma.sitTask.findMany({
    where: productFilter,
    include: sitTaskInclude,
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(tasks.map(mapSitTask));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const body = await req.json().catch(() => null);
  const { jiraTicket, title, productId, sprintName, module: mod, environment, countryCodes } = body ?? {};

  if (!jiraTicket || !title || !productId || !sprintName) {
    return badRequest('jiraTicket, title, productId, sprintName are required', 'MISSING_FIELDS');
  }
  if (!Array.isArray(countryCodes) || countryCodes.length === 0) {
    return badRequest('At least one countryCode required', 'MISSING_COUNTRIES');
  }

  // Check QA has access to this product
  const access = await prisma.userProductAccess.findFirst({
    where: { userId: session.user.id, productId },
  });
  if (!access) return forbidden('No product access', 'PRODUCT_FORBIDDEN');

  // Enforce unique jiraTicket + productId
  const existing = await prisma.sitTask.findUnique({ where: { jiraTicket_productId: { jiraTicket, productId } } });
  if (existing) return badRequest('A SIT task already exists for this Jira ticket', 'DUPLICATE_SIT_TASK');

  const task = await prisma.sitTask.create({
    data: {
      jiraTicket,
      title,
      productId,
      sprintName,
      module: mod ?? null,
      environment: environment ?? null,
      status: SitTaskStatus.DRAFT,
      assigneeId: session.user.id,
      updatedById: session.user.id,
      countries: { create: countryCodes.map((code: string) => ({ countryCode: code })) },
    },
    include: sitTaskInclude,
  });

  await createSitHistory({
    sitTaskId: task.id,
    actorId: session.user.id,
    action: SitHistoryAction.TASK_CREATED,
    message: `${session.user.name ?? session.user.email} created SIT task for ${jiraTicket}.`,
    after: { jiraTicket, title, productId, sprintName, countryCodes },
  });

  return NextResponse.json(mapSitTask(task), { status: 201 });
}
```

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | grep -E 'error TS' | head -10
```

- [ ] **Step 3: Manual verify** — Start dev server (`npm run dev`), then:
```bash
# Should return 401 without auth
curl -s http://localhost:3000/api/sit-tasks | jq .error
```

- [ ] **Step 4: Commit**

```bash
git add app/api/sit-tasks/route.ts
git commit -m "feat(sit): add GET/POST /api/sit-tasks"
```

---

## Task 9: API — GET/PUT /api/sit-tasks/[id]

**Files:**
- Create: `app/api/sit-tasks/[id]/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/sit-tasks/[id]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction, SitTaskStatus } from '@prisma/client';
import { transitionJiraIssue, isJiraConfigured } from '@/lib/jira';
import { decryptField } from '@/lib/encrypt';

const fullInclude = {
  product: { select: { name: true, jiraBaseUrl: true, jiraEmail: true, jiraToken: true, jiraReadyForTestingTransition: true, jiraTestingTransition: true } },
  assignee: { select: { name: true, email: true } },
  countries: { select: { countryCode: true } },
  testCases: {
    orderBy: { seqId: 'asc' as const },
    include: {
      evidence: true,
      defects: true,
      countryResults: { orderBy: { countryCode: 'asc' as const } },
    },
  },
};

async function getTaskOrFail(id: string, userId: string, role: string) {
  const task = await prisma.sitTask.findUnique({ where: { id }, include: fullInclude });
  if (!task) return null;
  if (role === 'QA') {
    const access = await prisma.userProductAccess.findFirst({ where: { userId, productId: task.productId } });
    if (!access) return null;
  }
  return task;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA' && session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ROLE_REQUIRED');

  const task = await getTaskOrFail(id, session.user.id, session.user.role);
  if (!task) return notFound('SIT task not found', 'SIT_TASK_NOT_FOUND');

  return NextResponse.json(task);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const task = await getTaskOrFail(id, session.user.id, session.user.role);
  if (!task) return notFound('SIT task not found', 'SIT_TASK_NOT_FOUND');

  const body = await req.json().catch(() => ({}));
  const { status, sprintName, environment, module: mod, countryCodes } = body;

  const updateData: Record<string, unknown> = { updatedById: session.user.id };
  if (sprintName) updateData.sprintName = sprintName;
  if (environment !== undefined) updateData.environment = environment;
  if (mod !== undefined) updateData.module = mod;
  if (status && status !== task.status) updateData.status = status;

  const updated = await prisma.sitTask.update({
    where: { id },
    data: updateData,
    include: fullInclude,
  });

  // Update countries if provided
  if (Array.isArray(countryCodes)) {
    await prisma.sitTaskCountry.deleteMany({ where: { sitTaskId: id } });
    await prisma.sitTaskCountry.createMany({ data: countryCodes.map((c: string) => ({ sitTaskId: id, countryCode: c })) });
  }

  // Jira transitions on status change
  if (status && status !== task.status) {
    const perProduct = task.product.jiraBaseUrl ? {
      baseUrl: task.product.jiraBaseUrl ?? undefined,
      email: task.product.jiraEmail ?? undefined,
      token: decryptField(task.product.jiraToken) ?? undefined,
    } : null;

    if (isJiraConfigured(perProduct) && task.jiraTicket) {
      if (status === SitTaskStatus.READY) {
        void transitionJiraIssue(task.jiraTicket, task.product.jiraReadyForTestingTransition || 'Ready for Testing', perProduct);
      } else if (status === SitTaskStatus.IN_PROGRESS) {
        void transitionJiraIssue(task.jiraTicket, task.product.jiraTestingTransition || 'Testing', perProduct);
      }
    }

    await createSitHistory({
      sitTaskId: id, actorId: session.user.id,
      action: status === SitTaskStatus.READY ? SitHistoryAction.TASK_PUBLISHED : SitHistoryAction.STATUS_CHANGED,
      message: `${session.user.name ?? session.user.email} changed status to ${status}.`,
      before: { status: task.status }, after: { status },
    });
  }

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Build check + commit**

```bash
npm run build 2>&1 | grep -E 'error TS' | head -10
git add app/api/sit-tasks/[id]/route.ts
git commit -m "feat(sit): add GET/PUT /api/sit-tasks/[id] with Jira transitions"
```

---

## Task 10: API — Test Cases CRUD

**Files:**
- Create: `app/api/sit-tasks/[id]/test-cases/route.ts`
- Create: `app/api/sit-tasks/[id]/test-cases/[tcId]/route.ts`

- [ ] **Step 1: POST /api/sit-tasks/[id]/test-cases**

```typescript
// app/api/sit-tasks/[id]/test-cases/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction } from '@prisma/client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const task = await prisma.sitTask.findUnique({ where: { id }, select: { id: true, productId: true, status: true } });
  if (!task) return notFound('SIT task not found', 'SIT_TASK_NOT_FOUND');
  if (task.status === 'SIGNED_OFF') return badRequest('Cannot modify signed-off task', 'TASK_LOCKED');

  const access = await prisma.userProductAccess.findFirst({ where: { userId: session.user.id, productId: task.productId } });
  if (!access) return forbidden('No product access', 'PRODUCT_FORBIDDEN');

  const body = await req.json().catch(() => ({}));
  const { name, priority, category, description, steps, expectedResult, testData } = body;
  if (!name) return badRequest('name is required', 'MISSING_NAME');

  // Auto-increment seqId
  const maxSeq = await prisma.sitTestCase.aggregate({ where: { sitTaskId: id }, _max: { seqId: true } });
  const seqId = (maxSeq._max.seqId ?? 0) + 1;

  const tc = await prisma.sitTestCase.create({
    data: { sitTaskId: id, seqId, name, priority, category, description, steps, expectedResult, testData },
    include: { evidence: true, defects: true, countryResults: true },
  });

  await createSitHistory({
    sitTaskId: id, actorId: session.user.id,
    action: SitHistoryAction.TEST_CASE_ADDED,
    message: `${session.user.name ?? session.user.email} added TC#${seqId} "${name}".`,
    after: { seqId, name, priority, category },
  });

  await prisma.sitTask.update({ where: { id }, data: { updatedById: session.user.id } });

  return NextResponse.json(tc, { status: 201 });
}
```

- [ ] **Step 2: PUT /api/sit-tasks/[id]/test-cases/[tcId]**

```typescript
// app/api/sit-tasks/[id]/test-cases/[tcId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitCaseStatus, SitHistoryAction, SitTaskStatus } from '@prisma/client';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; tcId: string }> }) {
  const { id, tcId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const tc = await prisma.sitTestCase.findUnique({ where: { id: tcId }, include: { sitTask: { select: { status: true, productId: true } } } });
  if (!tc || tc.sitTaskId !== id) return notFound('Test case not found', 'TC_NOT_FOUND');
  if (tc.sitTask.status === 'SIGNED_OFF') return badRequest('Cannot modify signed-off task', 'TASK_LOCKED');

  const body = await req.json().catch(() => ({}));
  const { status, actualResult, conditionalNote, name, priority, category, description, steps, expectedResult, testData, splitByCountry, countryResults } = body;

  // Validate CONDITIONAL requires note
  if (status === SitCaseStatus.CONDITIONAL && !conditionalNote) {
    return badRequest('conditionalNote is required when status is CONDITIONAL', 'CONDITIONAL_NOTE_REQUIRED');
  }

  const isResultChange = status && status !== tc.status;
  const isFieldChange = name || priority !== undefined || category !== undefined || description !== undefined || steps !== undefined || expectedResult !== undefined || testData !== undefined;

  const updateData: Record<string, unknown> = {};
  if (name) updateData.name = name;
  if (priority !== undefined) updateData.priority = priority;
  if (category !== undefined) updateData.category = category;
  if (description !== undefined) updateData.description = description;
  if (steps !== undefined) updateData.steps = steps;
  if (expectedResult !== undefined) updateData.expectedResult = expectedResult;
  if (testData !== undefined) updateData.testData = testData;
  if (splitByCountry !== undefined) updateData.splitByCountry = splitByCountry;
  if (status) {
    updateData.status = status;
    updateData.actualResult = actualResult ?? tc.actualResult;
    updateData.conditionalNote = conditionalNote ?? null;
    if ([SitCaseStatus.PASS, SitCaseStatus.FAIL, SitCaseStatus.CONDITIONAL, SitCaseStatus.BLOCKED].includes(status)) {
      updateData.testerName = session.user.name ?? session.user.email;
      updateData.testedAt = new Date();
    }
  }

  const updated = await prisma.sitTestCase.update({
    where: { id: tcId },
    data: updateData,
    include: { evidence: true, defects: true, countryResults: true },
  });

  // Update per-country results if splitByCountry
  if (Array.isArray(countryResults)) {
    for (const cr of countryResults) {
      await prisma.sitTestCaseCountryResult.upsert({
        where: { sitTestCaseId_countryCode: { sitTestCaseId: tcId, countryCode: cr.countryCode } },
        create: { sitTestCaseId: tcId, countryCode: cr.countryCode, status: cr.status, actualResult: cr.actualResult, testerName: session.user.name ?? session.user.email, testedAt: new Date() },
        update: { status: cr.status, actualResult: cr.actualResult, testerName: session.user.name ?? session.user.email, testedAt: new Date() },
      });
    }
  }

  // Trigger IN_PROGRESS if this is the first result recorded on a READY task
  if (isResultChange && tc.sitTask.status === SitTaskStatus.READY) {
    await prisma.sitTask.update({ where: { id }, data: { status: SitTaskStatus.IN_PROGRESS, updatedById: session.user.id } });
  }

  if (isResultChange) {
    await createSitHistory({
      sitTaskId: id, actorId: session.user.id,
      action: SitHistoryAction.TEST_CASE_RESULT_RECORDED,
      message: `${session.user.name ?? session.user.email} marked TC#${tc.seqId} as ${status}.`,
      before: { status: tc.status }, after: { status, conditionalNote: conditionalNote ?? null },
    });
  } else if (isFieldChange) {
    await createSitHistory({
      sitTaskId: id, actorId: session.user.id,
      action: SitHistoryAction.TEST_CASE_MODIFIED,
      message: `${session.user.name ?? session.user.email} modified TC#${tc.seqId} "${tc.name}".`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; tcId: string }> }) {
  const { id, tcId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const tc = await prisma.sitTestCase.findUnique({ where: { id: tcId }, select: { seqId: true, name: true, sitTaskId: true, sitTask: { select: { status: true } } } });
  if (!tc || tc.sitTaskId !== id) return notFound('Test case not found', 'TC_NOT_FOUND');
  if (tc.sitTask.status === 'SIGNED_OFF') return badRequest('Cannot modify signed-off task', 'TASK_LOCKED');

  await prisma.sitTestCase.delete({ where: { id: tcId } });

  await createSitHistory({
    sitTaskId: id, actorId: session.user.id,
    action: SitHistoryAction.TEST_CASE_REMOVED,
    message: `${session.user.name ?? session.user.email} removed TC#${tc.seqId} "${tc.name}".`,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Build check + commit**

```bash
npm run build 2>&1 | grep -E 'error TS' | head -10
git add app/api/sit-tasks/[id]/test-cases/
git commit -m "feat(sit): add test case CRUD — POST /test-cases, PUT/DELETE /test-cases/[tcId]"
```

---

## Task 11: API — Evidence + Defects

**Files:**
- Create: `app/api/sit-tasks/[id]/test-cases/[tcId]/evidence/route.ts`
- Create: `app/api/sit-tasks/[id]/test-cases/[tcId]/defects/route.ts`

- [ ] **Step 1: Evidence route**

```typescript
// app/api/sit-tasks/[id]/test-cases/[tcId]/evidence/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitEvidenceType, SitHistoryAction } from '@prisma/client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; tcId: string }> }) {
  const { id, tcId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const tc = await prisma.sitTestCase.findUnique({ where: { id: tcId }, select: { id: true, seqId: true, sitTaskId: true } });
  if (!tc || tc.sitTaskId !== id) return notFound('Test case not found', 'TC_NOT_FOUND');

  const body = await req.json().catch(() => ({}));
  const { type, url, imageData, filename } = body;

  if (!type || !Object.values(SitEvidenceType).includes(type)) return badRequest('Invalid evidence type', 'INVALID_TYPE');
  if (type === 'JAM_LINK' && !url) return badRequest('url required for JAM_LINK', 'MISSING_URL');
  if (type === 'IMAGE' && !imageData) return badRequest('imageData required for IMAGE', 'MISSING_IMAGE');

  const evidence = await prisma.sitEvidence.create({
    data: { sitTestCaseId: tcId, type, url: url ?? null, imageData: imageData ?? null, filename: filename ?? null },
  });

  await createSitHistory({
    sitTaskId: id, actorId: session.user.id,
    action: SitHistoryAction.EVIDENCE_ADDED,
    message: `${session.user.name ?? session.user.email} added ${type} evidence to TC#${tc.seqId}.`,
  });

  return NextResponse.json(evidence, { status: 201 });
}

```

Also create the DELETE route as a separate path-parameterized handler:

```typescript
// app/api/sit-tasks/[id]/test-cases/[tcId]/evidence/[evidenceId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; tcId: string; evidenceId: string }> }) {
  const { id, tcId, evidenceId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const evidence = await prisma.sitEvidence.findUnique({ where: { id: evidenceId }, select: { sitTestCaseId: true } });
  if (!evidence || evidence.sitTestCaseId !== tcId) return notFound('Evidence not found', 'EVIDENCE_NOT_FOUND');

  await prisma.sitEvidence.delete({ where: { id: evidenceId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Defects route**

```typescript
// app/api/sit-tasks/[id]/test-cases/[tcId]/defects/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction } from '@prisma/client';
import { fetchJiraIssueLinks } from '@/lib/jira';
import { decryptField } from '@/lib/encrypt';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; tcId: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');

  const task = await prisma.sitTask.findUnique({
    where: { id },
    select: { jiraTicket: true, product: { select: { jiraBaseUrl: true, jiraEmail: true, jiraToken: true } } },
  });
  if (!task) return notFound('SIT task not found', 'SIT_TASK_NOT_FOUND');

  const perProduct = task.product.jiraBaseUrl
    ? { baseUrl: task.product.jiraBaseUrl ?? undefined, email: task.product.jiraEmail ?? undefined, token: decryptField(task.product.jiraToken) ?? undefined }
    : null;

  const links = await fetchJiraIssueLinks(task.jiraTicket, perProduct);
  return NextResponse.json(links);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; tcId: string }> }) {
  const { id, tcId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const tc = await prisma.sitTestCase.findUnique({ where: { id: tcId }, select: { id: true, seqId: true, sitTaskId: true } });
  if (!tc || tc.sitTaskId !== id) return notFound('Test case not found', 'TC_NOT_FOUND');

  const body = await req.json().catch(() => ({}));
  const { jiraKey, summary, status: defectStatus, priority, url } = body;
  if (!jiraKey) return badRequest('jiraKey required', 'MISSING_KEY');

  const defect = await prisma.sitDefect.create({
    data: { sitTestCaseId: tcId, jiraKey, summary: summary ?? null, status: defectStatus ?? null, priority: priority ?? null, url: url ?? null },
  });

  await createSitHistory({
    sitTaskId: id, actorId: session.user.id,
    action: SitHistoryAction.DEFECT_LINKED,
    message: `${session.user.name ?? session.user.email} linked defect ${jiraKey} to TC#${tc.seqId}.`,
  });

  return NextResponse.json(defect, { status: 201 });
}

```

Also create the DELETE route as a path-parameterized handler:

```typescript
// app/api/sit-tasks/[id]/test-cases/[tcId]/defects/[defectId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction } from '@prisma/client';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; tcId: string; defectId: string }> }) {
  const { id, tcId, defectId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const defect = await prisma.sitDefect.findUnique({ where: { id: defectId }, select: { jiraKey: true, sitTestCaseId: true } });
  if (!defect || defect.sitTestCaseId !== tcId) return notFound('Defect not found', 'DEFECT_NOT_FOUND');

  await prisma.sitDefect.delete({ where: { id: defectId } });

  const tc = await prisma.sitTestCase.findUnique({ where: { id: tcId }, select: { seqId: true } });
  await createSitHistory({
    sitTaskId: id, actorId: session.user.id,
    action: SitHistoryAction.DEFECT_UNLINKED,
    message: `${session.user.name ?? session.user.email} unlinked defect ${defect.jiraKey} from TC#${tc?.seqId}.`,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Build check + commit**

```bash
npm run build 2>&1 | grep -E 'error TS' | head -10
git add "app/api/sit-tasks/[id]/test-cases/[tcId]/"
git commit -m "feat(sit): add evidence and defect routes for test cases (path-parameterized DELETEs)"
```

---

## Task 12: API — History + Sign-off

**Files:**
- Create: `app/api/sit-tasks/[id]/history/route.ts`
- Create: `app/api/sit-tasks/[id]/signoff/route.ts`
- Create: `app/api/sit-tasks/[id]/signoff-report/route.ts`

- [ ] **Step 1: History route**

```typescript
// app/api/sit-tasks/[id]/history/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction } from '@prisma/client';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA' && session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ROLE_REQUIRED');

  // QA must have product access to view history
  if (session.user.role === 'QA') {
    const task = await prisma.sitTask.findUnique({ where: { id }, select: { productId: true } });
    if (!task) return notFound('SIT task not found', 'SIT_TASK_NOT_FOUND');
    const access = await prisma.userProductAccess.findFirst({ where: { userId: session.user.id, productId: task.productId } });
    if (!access) return forbidden('Forbidden', 'PRODUCT_FORBIDDEN');
  }

  const history = await prisma.sitTaskHistory.findMany({
    where: { sitTaskId: id },
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { name: true, email: true } } },
  });

  return NextResponse.json(
    history.map((h) => ({
      id: h.id,
      action: h.action,
      message: h.message,
      before: h.before,
      after: h.after,
      actorName: h.actor.name ?? h.actor.email,
      createdAt: h.createdAt.toISOString(),
    }))
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const task = await prisma.sitTask.findUnique({ where: { id }, select: { id: true } });
  if (!task) return notFound('SIT task not found', 'SIT_TASK_NOT_FOUND');

  const body = await req.json().catch(() => ({}));
  const { note } = body;
  if (!note?.trim()) return NextResponse.json({ error: 'note required' }, { status: 400 });

  await createSitHistory({
    sitTaskId: id, actorId: session.user.id,
    action: SitHistoryAction.SCOPE_NOTE_ADDED,
    message: `${session.user.name ?? session.user.email}: ${note.trim()}`,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Sign-off route**

```typescript
// app/api/sit-tasks/[id]/signoff/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitCaseStatus, SitHistoryAction, SitTaskStatus } from '@prisma/client';
import { isJiraConfigured, transitionJiraIssue, createJiraSubtask, attachFileToJiraIssue } from '@/lib/jira';
import { generateSitSignoffReportHtml } from '@/lib/sitSignoffReport';
import { decryptField } from '@/lib/encrypt';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const task = await prisma.sitTask.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, jiraBaseUrl: true, jiraEmail: true, jiraToken: true, jiraSitDoneTransition: true } },
      testCases: { select: { id: true, status: true, conditionalNote: true } },
    },
  });
  if (!task) return notFound('SIT task not found', 'SIT_TASK_NOT_FOUND');

  // Verify QA has product access (prevents any QA signing off tasks for products they can't see)
  const accessCheck = await prisma.userProductAccess.findFirst({ where: { userId: session.user.id, productId: task.productId } });
  if (!accessCheck) return forbidden('No product access', 'PRODUCT_FORBIDDEN');

  if (task.status === SitTaskStatus.SIGNED_OFF) return badRequest('Already signed off', 'ALREADY_SIGNED_OFF');

  // Validate all test cases are PASS or CONDITIONAL
  const blocking = task.testCases.filter(
    (tc) => ![SitCaseStatus.PASS, SitCaseStatus.CONDITIONAL].includes(tc.status as SitCaseStatus)
  );
  if (blocking.length > 0) {
    return badRequest(
      `${blocking.length} test case(s) are not PASS or CONDITIONAL. Resolve them before signing off.`,
      'TEST_CASES_NOT_COMPLETE'
    );
  }
  // Validate CONDITIONAL cases have a note
  const missingNote = task.testCases.filter((tc) => tc.status === SitCaseStatus.CONDITIONAL && !tc.conditionalNote);
  if (missingNote.length > 0) return badRequest('All CONDITIONAL test cases require a conditionalNote', 'MISSING_CONDITIONAL_NOTE');

  const body = await req.json().catch(() => ({}));
  const signatureData =
    typeof body?.signatureData === 'string' && body.signatureData.startsWith('data:image/')
      ? body.signatureData : null;

  const signedOffAt = new Date();

  await prisma.sitTask.update({
    where: { id },
    data: { status: SitTaskStatus.SIGNED_OFF, signedOffAt, signedOffById: session.user.id, signatureData, updatedById: session.user.id },
  });

  await createSitHistory({
    sitTaskId: id, actorId: session.user.id,
    action: SitHistoryAction.SIGNED_OFF,
    message: `${session.user.name ?? session.user.email} signed off the SIT task.`,
    after: { signedOffAt: signedOffAt.toISOString(), signatureCaptured: Boolean(signatureData) },
  });

  // Jira fire-and-forget
  if (task.jiraTicket) {
    const perProduct = task.product.jiraBaseUrl
      ? { baseUrl: task.product.jiraBaseUrl ?? undefined, email: task.product.jiraEmail ?? undefined, token: decryptField(task.product.jiraToken) ?? undefined }
      : null;

    if (isJiraConfigured(perProduct)) {
      void transitionJiraIssue(task.jiraTicket, task.product.jiraSitDoneTransition || 'SIT Done', perProduct);
      void (async () => {
        try {
          const subtaskKey = await createJiraSubtask(
            task.jiraTicket,
            `SIT Sign-off Report — ${task.title}`,
            { version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `SIT signed off by ${session.user.name ?? session.user.email} at ${signedOffAt.toISOString()}` }] }] },
            perProduct
          );
          if (subtaskKey) {
            const html = await generateSitSignoffReportHtml(id);
            await attachFileToJiraIssue(subtaskKey, `sit-signoff-${id}.html`, Buffer.from(html, 'utf-8'), 'text/html', perProduct);
          }
        } catch (err) {
          console.error('[sit-signoff] subtask creation failed:', err);
        }
      })();
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Sign-off report route**

```typescript
// app/api/sit-tasks/[id]/signoff-report/route.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';
import { generateSitSignoffReportHtml } from '@/lib/sitSignoffReport';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const autoPrint = new URL(req.url).searchParams.get('autoprint') === '1';
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');

  const task = await prisma.sitTask.findUnique({ where: { id }, select: { productId: true, assigneeId: true } });
  if (!task) return notFound('SIT task not found', 'SIT_TASK_NOT_FOUND');

  const role = session.user.role;
  if (role !== 'ADMIN') {
    const access = await prisma.userProductAccess.findFirst({ where: { userId: session.user.id, productId: task.productId } });
    if (!access) return forbidden('Forbidden', 'PRODUCT_FORBIDDEN');
  }

  const html = await generateSitSignoffReportHtml(id, { autoPrint });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
```

- [ ] **Step 4: Build check + commit**

```bash
npm run build 2>&1 | grep -E 'error TS' | head -10
git add "app/api/sit-tasks/[id]/history/" "app/api/sit-tasks/[id]/signoff/" "app/api/sit-tasks/[id]/signoff-report/"
git commit -m "feat(sit): add history, signoff, and signoff-report routes"
```

---

## Task 13: API — Admin Routes + Jira SIT Queue

**Files:**
- Create: `app/api/admin/sit-tasks/route.ts`
- Create: `app/api/admin/sit-tasks/[id]/acknowledge/route.ts`
- Create: `app/api/jira/sit-queue/route.ts`

- [ ] **Step 1: Admin SIT tasks list**

```typescript
// app/api/admin/sit-tasks/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden } from '@/lib/apiError';
import { getAdminProductScope } from '@/lib/adminAccess';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const scope = await getAdminProductScope(session.user.id);
  const where = scope?.restricted ? { productId: { in: scope.productIds } } : {};

  const tasks = await prisma.sitTask.findMany({
    where,
    include: {
      product: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
      countries: { select: { countryCode: true } },
      testCases: {
        select: {
          id: true, status: true, conditionalNote: true,
          adminAcknowledgedAt: true, seqId: true, name: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(
    tasks.map((t) => ({
      id: t.id,
      sprintName: t.sprintName,
      jiraTicket: t.jiraTicket,
      title: t.title,
      productId: t.productId,
      productName: t.product.name,
      status: t.status,
      assigneeName: t.assignee?.name ?? t.assignee?.email ?? null,
      signedOffAt: t.signedOffAt?.toISOString() ?? null,
      countryCodes: t.countries.map((c) => c.countryCode),
      conditionalCases: t.testCases
        .filter((tc) => tc.status === 'CONDITIONAL')
        .map((tc) => ({ id: tc.id, seqId: tc.seqId, name: tc.name, conditionalNote: tc.conditionalNote, adminAcknowledgedAt: tc.adminAcknowledgedAt?.toISOString() ?? null })),
      hasUnacknowledgedConditionals: t.testCases.some((tc) => tc.status === 'CONDITIONAL' && !tc.adminAcknowledgedAt),
      updatedAt: t.updatedAt.toISOString(),
    }))
  );
}
```

- [ ] **Step 2: Admin acknowledge route**

```typescript
// app/api/admin/sit-tasks/[id]/acknowledge/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction } from '@prisma/client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const body = await req.json().catch(() => ({}));
  const { testCaseId, note } = body;
  if (!testCaseId) return badRequest('testCaseId required', 'MISSING_TC_ID');

  const tc = await prisma.sitTestCase.findUnique({ where: { id: testCaseId }, select: { seqId: true, sitTaskId: true, status: true } });
  if (!tc || tc.sitTaskId !== id) return notFound('Test case not found', 'TC_NOT_FOUND');
  if (tc.status !== 'CONDITIONAL') return badRequest('Test case is not CONDITIONAL', 'NOT_CONDITIONAL');

  await prisma.sitTestCase.update({
    where: { id: testCaseId },
    data: { adminAcknowledgedAt: new Date(), adminAcknowledgedById: session.user.id },
  });

  await createSitHistory({
    sitTaskId: id, actorId: session.user.id,
    action: SitHistoryAction.CONDITIONAL_ACKNOWLEDGED,
    message: `${session.user.name ?? session.user.email} acknowledged CONDITIONAL TC#${tc.seqId}${note ? `: ${note}` : ''}.`,
    after: { testCaseId, note: note ?? null },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create the jira API directory and Jira SIT queue route**

```bash
mkdir -p app/api/jira/sit-queue
```

```typescript
// app/api/jira/sit-queue/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden } from '@/lib/apiError';
import { searchJiraIssues, isJiraConfigured, fetchJiraIssueSprint } from '@/lib/jira';
import { decryptField } from '@/lib/encrypt';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'QA') return forbidden('Forbidden', 'QA_REQUIRED');

  const productAccesses = await prisma.userProductAccess.findMany({
    where: { userId: session.user.id },
    include: {
      product: {
        select: {
          id: true, name: true, jiraProjectKey: true, jiraBaseUrl: true, jiraEmail: true, jiraToken: true,
          jiraReadyForTestingTransition: true,
        },
      },
    },
  });

  const results = [];
  for (const access of productAccesses) {
    const p = access.product;
    const perProduct = p.jiraBaseUrl
      ? { baseUrl: p.jiraBaseUrl ?? undefined, email: p.jiraEmail ?? undefined, token: decryptField(p.jiraToken) ?? undefined }
      : null;

    if (!isJiraConfigured(perProduct)) continue;

    const readyStatus = p.jiraReadyForTestingTransition || 'Ready for Testing';
    // searchJiraIssues takes { projectKey, statuses } — NOT a raw JQL string
    const issues = await searchJiraIssues(
      { projectKey: p.jiraProjectKey ?? p.name, statuses: [readyStatus] },
      perProduct
    ).catch(() => []);

    // Filter out issues already linked to a SIT task
    const existingTickets = await prisma.sitTask.findMany({
      where: { productId: p.id, jiraTicket: { in: issues.map((i: any) => i.key) } },
      select: { jiraTicket: true },
    });
    const existingSet = new Set(existingTickets.map((t) => t.jiraTicket));

    for (const issue of issues) {
      if (existingSet.has(issue.key)) continue;
      results.push({
        key: issue.key,
        summary: issue.summary ?? issue.fields?.summary ?? '',
        productId: p.id,
        productName: p.name,
        status: readyStatus,
      });
    }
  }

  return NextResponse.json(results);
}
```

- [ ] **Step 4: Build check + commit**

```bash
npm run build 2>&1 | grep -E 'error TS' | head -10
git add app/api/admin/sit-tasks/ app/api/jira/sit-queue/
git commit -m "feat(sit): add admin SIT routes (list, acknowledge) and QA Jira SIT queue"
```

---

## Task 14: Final Build + Push

- [ ] **Step 1: Full clean build**

```bash
npm run build
```
Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 2: Verify migration is in sync**

```bash
npx prisma migrate status
```
Expected: `All migrations have been applied.`

- [ ] **Step 3: Push to staging**

```bash
git push origin staging
```

- [ ] **Step 4: Verify Vercel deployment succeeds**

Check Vercel dashboard — deployment should pass. New version will show in the app footer.

---

## Manual Smoke Test (after deploy)

Log in as an ADMIN user and verify:
1. `GET /api/admin/sit-tasks` → returns `[]` (empty list, no error)
2. `GET /api/sit-tasks` → 403 (admin doesn't use QA routes)

Create a QA user via Prisma Studio or the admin DB page (role: QA, assign a product).
Log in as QA and verify:
1. `GET /api/jira/sit-queue` → returns Jira issues in "Ready for Testing" for assigned product
2. `POST /api/sit-tasks` with `{ jiraTicket, title, productId, sprintName, countryCodes }` → 201 with task
3. `POST /api/sit-tasks/{id}/test-cases` → 201 with test case
4. `PUT /api/sit-tasks/{id}/test-cases/{tcId}` with `{ status: "PASS" }` → task auto-transitions to IN_PROGRESS
5. `POST /api/sit-tasks/{id}/signoff` → signs off, triggers Jira (check Jira for subtask)
6. `GET /api/sit-tasks/{id}/signoff-report` → returns HTML page

---

*Plan 2 (Frontend) covers: QA Dashboard, QA Jira Queue, QA SIT Task Detail view, Admin SIT tab, soft gate in Jira queue, and CONDITIONAL acknowledgment UI.*
