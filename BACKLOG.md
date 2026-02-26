# Product Backlog (CTT UAT Portal)

Last updated: 2026-02-25  
Owner: Product + Engineering  
Scope: Next.js App Router + Prisma + NextAuth stack

This backlog tracks improvement initiatives with:
- What it is for
- How it will be implemented
- Impact if not done
- Date implemented

---

## Priority Legend
- `P0` Critical: reliability/security blockers
- `P1` High: core workflow correctness
- `P2` Medium: quality, UX, observability

## Status Legend
- `Planned`
- `In Progress`
- `Implemented`

## Progress Snapshot
- Overall: `17/42 Implemented` (40.5%)
- Active now: `5 In Progress`
- Remaining: `22 Planned`
- High-priority lane (`P0 + P1`): `14/23 Implemented`
- Technical debt lane (`#36-#41`): `3/6 Implemented`

---

## 1) ~~Unified API Error Contract + Client Error Handling~~
- Priority: `P0`
- Status: `Implemented`
- Date implemented: `2026-02-24`
- What this is for:
  - Ensure every failed request produces a predictable error shape.
  - Avoid blank screens and inconsistent ad-hoc alerts.
- Implementation:
  - Added centralized client fetch helper and typed error:
    - `lib/http.ts` (`apiFetch`, `ApiError`)
  - Standardized client-side handling in key screens:
    - `App.tsx`, `views/AdminTaskManagement.tsx`, `views/TaskDetail.tsx`
  - Global toast event + host for consistent user feedback:
    - `lib/notify.ts`, `components/ToastHost.tsx`, `app/Providers.tsx`
- Impact if not done:
  - Users see silent failures or inconsistent errors.
  - Debugging production incidents is slower and noisier.

## 2) ~~Global Toast Notifications (replace critical alerts)~~
- Priority: `P0`
- Status: `Implemented`
- Date implemented: `2026-02-24`
- What this is for:
  - Provide consistent non-blocking success/error feedback.
- Implementation:
  - Added toast publish/subscribe utility:
    - `lib/notify.ts`
  - Added global toast renderer:
    - `components/ToastHost.tsx`
  - Mounted once in provider tree:
    - `app/Providers.tsx`
- Impact if not done:
  - Modal browser alerts disrupt flow and feel unstable.
  - Important errors may be missed or shown inconsistently.

## 3) ~~CI Quality Gate (Build + Lint + Prisma Generate)~~
- Priority: `P0`
- Status: `Implemented`
- Date implemented: `2026-02-24`
- What this is for:
  - Prevent broken code from reaching `main`.
- Implementation:
  - Added GitHub Actions workflow:
    - `.github/workflows/ci.yml`
  - Pipeline runs: install, Prisma generate, lint, build.
- Impact if not done:
  - Regressions frequently reach production.
  - Manual checks become bottlenecks.

## 4) ~~Local Dev Cache Recovery Script~~
- Priority: `P0`
- Status: `Implemented`
- Date implemented: `2026-02-24`
- What this is for:
  - Recover quickly from Next.js chunk/runtime cache corruption.
- Implementation:
  - Added `npm run reset:dev`:
    - `scripts/reset-dev.sh`
    - `package.json` script entry
  - Documented troubleshooting steps in `README.md`.
- Impact if not done:
  - Repeated `vendor-chunks` and missing module failures slow development.
  - Team wastes time on environment debugging.

---

## 5) ~~Authentication Hardening (rate limit + lockout)~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Reduce brute-force and credential stuffing risk on credentials auth.
- Implementation:
  - Added server-side in-memory login rate limiter:
    - `lib/loginRateLimit.ts`
    - wired in `lib/auth.ts` (`authorize`)
  - Added client-side lock UX and validation:
    - email format validation
    - disable CTA until valid input
    - temporary lock countdown after repeated failures
    - loading state while login request is in flight
  - Added password visibility toggle in login form.
- Impact if not done:
  - Elevated account takeover risk.
  - Higher abuse traffic and incident likelihood.

## 6) ~~Server-Enforced Task Status Transitions~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Ensure task lifecycle cannot enter invalid states.
- Implementation:
  - Added explicit transition guard map:
    - `lib/taskGuards.ts`
  - Enforced transition checks in status mutation route:
    - `app/api/tasks/[id]/status/route.ts`
  - Invalid transitions now return `409 Conflict` with a clear message.
