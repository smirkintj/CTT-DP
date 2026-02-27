# CTT Web App — Developer Overview

This document summarizes the current architecture, data flow, API surface, and implementation conventions for the CTT UAT system.

## Tech Stack
- Framework: Next.js 15 (App Router)
- Runtime UI: React 19 (client shell)
- Auth: NextAuth v4 (Credentials provider + JWT session)
- DB: PostgreSQL (Neon)
- ORM: Prisma
- Styling: Tailwind CSS + `app/globals.css`

## Current App Architecture
The project uses **App Router for URLs** and a shared **client shell (`App.tsx`)** for the existing prototype UI state.

- Route pages (`app/**/page.tsx`) set initial view/task state.
- `AppRouteShell.tsx` maps UI view transitions to URLs.
- `App.tsx` loads session, fetches tasks, and renders view components.
- Shared API error helper (`lib/apiError.ts`) is used to standardize server error payloads.
- Shared form classes (`components/ui/formClasses.ts`) are used for consistent minimal input/button styling.
- Shared task query include shapes are centralized in `app/api/tasks/_query.ts`.
  - includes separate list-vs-detail query shapes for task performance tuning.

## Entry Points
- `app/layout.tsx`
  - Global HTML layout + providers mounting point.
- `app/Providers.tsx`
  - Client provider wrapper with `SessionProvider`.
- `app/page.tsx`
  - Root route (`/`) mounting the shared shell.

## Route Map
- `/` → Stakeholder landing/login shell
- `/admin/dashboard` → Admin dashboard
- `/admin/tasks` → Admin task management
- `/admin/database` → Admin database view
- `/import` → Import wizard
- `/tasks/[id]` → Task detail route

## Core UI Components
### Main App Shell
- `App.tsx`
  - Session-driven `currentUser`
  - Fetches `/api/tasks`
  - Handles view state + route callbacks
  - Shows dedicated auth-loading screen while `useSession` hydrates to avoid login flicker on refresh

### Views (`views/`)
- `StakeholderDashboard.tsx`
- `AdminDashboard.tsx`
- `AdminTaskManagement.tsx`
- `AdminDatabase.tsx`
- `TaskDetail.tsx`
- `ImportWizard.tsx`

### Shared Components (`components/`)
- `Layout.tsx` (top nav, notifications, profile, shell container)
- `Badge.tsx`
- `SignatureCanvas.tsx`

### Runtime Telemetry
- Vercel Speed Insights is mounted in root layout:
  - `/Users/putra/Desktop/CTT-DKSH-main/app/layout.tsx`

## Authentication
### NextAuth
- Handler: `app/api/auth/[...nextauth]/route.ts`
- Config: `lib/auth.ts`
- Provider: Credentials (`email`, `password`)
- Password check: `bcryptjs.compare`
- Session strategy: JWT
- Login abuse protection:
  - server-side temporary lockout on repeated failed attempts (`lib/loginRateLimit.ts`)
  - client-side email validation + lock countdown UX in `App.tsx`
  - accessibility semantics on login controls/errors/loading in `App.tsx`
- JWT/session includes:
  - `user.id`
  - `user.role`
  - `user.countryCode`

## Authorization Model
### Middleware (`middleware.ts`)
- `/admin/*` + `/import` → ADMIN only
- `/tasks/*` → authenticated users only

### Server checks in task APIs/pages
- Task read/update endpoints enforce role/country/assignee rules server-side.
- UI filtering is not trusted for security.

## Database Schema (Prisma)
Defined in `prisma/schema.prisma`.

### Core models
- `User`
- `Country`
- `Task`
- `TaskStep`
- `Comment`

### Activity feed models
- `Activity`
  - tracks events (`TASK_ASSIGNED`, `STATUS_CHANGED`, `COMMENT_ADDED`, `SIGNED_OFF`, `DEPLOYED`)
- `ActivityRead`
  - per-user read tracking

### Audit models
- `TaskHistory`
  - immutable audit entries for task mutations
  - stores actor, action, message, before/after snapshots, metadata, timestamp

### Task audit/signoff fields
- `Task.updatedById` → relation to `User` (`updatedBy`)
- `Task.signedOffAt`
- `Task.signedOffById` → relation to `User` (`signedOffBy`)

