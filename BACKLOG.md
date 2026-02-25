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

## 9) Immutable Task History (field-level audit trail)
- Priority: `P1`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Forensic trace of who changed what and when.
- Implementation plan:
  - Add `TaskHistory` model (actor, action, before/after snapshot, timestamp).
  - Write log entries in task/step/status/sign-off APIs.
  - Add admin timeline viewer.
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

## 14) Ops Runbook + Deployment Checklist
- Priority: `P2`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Repeatable, safer releases and migrations.
- Implementation plan:
  - Document migration order, seed behavior, rollback plan.
  - Add smoke test checklist for post-deploy validation.
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
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Prevent invalid inputs before submit.
- Implementation plan:
  - Validate required fields, date constraints, Jira format, duplicate step order.
  - Show field-level messages.
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
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Ensure app is usable for keyboard/screen-reader users and low-vision users.
- Implementation plan:
  - WCAG contrast checks, focus styles, aria labels, semantic headings, table accessibility.
  - Add automated a11y checks in CI.
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
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Support audit submissions and leadership updates.
- Implementation plan:
  - Add export endpoints (CSV/PDF) for task list, sign-off log, activity history.
  - Include country/module filters and date ranges.
- Impact if not done:
  - Manual reporting remains slow and inconsistent.

## 34) Feature: Admin User Management
- Priority: `P1`
- Status: `Planned`
- Date implemented: `TBD`
- What this is for:
  - Let admin manage user lifecycle without DB scripts.
- Implementation plan:
  - Add user management screen (create/deactivate/reset role/country).
  - Add guarded APIs for user provisioning and status changes.
  - Audit all user admin actions.
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