- Impact if not done:
  - Inconsistent state across UI/API.
  - KPI/reporting accuracy degrades.

## 7) ~~Signed-off/Deployed Lock Enforcement Consistency~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-24`
- What this is for:
  - Guarantee locked tasks are immutable across all mutation paths.
- Implementation:
  - Added lock checks for signed-off tasks in mutation APIs:
    - task metadata update
    - status update
    - step create/update/delete
    - comment create
  - API returns `409` with lock message for blocked writes.
- Impact if not done:
  - Compliance/audit risk from post sign-off edits.
  - Trust in UAT sign-off is weakened.

## 8) ~~Optimistic Concurrency Control (`updatedAt` checks)~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Prevent silent overwrite when 2 users edit same task.
- Implementation:
  - Added reusable server validation for `expectedUpdatedAt`:
    - `lib/taskGuards.ts`
  - Added `409 Conflict` checks on task mutation endpoints:
    - `app/api/tasks/[id]/route.ts`
    - `app/api/tasks/[id]/status/route.ts`
    - `app/api/tasks/[id]/steps/route.ts`
    - `app/api/tasks/[id]/steps/[stepId]/route.ts`
    - `app/api/tasks/[id]/comments/route.ts`
    - `app/api/tasks/[id]/signoff/route.ts`
  - Client now sends `expectedUpdatedAt` for task detail mutations and auto-refreshes on conflict:
    - `views/TaskDetail.tsx`
- Impact if not done:
  - Data loss and unexpected edits in collaborative scenarios.

## 9) ~~Immutable Task History (field-level audit trail)~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Forensic trace of who changed what and when.
- Implementation:
  - Added `TaskHistory` model + `TaskHistoryAction` enum:
    - `prisma/schema.prisma`
    - `prisma/migrations/20260225100000_add_task_history/migration.sql`
  - Added centralized history writer helper:
    - `lib/taskHistory.ts`
  - Added history writes in task mutation paths:
    - task create: `app/api/tasks/route.ts`
    - task update/delete: `app/api/tasks/[id]/route.ts`
    - status update: `app/api/tasks/[id]/status/route.ts`
    - step create/update/delete: `app/api/tasks/[id]/steps/route.ts`, `app/api/tasks/[id]/steps/[stepId]/route.ts`
    - comment add: `app/api/tasks/[id]/comments/route.ts`
    - sign-off: `app/api/tasks/[id]/signoff/route.ts`
  - Added secured history read endpoint:
    - `app/api/tasks/[id]/history/route.ts`
  - Added admin timeline UI in task detail:
    - `views/TaskDetail.tsx`
- Impact if not done:
  - Limited incident analysis and compliance reporting.

---

## 10) Mentions V2 (structured mentions + notifications)
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Reliable user tagging and mention notification routing.
- Implementation plan:
  - Parse/store mentions as user IDs, not plain text.
  - Link mentions to inbox notifications.
  - Mark read/unread by mention thread.
- Impact if not done:
  - Tagging appears to work but is not reliably actionable.

## 11) ~~Step Comment Data Model Normalization~~
- Priority: `P2`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Eliminate fragile encoded step markers in comment body.
- Implementation:
  - Added structured `Comment.stepOrder` field.
  - New comments now persist `stepOrder` directly.
  - Added one-time backfill script for legacy encoded comments:
    - `scripts/backfill-comment-step-order.ts`
    - `npm run comments:backfill-step-order`
  - Mapper now uses structured `stepOrder` for step-level comment mapping.
  - Legacy `[[STEP:n]]` markers are stripped for safe display only.
- Impact if not done:
  - Parsing edge cases and future maintenance complexity.

## 12) ~~UX Save State + Unsaved Changes Guard~~
- Priority: `P2`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Improve confidence for inline editing workflows.
- Implementation:
  - Added explicit save states in task detail: `Saving...`, `Saved`, `Save failed`.
  - Added in-app back-navigation confirm when edits are unsaved.
  - Added browser unload guard (`beforeunload`) for unsaved edits.
  - Extended save state + unsaved-change guards to Admin Task create modal:
    - confirm on modal close with unsaved input
    - browser unload guard while modal has unsaved input
    - explicit create button save-state feedback
  - Extended save-state/unsaved-change handling to Admin Database notification settings:
    - save-state feedback for reminder settings and Teams webhook config
    - confirm on tab switch when unsaved notification changes exist
    - browser unload guard for unsaved notification settings