### User lifecycle fields
- `User.isActive` (login enable/disable)
- `User.lastLoginAt` (admin visibility for account activity)
- `User.mustChangePassword` (first-login/per-reset mandatory password update)
  - after successful password change, user is redirected to their dashboard without an extra re-login
  - password-change modal includes real-time password policy and confirm-match validation feedback
- `User` notification preferences:
  - `notifyOnAssignmentEmail`
  - `notifyOnReminderEmail`
  - `notifyOnMentionInbox`
  - `notifyOnSignoffEmail`

## API Surface
### Auth
- `POST/GET /api/auth/[...nextauth]`

### Tasks
- `GET /api/tasks`
  - optimized for dashboard/list usage with lightweight relation payload
  - includes DB-side `commentCount` summary (full comments are fetched only on detail/report endpoints)
- `GET /api/tasks/[id]`
  - full task detail payload for task execution screen
- `PATCH /api/tasks/[id]`
- `DELETE /api/tasks/[id]` (admin only)
- `GET /api/tasks/[id]/history` (secured; admin/stakeholder scoped like task access)
- `POST /api/tasks/[id]/status`
- `POST /api/tasks/[id]/comments`
- `POST /api/tasks/[id]/signoff`
- `POST /api/tasks/[id]/notify-assigned` (admin manual trigger)
- `POST /api/tasks/[id]/reminder` (admin manual trigger)
- `POST /api/tasks/[id]/steps`
- `PATCH /api/tasks/[id]/steps/[stepId]`
- `DELETE /api/tasks/[id]/steps/[stepId]`
- `POST /api/tasks/[id]/steps/import`
  - Admin-only bulk replace of task steps from import wizard.
- `GET /api/tasks/[id]/signoff-report`
  - Printable portrait sign-off report template with latest task history and step-grouped comment section.
  - Comments section is hidden automatically when no comments exist.

Task mutation guarantees:
- Server-enforced status transition rules (`lib/taskGuards.ts` + `/api/tasks/[id]/status`)
- Optimistic concurrency via `expectedUpdatedAt` on task detail mutations (`409 Conflict` on stale writes)
- Signed-off task lock enforcement across metadata, status, steps, and comments
- Assignee integrity enforcement:
  - task assignee must be an active stakeholder in the same task country
  - non-draft tasks cannot be unassigned
- Draft workflow enforcement:
  - new tasks are created in `DRAFT`
  - `DRAFT` tasks are visible but stakeholder actions are blocked (status updates, step execution, comments, sign-off)
  - admin promotes task to `READY` explicitly from task detail
  - assignment email is sent on `DRAFT -> READY` transition
  - manual assignment/reminder trigger endpoints reject `DRAFT` and completed tasks
- Multi-market task grouping and global metadata update:
  - multi-country create flow assigns shared `taskGroupId` across generated tasks.
  - admin task detail supports optional group-wide metadata propagation for:
    - title, description, jiraTicket, crNumber, developer, dueDate
  - signed-off tasks remain immutable and are skipped with summary reporting.
  - group preview endpoint: `GET /api/tasks/[id]/group-preview` (ADMIN only)
  - admin task management includes bulk-selected global edit modal reusing grouped update logic.
- `GET /api/tasks` includes a resilient fallback path: if relation-heavy fetch fails, API returns minimal task payload so dashboards still load.
- `GET /api/tasks/[id]` includes the same resilient fallback path to keep task detail accessible when relation-heavy hydration fails.
- Performance observability:
  - key endpoints return `X-Query-Time-Ms` header:
    - `/api/tasks`
    - `/api/tasks/[id]`
    - `/api/tasks/[id]/history`
  - development server logs perf lines for quick baseline comparison.
  - App client keeps a short-lived (30s) session task cache to improve perceived load speed on refresh/navigation.
  - task history endpoint fetch window is intentionally capped for task detail latency.
  - DB indexes added for task/comment hot paths via:
    - `prisma/migrations/20260226190000_add_task_comment_performance_indexes/migration.sql`

### Admin Utilities
- `POST /api/admin/test-notification`
  - Admin-only test email endpoint for Resend setup verification.
- `GET/POST /api/admin/users`
  - Admin-only user list/create (current policy: stakeholder creation only).
- `PATCH /api/admin/users/[id]`
  - Admin-only user update (name/country/status).
- `POST /api/admin/users/[id]/reset-password`
  - Admin-only temp-password reset (rate-limited).