- Impact if not done:
  - Users unsure if updates persisted.
  - Increased accidental data loss.

## 13) Observability (Sentry + structured logs + correlation IDs)
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Faster detection and diagnosis of production issues.
- Implementation plan:
  - Add Sentry (client + server).
  - Standardize server logs with request IDs.
  - Include error context in API failures.
- Impact if not done:
  - Slow mean-time-to-resolution for incidents.

## 14) ~~Ops Runbook + Deployment Checklist~~
- Priority: `P2`
- Status: `Implemented`
- Date implemented: `2026-02-26`
- What this is for:
  - Repeatable, safer releases and migrations.
- Implementation:
  - Added production readiness checklist:
    - `PRODUCTION_READINESS.md`
  - Added operations troubleshooting runbook:
    - `OPS_RUNBOOK.md`
  - Added runtime health check endpoint:
    - `app/api/health/route.ts`
  - Linked operational docs and health endpoint in:
    - `README.md`
    - `PROJECT_OVERVIEW.md`
    - `TESTING_CHECKLIST.md`
- Impact if not done:
  - Higher deployment risk and inconsistent operator behavior.

---

## 15) User-Centred: Quick Login Account Picker
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Help non-technical users log in quickly without typing emails repeatedly.
- Implementation plan:
  - Show recent successful login emails as one-click chips on login screen.
  - Keep local-only storage and clear option.
- Impact if not done:
  - Higher login friction and support requests for “which email should I use?”

## 16) User-Centred: Password Visibility Toggle + Caps Lock Hint
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Reduce failed logins caused by hidden typos/caps lock.
- Implementation plan:
  - Add show/hide password icon.
  - Detect Caps Lock and show inline hint.
- Impact if not done:
  - Repeated auth failures and user frustration.

## 17) User-Centred: Keyboard-First Workflow
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Speed up power-user flows in task list and task detail.
- Implementation plan:
  - Add shortcuts (`/` focus search, `j/k` next task, `s` save, `c` comment).
  - Display shortcut helper tooltip.
- Impact if not done:
  - Slower manual workflows and reduced productivity.

## 18) User-Centred: Saved Filters Per User
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Preserve each user’s preferred task filters/sort.
- Implementation plan:
  - Save and restore filter state by role/view (`localStorage` first, DB later).
- Impact if not done:
  - Users reapply filters every session.

## 19) User-Centred: Empty-State Guidance
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Make “no tasks/comments” screens actionable instead of dead ends.
- Implementation plan:
  - Add contextual CTAs (create task, clear filters, open inbox, import).
- Impact if not done:
  - Users misinterpret empty pages as errors.

## 20) User-Centred: Inline Validation on Task Create/Edit
- Priority: `P1`
- Status: `In Progress`
- Date implemented: `Phase 1 on 2026-02-25`
- What this is for:
  - Prevent invalid inputs before submit.
- Implementation progress:
  - Added client-side validation for task creation in `views/AdminTaskManagement.tsx`:
    - required title/country
    - Jira format
    - step completeness
  - Added client-side validation for task metadata save in `views/TaskDetail.tsx`.
  - Added server-side validation for task create/update:
    - `app/api/tasks/route.ts`
    - `app/api/tasks/[id]/route.ts`
  - Unified client-side Jira validation with shared helper:
    - `lib/taskValidation.ts` (`isValidJiraTicket`, `normalizeJiraTicketInput`)
    - consumed in admin create and task detail edit flows
  - Added import-create validation for due date/title constraints:
    - `views/ImportWizard.tsx`
- Impact if not done:
  - Late API failures and poor form usability.

## 21) User-Centred: Autosave Draft for New Task Form
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Prevent accidental loss while creating large multi-country tasks.
- Implementation plan:
  - Autosave draft payload locally every few seconds.
  - Restore on modal reopen with “discard draft” action.
- Impact if not done:
  - Lost work when modal closes/reload occurs.

## 22) User-Centred: Comment Composer Improvements
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Make discussions clearer and faster.
- Implementation plan:
  - Add multiline input, mention autocomplete list, attach indicator, send on Ctrl/Cmd+Enter.
- Impact if not done:
  - Slower collaboration and unclear context in long threads.

## 23) User-Centred: Notification Preferences
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Let users control email and in-app noise.
- Implementation plan:
  - Per-user toggles: assignment, reminder, mentions, sign-off alerts.
  - Add settings UI + backend preference model.
- Impact if not done:
  - Notification fatigue or missed critical updates.

## 24) User-Centred: Accessibility & Readability Pass
- Priority: `P1`
- Status: `In Progress`
- Date implemented: `Phase 1 on 2026-02-26`
- What this is for:
  - Ensure app is usable for keyboard/screen-reader users and low-vision users.
- Implementation plan:
  - WCAG contrast checks, focus styles, aria labels, semantic headings, table accessibility.
  - Add automated a11y checks in CI.
- Implementation progress:
  - Login flow a11y hardening in `App.tsx`:
    - proper `label`/`id` pairing
    - `type=email` + invalid state exposure
    - alert semantics for login errors
    - ARIA improvements for password toggle and loading submit button
  - Forced password-change modal now exposes dialog semantics (`role="dialog"`, `aria-modal`, labelled/description IDs).
  - Admin task table a11y improvements in `views/AdminTaskManagement.tsx`:
    - search/sort/filter controls now have labels/expanded state wiring
    - table caption + checkbox labels
    - keyboard open support for task rows
  - Task detail a11y improvements in `views/TaskDetail.tsx`:
    - toggleable step headers now keyboard accessible with `aria-expanded`
    - icon-only controls now have explicit labels (jira link launcher, evidence delete, send comment, image preview close)
    - save-state text now announced with polite live region semantics
- Impact if not done:
  - Exclusion risk, compliance risk, and poorer usability overall.

---

## Functional Features

## 25) Admin Feature: Bulk Task Actions
- Priority: `P1`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Let admins update many tasks at once (assign, due date, status, reminders).
- Implementation plan:
  - Add row selection in Admin Task Management.
  - Add bulk action bar with guarded actions.
  - Add backend endpoint(s) for transactional bulk updates with per-item result summary.
- Impact if not done:
  - Admin operations remain slow and error-prone for large rollouts.

## 26) Admin Feature: Recurring Task Templates
- Priority: `P1`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Reuse common UAT patterns without recreating tasks each cycle.
- Implementation plan:
  - Add `TaskTemplate` model (title/module/steps/default priority/country scope).
  - Add template create/edit UI.
  - Add schedule trigger (manual first, cron later).
- Impact if not done:
  - Duplicate manual setup and inconsistent task quality.

## 27) Feature: Sign-off Approval Workflow
- Priority: `P1`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Introduce formal review state before deployment.
- Implementation plan:
  - Add status states: `SUBMITTED`, `APPROVED`, `REJECTED` (or equivalent).
  - Stakeholder submits task; admin approves/rejects with reason.
  - Log approval decisions in task history.
- Impact if not done:
  - Sign-off path lacks governance and traceability for release readiness.

## 28) Feature: SLA and Escalation Rules
- Priority: `P1`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Ensure overdue/blocked items escalate automatically.
- Implementation plan:
  - Add rule settings (hours overdue, blocked duration).
  - Add scheduled job endpoint to evaluate breaches.
  - Trigger inbox + email escalation events.
- Impact if not done:
  - Delays are detected late, increasing go-live risk.

## 29) Feature: Country-Level Dashboard Analytics
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Give admin regional visibility by country/module progress.
- Implementation plan:
  - Add aggregated analytics API.
  - Show pass/fail/open trends and blocker counts by country.
  - Add filters by period/module.
- Impact if not done:
  - Decision-making remains task-level and reactive.

## 30) Feature: Release Readiness Board
- Priority: `P1`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Summarize what is safe to deploy by module/country.
- Implementation plan:
  - Add readiness criteria engine (signed-off coverage, open blockers, failed steps).
  - Present board view with readiness score and blocker drill-down.
- Impact if not done:
  - Deployment decisions rely on manual interpretation and can miss blockers.

## 31) Feature: Task Dependencies
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Prevent downstream testing before prerequisite completion.
- Implementation plan:
  - Add dependency relation model (`TaskDependency`).
  - Block status/sign-off transitions when prerequisites incomplete.
  - Show dependency graph in task detail.
- Impact if not done:
  - Teams can execute tests in invalid order, causing rework.