- `POST /api/users/change-password`
  - Authenticated password change endpoint; clears `mustChangePassword`.
- `GET/PATCH /api/users/notification-preferences`
  - Authenticated self-service notification settings (no cross-user update allowed).

Admin audit checklist:
- `ADMIN_AUDIT_COVERAGE.md` tracks coverage status for admin/task write endpoints.
- Notification trigger routes now emit explicit admin audit entries:
  - `/api/tasks/[id]/notify-assigned`
  - `/api/tasks/[id]/reminder`
  - `/api/admin/test-notification`
- Step import route now emits explicit admin audit entries:
  - `/api/tasks/[id]/steps/import`

### Activities
- `GET /api/activities`
  - admin sees all
  - stakeholder sees scoped activity
- `POST /api/activities/mark-read`
  - mark one or mark all as read

### Inbox
- `GET /api/inbox`
  - grouped unread-comment threads now include latest context fields:
    - `latestStepOrder`
    - `latestCommentId`
    - `assigneeId`
  - used by client to deep-link task detail to the relevant step/comment context.
- `POST /api/inbox/mark-read`
  - marks task inbox thread read for current user.

### Debug
- `GET /api/debug/env`
- `GET /api/health`
  - non-cached runtime health signal (DB reachability + auth/env configuration checks).

## Recent Activity Behavior (Current)
Recent activity is DB-backed (not mock).

Currently created events:
- Comment added
- Task signed off
- Status changed to `FAILED`
- Status changed to `DEPLOYED`
- Seeded task assignment events (`TASK_ASSIGNED`)

## Email Notifications (Current)
- Resend-backed utility functions in `lib/email.ts`:
  - `sendTaskAssignedEmail`
  - `sendTaskReminderEmail`
  - `sendTaskSignedOffEmail`
- Trigger points:
  - manual test button on Admin Dashboard (`/api/admin/test-notification`)
  - admin manual assignment/reminder actions from admin task management
  - sign-off flow auto-sends signed-off email to admin (`to`) and assignee (`cc` when available)
- Current delivery in local/dev follows Resend sandbox rules unless domain is verified.

## Recent UI/Behavior Updates
- Admin task table was compacted to fit within viewport better.
- Admin task table rows are clickable to open Task Detail.
- Delete action removed from table and moved to Task Detail (admin-only).
- Admin task table supports bulk delete through row selection.
- After admin deletes a task from detail, navigation returns to task management table.
- Due date in admin table shows date-only.
- Priority badge styling standardized across levels.
- Admin database includes a new `Users` tab:
  - searchable/filterable stakeholder/user list
  - right-side drawer for create/edit
  - disable/enable and temporary password reset actions
- Login flow enforces an undismissable password change modal when `mustChangePassword` is true.
- Import wizard is functional for CSV files exported from Excel (column mapping + preview).
- Import supports:
  - replace steps in an existing task, or
  - create a new task directly from imported step rows.
- Import preview supports inline multiline manual corrections before confirm.
- Import success state includes direct navigation to the resulting task detail page.
- Existing-task replace confirmation is handled in-app (custom modal) instead of browser-native dialogs.
- Critical destructive/discard confirmations are standardized to in-app modals across admin/task flows.
- Admin task management supports filtered CSV export.

Additional behavior:
- Failed events include step context when available (example: `Step 2 in <Task Title>`).
- Comment activity can include step context.
- No-op status changes are ignored.
- Mark-as-read is stored per user via `ActivityRead`.
- Stakeholder inbox `Open task` now opens task detail with latest unread step expanded.
- Stakeholder inbox context now auto-scrolls and temporarily highlights the target unread comment in task detail when available.
- Stakeholder inbox supports quick triage filters:
  - all discussions
  - my assigned tasks (admin view)
  - blocked/failed discussions
- Stakeholder dashboard persists filter/search state per market in local storage.
- Stakeholder dashboard includes a lightweight onboarding helper card:
  - 3-step guidance (open task, update steps, sign off)
  - no spotlight/overlay layer
  - dismiss persistence per user (`localStorage`)
- Stakeholder dashboard includes notification preference settings card:
  - assignment email
  - reminder email
  - mention/inbox
  - sign-off email