## 32) Feature: Evidence Management
- Priority: `P1`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Make test proof auditable and manageable at scale.
- Implementation plan:
  - Move from base64-only to file-backed evidence metadata (name, type, size, uploader).
  - Add secure upload/download pipeline.
  - Add retention policy controls.
- Impact if not done:
  - Storage bloat, poor attachment governance, weak audit quality.

## 33) Feature: Export and Reporting
- Priority: `P2`
- Status: `In Progress`
- Date implemented: `Phase 1 on 2026-02-26`
- What this is for:
  - Support audit submissions and leadership updates.
- Implementation progress:
  - Added admin filtered CSV export in task management UI.
  - Added printable sign-off report template endpoint (`/api/tasks/[id]/signoff-report`) for PDF export flow.
  - Remaining:
    - add richer admin summary exports (date range + aggregate reporting).
- Impact if not done:
  - Manual reporting remains slow and inconsistent.

## 34) ~~Feature: Admin User Management~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Let admin manage user lifecycle without DB scripts.
- Implementation:
  - Added user management APIs:
    - `GET/POST /api/admin/users`
    - `PATCH /api/admin/users/[id]`
    - `POST /api/admin/users/[id]/reset-password`
  - Added admin UI in `/admin/database` with a `Users` tab:
    - search/filter table
    - right-side drawer for create/edit
    - disable/enable toggle
    - temporary password reset
  - Added security controls:
    - ADMIN-only route guards
    - no creation of additional ADMIN users (current policy)
    - prevent self-disable
    - reset-password cooldown (60 seconds)
  - Added `User` lifecycle fields:
    - `isActive`
    - `lastLoginAt`
  - Login now blocks inactive users and records successful login timestamp.
- Impact if not done:
  - Operational dependence on direct DB access and slower onboarding/offboarding.

## 35) Feature: Microsoft Teams Channel Notifications (Per Market)
- Priority: `P1`
- Status: `In Progress`
- Date implemented: `MVP implemented on 2026-02-24`
- What this is for:
  - Send task events directly to existing market channels, not only email.
- Implementation plan:
  - Added per-country Teams webhook configuration model and admin API.
  - Added admin UI for webhook URL + event toggles.
  - Wired MVP events: task assigned, reminder sent, sign-off, failed step.
  - Non-blocking behavior: Teams failures never block core task operations.
- Impact if not done:
  - Teams users miss task events unless they check email.
  - Slower reaction time in market channels.

## 42) Feature: Gamified Tester Leaderboard (User + Market)
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Increase tester engagement, healthy market-level competition, and comment quality responsiveness.
- Concept (Phase 1):
  - `Personal Ranking` card:
    - rank, points, tasks signed off, failed-step catches, useful comments.
  - `Market Ranking` board:
    - rank markets by completion score, on-time sign-off rate, and blocker resolution speed.
  - `Weekly Streak`:
    - users/markets get streaks for continuous task progress and timely updates.
  - `Badges` (non-monetary):
    - `Fast Closer`, `Bug Hunter`, `Collaboration Champion`, `Quality Guardian`.
  - `Fairness guardrails`:
    - no points for spam comments.
    - repeated no-op status changes do not score.
    - admin can exclude training/demo tasks from scoring.
- Implementation plan:
  - Add `LeaderboardEvent` table (append-only scoring events from task/comment/signoff actions).
  - Add score calculator service + nightly materialized summary update.
  - Add API:
    - `/api/leaderboard/users`
    - `/api/leaderboard/markets`
    - `/api/leaderboard/me`
  - Add UI:
    - leaderboard widget on stakeholder dashboard
    - admin leaderboard view with market drilldown.
- Impact if not done:
  - Engagement depends only on manual follow-up.
  - Less visibility into proactive tester contribution across markets.

---

## Technical Debt Backlog

## 36) ~~Technical Debt: Dependency Audit and Pruning~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Reduce maintenance and security surface by removing unused packages.
- Implementation:
  - Audited transitive dependency concerns (`color-convert`, `concat-map`) and confirmed they are dev-only via `eslint` chain.
  - Removed unused top-level dependency:
    - `recharts` removed from `package.json` / lockfile.
  - Re-validated production build after removal.
- Impact if not done:
  - Unnecessary attack surface and larger install/build footprint.

## 37) ~~Technical Debt: Centralize Prisma Include Shapes~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Avoid repeated query include blocks across task APIs.
- Implementation:
  - Added shared include constants:
    - `app/api/tasks/_query.ts`
  - Reused in:
    - `app/api/tasks/route.ts`
    - `app/api/tasks/[id]/route.ts`
- Impact if not done:
  - Higher regression risk when schema changes.

## 38) ~~Technical Debt: API Error Shape Consistency Enforcement~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-25`
- What this is for:
  - Keep all API failures predictable for UI handling and telemetry.
- Implementation:
  - Added shared API error helper:
    - `lib/apiError.ts`
  - Migrated task, admin, activity, inbox, and comment unread endpoints to standardized error shape (`error`, `code`, `detail` in dev):
    - `app/api/tasks/route.ts`
    - `app/api/tasks/[id]/route.ts`
    - `app/api/tasks/[id]/status/route.ts`
    - `app/api/tasks/[id]/comments/route.ts`
    - `app/api/admin/countries/route.ts`
    - `app/api/admin/modules/route.ts`
    - `app/api/admin/stakeholders/route.ts`
    - `app/api/admin/teams-webhooks/route.ts`
    - `app/api/activities/route.ts`
    - `app/api/activities/mark-read/route.ts`
    - `app/api/inbox/route.ts`
    - `app/api/inbox/mark-read/route.ts`
    - `app/api/comments/unread-count/route.ts`
- Impact if not done:
  - Inconsistent UX and harder production debugging.

## 39) ~~Technical Debt: Audit Logging Coverage Gaps~~
- Priority: `P1`
- Status: `Implemented`
- Date implemented: `2026-02-26`
- What this is for:
  - Ensure immutable history is complete across all critical actions.
- Implementation:
  - Added admin audit helper:
    - `lib/adminAudit.ts`
  - Added admin configuration audit events for:
    - country create/delete (`app/api/admin/countries/route.ts`)
    - module create/delete (`app/api/admin/modules/route.ts`)
    - Teams config save (`app/api/admin/teams-webhooks/route.ts`)
  - Added admin audit coverage for notification trigger flows:
    - assignment mail trigger (`app/api/tasks/[id]/notify-assigned/route.ts`)
    - reminder mail trigger (`app/api/tasks/[id]/reminder/route.ts`)
    - admin test notification (`app/api/admin/test-notification/route.ts`)
  - Added admin audit event coverage for step import flow:
    - `app/api/tasks/[id]/steps/import/route.ts`
  - Expanded CI audit coverage guard to include admin-capable non-`/api/admin/**` write routes:
    - `scripts/check-admin-audit-coverage.mjs`
  - Added checklist-backed endpoint coverage map:
    - `ADMIN_AUDIT_COVERAGE.md`
- Impact if not done:
  - Partial audit trail weakens incident forensics/compliance.

## 40) Technical Debt: UI Component Consolidation
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Keep Apple-style visual consistency and reduce duplicated styles.
- Implementation plan:
  - Extract reusable Input/Select/Button/Card primitives from repeated Tailwind patterns.
  - Standardize spacing, typography, and state styles.
- Impact if not done:
  - UI drift and slower feature delivery.

## 41) Technical Debt: Performance Baseline + Query/Fetch Optimization
- Priority: `P1`
- Status: `In Progress`
- Date implemented: `Phase 1 on 2026-02-26`
- What this is for:
  - Reduce dashboard/task loading time and remove avoidable latency before adding new infra.
- Implementation plan:
  - Add endpoint-level timing instrumentation for key APIs:
    - `/api/tasks`
    - `/api/tasks/[id]`
    - `/api/tasks/[id]/history`
  - Split list vs detail query shape more aggressively:
    - list API returns only fields needed for table/dashboard cards
    - task detail API keeps full relation payload
  - Remove redundant client refreshes/re-fetch loops in dashboard/task detail.
  - Add lightweight cache strategy for safe reads (short TTL/revalidate where appropriate).
  - Re-measure before/after; only then evaluate Prisma Accelerate adoption.