- Stakeholder dashboard now renders loading skeletons for KPI cards and task cards during initial fetch.
- Step comment UX now supports multiline drafts, keyboard submit (`Ctrl/Cmd + Enter`), and inline posting feedback.
- Step comment drafts are persisted per user/task in local storage and restored on revisit.
- Empty-state UX includes contextual actions:
  - stakeholder task grid: clear filters or open discussions
  - inbox: refresh and return-to-dashboard actions
- Motion UX polish:
  - login flow includes visible in-progress animation while credential validation runs
  - stakeholder task/inbox cards use subtle enter and hover-lift transitions
  - task-detail save-state labels use micro-animations for clearer feedback
  - preference toggles use smooth switch transitions
  - reduced-motion preference is respected globally
- Task detail discussion UX:
  - quick action to mark current task discussions/comments as read
  - inline `@mention` autocomplete suggestions in comment composer
- In-portal Knowledge Base:
  - reusable knowledge-base card (visual vertical workflow timeline + status definitions)
  - rendered in both stakeholder and admin dashboards
- Save-state + unsaved-change guards are implemented in:
  - `views/TaskDetail.tsx`
  - `views/AdminTaskManagement.tsx` (create modal)
  - `views/AdminDatabase.tsx` (notification settings)
- Admin task detail shows recent immutable task history timeline from `/api/tasks/[id]/history`.

## Data Mapping Layer
- `app/api/tasks/_mappers.ts`
  - Maps Prisma entities to UI DTO shape.
  - Step-level comments map by structured `Comment.stepOrder`.
- `app/api/tasks/_types.ts`
  - DTO contracts used by task APIs.
- `app/api/tasks/_query.ts`
  - central include maps reused by task list/detail APIs.

Comment normalization:
- One-time legacy backfill script:
  - `scripts/backfill-comment-step-order.ts`
  - run via `npm run comments:backfill-step-order`

## Concurrency + Lifecycle Rules
- Status changes are validated server-side against allowed transitions before update.
- Mutation endpoints accept `expectedUpdatedAt`; if the current DB value differs, API rejects with `409`.
- Task detail UI (`views/TaskDetail.tsx`) sends `expectedUpdatedAt` and refreshes task data on conflicts.

## Build / Scripts
From `package.json`:
- `npm run dev`
- `npm run build` → runs `prisma generate && next build`
- `npm run start`
- `npm run lint`
- `npm run audit:check-admin` (guard: admin write routes must call `createAdminAudit`)
- `npm run perf:sample` (manual latency sampling for `X-Query-Time-Ms` headers)
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:studio`
- `npm run prisma:seed`

Also:
- `postinstall` runs `prisma generate` (important for Vercel consistency).
- Dependency cleanup:
  - `recharts` removed (was unused).
- Browser automation:
  - `scripts/playwright_admin_flow.sh` runs a Playwright CLI-based admin smoke flow.
  - checks login then validates `/admin/dashboard`, `/admin/tasks`, `/admin/database`.
  - stores run artifacts in `output/playwright/`.
  - security: credentials are passed via environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD`), not hardcoded.
- Audit governance:
  - CI runs `npm run audit:check-admin` to block admin write endpoints without explicit audit calls.
  - Guard scope includes `/api/admin/**` write routes plus admin-capable task write routes (`notify-assigned`, `reminder`, `steps/import`).

## Accessibility (Phase 1)
- Core improvements landed for:
  - login page (`App.tsx`)
  - admin task management controls/table interaction (`views/AdminTaskManagement.tsx`)
  - task detail step interactions and icon controls (`views/TaskDetail.tsx`)

## Local Setup
1. `npm install`
2. Set env vars:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (for deployed env)
3. `npm run prisma:migrate`
   - includes migration `20260226223000_add_task_group_id` (required for global multi-market updates)
4. `npm run prisma:seed`
5. `npm run dev`

## Deployment Notes (Vercel)
- Ensure production env vars are set in Vercel.
- Build uses Prisma client generation before Next build.
- If schema changes are deployed, run migrations against production DB before/with deploy process.
- Operational reference docs:
  - `PRODUCTION_READINESS.md`
  - `OPS_RUNBOOK.md`

## Known Technical Debt / Next Candidates
- Move Tailwind usage from CDN-style setup into full config-based pipeline if desired.
- Add explicit runtime `TASK_ASSIGNED` event creation in admin task-creation API flow.
- Consolidate TaskDetail-side optimistic updates with stricter server refresh boundaries.