- Implementation progress:
  - Added query timing response headers (`X-Query-Time-Ms`) and dev perf logs on:
    - `/api/tasks`
    - `/api/tasks/[id]`
    - `/api/tasks/[id]/history`
  - Added lighter list query include shape for `/api/tasks`:
    - reduced payload to relation metadata + step status summary + minimal comment metadata
    - retained full detail payload on `/api/tasks/[id]`
  - Further reduced task list payload:
    - replaced full comment payload in `/api/tasks` with DB-side `commentCount` only
    - kept full comment data only on task detail/report APIs
  - Reduced `/api/tasks/[id]/history` default fetch window from 100 to 40 rows for faster task detail load.
  - Reduced unnecessary task detail re-fetch when rich step data already exists.
  - Added short-lived (30s) client-side session cache for task list in `App.tsx` to reduce repeat fetch latency after refresh/navigation.
  - Added DB index migration for high-frequency filters/sorts:
    - `Task(assigneeId, updatedAt)`
    - `Task(countryCode, updatedAt)`
    - `Task(status, updatedAt)`
    - `Task(countryCode, status, updatedAt)`
    - `Task(dueDate)`
    - `Comment(taskId, createdAt)`
    - `Comment(taskId, stepOrder, createdAt)`
- Impact if not done:
  - Slow perceived performance even on low data volume.
  - Higher risk of unnecessary infra spend without root-cause optimization.

---

## Implementation Approach (Feature Roadmap)

## Phase A (2-3 weeks): Core Admin Efficiency
- Scope:
  - #25 Bulk Task Actions
  - #34 Admin User Management (MVP)
  - #33 Export and Reporting (CSV first)
- Why first:
  - Immediately reduces admin manual workload and enables safer operations.
- Delivery strategy:
  - API-first with feature flags.
  - Keep UI incremental in existing Admin pages.
  - Add integration tests for bulk mutation safety.

## Phase B (3-4 weeks): Release Governance
- Scope:
  - #27 Approval Workflow
  - #30 Release Readiness Board
  - #28 SLA and Escalation Rules (manual trigger first)
- Why second:
  - Formalizes “ready to deploy” criteria and decision controls.
- Delivery strategy:
  - Introduce state machine + audit entries first.
  - Add board UI and escalation notifications after rule engine baseline.

## Phase C (3-4 weeks): Scale and Data Quality
- Scope:
  - #26 Recurring Templates
  - #31 Task Dependencies
  - #32 Evidence Management
  - #29 Country Analytics
- Why third:
  - Improves repeatability and observability once governance is stable.
- Delivery strategy:
  - Add schema migrations in small batches.
  - Backward-compatible APIs with controlled migration scripts.
  - Profile performance on dashboard aggregations.

## Rollout Controls
- Use feature flags per module.
- Pilot with one admin + one country first.
- Promote to all users only after checklist in `TESTING_CHECKLIST.md` is green.

---

## Change Log
- `2026-02-24`: Added initial structured backlog with implementation metadata.
- `2026-02-24`: Added strike-through formatting for implemented items and 10 user-centred enhancement items.
- `2026-02-24`: Added functional feature backlog (#25-#34) and phased implementation approach.
- `2026-02-24`: Updated lock enforcement as implemented; advanced comment normalization and save-state guard progress.
- `2026-02-25`: Marked #5 Authentication Hardening, #6 Server-Enforced Status Transitions, and #8 Optimistic Concurrency as implemented with concrete code references.
- `2026-02-25`: Updated related verification/docs alignment in README, PROJECT_OVERVIEW, and TESTING_CHECKLIST.
- `2026-02-25`: Completed #11 Step Comment Data Model Normalization with backfill script and mapper cleanup.
- `2026-02-25`: Completed #12 save-state/unsaved-change coverage across Task Detail, Admin Task create modal, and Admin Database notification settings.
- `2026-02-25`: Hardened task DTO date mapping to tolerate non-Date runtime values and prevent `/api/tasks` 500s from malformed timestamp shapes.
- `2026-02-25`: Added defensive guards and error handling in `GET /api/tasks` for missing session user identifiers and safer runtime failure surfacing.
- `2026-02-25`: Added resilient fallback path in `GET /api/tasks` (minimal task fetch) plus development-only error detail to unblock dashboard when relational includes fail.
- `2026-02-25`: Added matching resilience for `GET /api/tasks/[id]` and improved Task Detail refresh error surfacing with API-derived messages.
- `2026-02-25`: Added auth-loading screen in `App.tsx` to remove login flicker during session hydration on page refresh.
- `2026-02-25`: Completed #9 immutable task history with DB model, API instrumentation, secure history endpoint, and admin timeline UI.
- `2026-02-25`: Added Technical Debt backlog items (#36-#40), including dependency pruning and codebase cleanup/security hardening tasks.
- `2026-02-25`: Completed #36 dependency audit/pruning (`recharts` removed, dev-only transitive packages validated) and started Phase 1 API error shape standardization + UI form style consolidation.
- `2026-02-25`: Added top-level progress snapshot (`Implemented / Total`, active, remaining) for quick backlog health tracking.
- `2026-02-25`: Completed #37 shared Prisma include centralization; advanced #38 (API error helper rollout) and #20 (inline validation) to Phase 1.
- `2026-02-25`: Completed #38 API error-shape rollout across task/admin/inbox/activity routes and advanced #39 audit coverage with admin config audit events.
- `2026-02-25`: Completed #34 admin user management (users tab + guarded APIs + disable/reset flow), including new user lifecycle fields and inactive-login enforcement.
- `2026-02-26`: Added forced password-change flow (`mustChangePassword`), reset-password email delivery, CSV (Excel-export) step import wizard with column mapping + replace, and started #33 export/reporting with admin CSV + printable sign-off report template.
- `2026-02-26`: Refined import/reporting/admin UX: labeled import steps, inline preview field editing for missing values, portrait sign-off report cleanup with task-history section, and cleaner user-management table layout aligned with task table style.
- `2026-02-26`: Extended import/reporting UX: import can now target existing task replacement or create a new task from CSV steps, preview fields support multiline editing, and sign-off report now includes comments with cleaner layout handling.
- `2026-02-26`: Fixed import completion behavior to stop false success on API 400, added direct open-task action after import, grouped report comments by step sections, and added auto print prompt for save-to-PDF flow.
- `2026-02-26`: Replaced browser-native import confirm with in-app modal and hardened step-import API refresh path to reduce internal-error risk on import completion.
- `2026-02-26`: Fixed sign-off race condition causing false stale-update conflicts by removing stale timestamp coupling between status and sign-off calls, and improved sign-off failure/success feedback.
- `2026-02-26`: Replaced remaining browser-native confirms with in-app modals, added bulk delete in admin task table, and updated admin delete navigation to return to task management.
- `2026-02-26`: Added performance improvement item (#41) to backlog, including baseline measurement-first approach, query-shape optimization, client fetch cleanup, and decision gate for Prisma Accelerate.
- `2026-02-26`: Started #41 Phase 1: instrumented key task endpoints with query timing, introduced lighter task-list query shape, and reduced unnecessary task-detail hydration fetches.
- `2026-02-26`: Continued #41 with lower-latency list payload changes (`commentCount` aggregation instead of full comments on `/api/tasks`) and reduced task-history fetch size for task detail.
- `2026-02-26`: Advanced #41 client fetch optimization with short-lived session cache for task list and reduced redundant detail prefetch calls during dashboard/task navigation.
- `2026-02-26`: Added performance index migration (`20260226190000_add_task_comment_performance_indexes`) for task/comment hot paths.
- `2026-02-26`: Advanced #39 audit coverage by adding admin audit events for manual email-trigger endpoints and publishing `ADMIN_AUDIT_COVERAGE.md` checklist.
- `2026-02-26`: Completed #39 with step-import admin audit events and expanded CI guard scope for admin-capable non-`/api/admin/**` write routes.
- `2026-02-26`: Added CI guard (`npm run audit:check-admin`) to block admin write routes without `createAdminAudit`, and wired it into `.github/workflows/ci.yml`.
- `2026-02-26`: Advanced #20 validation consistency by reusing shared Jira validation/normalization helpers in UI and adding import-create due-date/title checks.
- `2026-02-26`: Added #42 gamified leaderboard concept backlog item (user + market rankings, badges, fairness guardrails).
- `2026-02-26`: Hardened task assignment flow: invalid assignee selections now fail fast, non-draft tasks cannot be unassigned, and manual notify/reminder triggers now reject draft/completed tasks.
- `2026-02-26`: Completed #14 by adding production checklist + ops runbook + `/api/health` runtime health endpoint and linked them in docs/testing checklist.
- `2026-02-26`: Advanced #24 accessibility Phase 1 for login, admin task management, and task detail keyboard/ARIA support.
