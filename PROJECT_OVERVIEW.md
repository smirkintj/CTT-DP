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
- `/knowledge-base` → Shared knowledge base route (authenticated)
- Floating assistant → available across authenticated screens via `components/AssistantDock.tsx`

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
- `AssistantDock.tsx` (floating UAT assistant panel with structured task cards)
- `Badge.tsx`
- `SignatureCanvas.tsx`

## In-App Assistant
- API route: `app/api/assistant/chat/route.ts`
- Core logic: `lib/assistant.ts`
- Uses the existing NextAuth session plus Prisma queries for role, country, assignee, and product scoping.
- Uses OpenAI-compatible chat completions via `fetch`, so Ollama or another compatible provider can be swapped through env vars without changing route code.
- Returns conversational text plus card payloads for task-style answers so the UI can render structured results instead of plain paragraphs.

### Runtime Telemetry
- Vercel Speed Insights is mounted in root layout:
  - `/Users/putra/Desktop/CTT-DKSH-main/app/layout.tsx`

## Authentication
### NextAuth
- Handler: `app/api/auth/[...nextauth]/route.ts`
- Config: `lib/auth.ts`
- Providers:
  - Credentials (`email`, `password`)
  - Admin magic-link credentials (`token`)
- Password check: `bcryptjs.compare`
- Session strategy: JWT
- Login abuse protection:
  - server-side temporary lockout on repeated failed attempts (`lib/loginRateLimit.ts`)
  - client-side email validation + lock countdown UX in `App.tsx`
  - current lockout duration is 30 seconds with live retry countdown messaging
  - accessibility semantics on login controls/errors/loading in `App.tsx`
  - magic-link request throttling (`lib/magicLinkRateLimit.ts`)
  - magic-link request API returns generic success to avoid account enumeration
  - magic-link token storage is hashed and one-time-use with TTL
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
- `Product`
- `Country`
- `Module` (product-scoped)
- `TargetSystem` (product-scoped)
- `UserProductAccess`
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
  - `notifyOnAssignmentEmail` — email when task is assigned
  - `notifyOnReminderEmail` — email from automated daily reminder cron
  - `notifyOnMentionInbox` — email when @mentioned in a comment
  - `notifyOnSignoffEmail` — email when task is signed off

### Email notifications
- **Task assigned** — fires automatically on DRAFT→READY transition or assignee change
- **@mention** — fires fire-and-forget when a comment containing @username is posted; respects `notifyOnMentionInbox` preference; self-mentions skipped
- **Automated reminder** — daily Vercel Cron (`vercel.json`, `0 1 * * *` = 9 AM MYT) calls `/api/cron/reminders`; sends to assignees of READY/IN_PROGRESS tasks due within N days (configurable in Admin → Notifications); secured with `CRON_SECRET` env var
- **Sign-off** — fires automatically when a task is signed off
- All templates use `lib/email.ts` via Resend API; consistent DKSH red header branding

### Passwordless admin sign-in model
- `MagicLoginToken`
  - `tokenHash` (SHA-256 hashed token only; raw token never stored)
  - `expiresAt` (15-minute TTL)
  - `usedAt` (single-use enforcement)
  - relation to `User` with cascade delete

## API Surface
### Auth
- `POST/GET /api/auth/[...nextauth]`
- `POST /api/auth/magic-link/request`
  - accepts admin email
  - generic success response regardless of account match
  - if active admin exists, sends one-time magic link email

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
- `GET /api/cron/reminders` — automated daily reminder job; secured with `Authorization: Bearer <CRON_SECRET>`
- `GET/PATCH /api/admin/email-settings` — admin-only reminder toggle and daysBefore config; persisted to `PortalSetting`
- `POST /api/tasks/[id]/steps`
- `PATCH /api/tasks/[id]/steps/[stepId]`
- `DELETE /api/tasks/[id]/steps/[stepId]`
- `POST /api/tasks/[id]/steps/import`
  - Admin-only bulk replace of task steps from import wizard.
- `GET /api/tasks/[id]/signoff-report`
  - Printable portrait sign-off report template with latest task history and step-grouped comment section.
  - Comments section is hidden automatically when no comments exist.
- `POST /api/tasks/[id]/signoff-report/email`
  - Emails the signed-in user a secure report link for the signed-off task.

Task mutation guarantees:
- Server-enforced status transition rules (`lib/taskGuards.ts` + `/api/tasks/[id]/status`)
- Optimistic concurrency via `expectedUpdatedAt` on task detail mutations (`409 Conflict` on stale writes)
- Signed-off task lock enforcement across metadata, status, steps, and comments
- Assignee integrity enforcement:
  - task assignee must be an active stakeholder in the same task country
  - stakeholder must also have access to the selected product
  - non-draft tasks cannot be unassigned
- Product integrity enforcement:
  - every task must belong to a product
  - modules are validated against the selected product
  - target systems are validated against the selected product
- Admin product-scope enforcement:
  - admins with one or more product assignments are restricted to those products
  - admins with no product assignments remain unrestricted (legacy/super-admin behavior)
  - task list/detail/write routes and admin configuration routes enforce this server-side
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
- `POST /api/admin/teams-webhooks/test`
  - Admin-only Teams webhook test endpoint for per-country channel verification.
- `GET /api/admin/jira-intake`
  - Admin-only Jira intake endpoint with product-scoped issue visibility and linked-task detection.
- `GET/POST /api/admin/users`
  - Admin-only user list/create (current policy: stakeholder creation only).
  - stakeholder create now requires one or more product assignments.
- `PATCH /api/admin/users/[id]`
  - Admin-only user update (name/country/status/product access).
- admin user list/update/reset is filtered by the acting admin's product scope when restricted.
- `GET/POST/DELETE /api/admin/products`
  - Admin-only product management.
- `PATCH /api/admin/products`
  - Admin-only per-product Jira configuration update (`jiraProjectKey`, `jiraPullStatuses`).
- `GET/POST/DELETE /api/admin/target-systems`
  - Admin-only target-system management scoped by product.
- `GET /api/admin/task-config`
  - Admin-only aggregated product/module/target-system/Jira config for task forms and intake UI.
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
- Teams webhook POC:
  - per-country webhook config is saved in Admin Database
  - admin can send a sample Teams card through `/api/admin/teams-webhooks/test`
  - this validates channel delivery independently from task events
- Jira intake:
  - dedicated admin `Ready for UAT` page in top navigation
  - each product can define its Jira project key and statuses to pull
  - intake fetch is server-side only using env-based Jira credentials
  - admins only see products within their Jira access scope
  - Jira issues already used by CTT are flagged via `Task.jiraTicket`
  - admins can open the linked task or create a prefilled new task from the Jira issue

## Recent UI/Behavior Updates
- Admin task table was compacted to fit within viewport better.
- Admin task table rows are clickable to open Task Detail.
- Delete action removed from table and moved to Task Detail (admin-only).
- Admin task table supports bulk delete through row selection.
- Admin task table supports bulk status updates across selected tasks (signed-off tasks skipped).
- Admin task table supports bulk stakeholder reassignment using per-country assignee selection.
- Admin bulk status/assignee modals include inline result summaries and in-flight action locking to avoid duplicate submissions.
- Admin task management header now groups secondary controls in a compact `Actions` dropdown while keeping `New Task` as the main visible CTA.
- Admin step-builder `Test Data` input is multiline (textarea) to better fit real-world test datasets.
- Task detail metadata editor (admin) now supports:
  - assignee reassignment after task creation (country-scoped stakeholder dropdown)
  - product selection
  - product-scoped module selection via dropdown
  - product-scoped target system selection via dropdown
  - single-surface metadata save errors (inline), avoiding duplicate toast+inline failure messaging for the same save action
- Admin task management search uses debounce for smoother typing on large lists.
- Admin task table header is sticky and row-selection checkboxes include stronger keyboard focus styles.
- After admin deletes a task from detail, navigation returns to task management table.
- Due date in admin table shows date-only.
- Priority badge styling standardized across levels.
- Task detail admin header now includes explicit country context (`Country: <code>`).
- Task detail step editor uses multiline input for `Test Data`.
- Task detail step editing now reuses the same visible step surface for `Description`, `Expected Result`, and `Test Data` instead of opening a separate secondary editor block.
- Step-level `Edit` / `Delete` actions now use larger pill controls for easier targeting.
- Admin `Mark as READY` now shows in-button loading state while update is in progress.
- `Sign & Complete Task` now shows in-button loading state while sign-off request is in progress.
- Task detail screenshot evidence is resized/compressed client-side before persistence.
- Sign-off PDF report now includes scaled evidence thumbnails per step.
- Sign-off report now includes product name, DKSH branding in the header, and the captured user signature in the printable footer.
- Signed-off task detail now includes an `Email Report to Me` action for users/admins.
- Session display name now refreshes from the database so top-right profile text reflects the saved user/admin name.
- Dashboard task cards now show overdue/pass state through border/top-bar accents and due-date color, reducing extra status pills.
- Stakeholder dashboard card ordering now prioritizes overdue and active tasks first, and the open-task KPI includes an inline overdue count.
- Admin database includes a new `Users` tab:
  - searchable/filterable stakeholder/user list
  - table rows are clickable to open user management
  - right-side drawer for create/edit
  - disable/enable and temporary password reset actions
  - product access assignment per stakeholder/admin
- Admin database includes a `Products` tab:
  - product creation/deletion
  - module management per product
  - target-system management per product, including launch URL
- Login flow enforces an undismissable password change modal when `mustChangePassword` is true.
- Login screen includes a compact `Admin only: password recovery` section for admin passwordless recovery.
- New route `/auth/magic` consumes one-time link and signs admin in automatically.
- Session hydration screen now uses animated loading feedback (spinner + indeterminate bar + pulse dots) while user workspace initializes.
- Added QA debug mode for loading screen validation: `?debugLoading=1` keeps loading view visible for 5 seconds.
- Workspace loading view is now compact-width and uses clearer spacing between subtitle, progress bar, and spinner row.
- Import wizard is functional for CSV files exported from Excel (column mapping + preview).
- Import supports:
  - replace steps in an existing task, or
  - create a new task directly from imported step rows.
- Import preview supports inline multiline manual corrections before confirm.
- Import success state includes direct navigation to the resulting task detail page.
- Existing-task replace confirmation is handled in-app (custom modal) instead of browser-native dialogs.
- Critical destructive/discard confirmations are standardized to in-app modals across admin/task flows.
- Admin task management supports filtered CSV export.
- Admin task management supports summary CSV export (optional created-date range) with aggregate metrics by country and module.
- CSV export is emitted as UTF-8 (BOM) to preserve multilingual text in spreadsheet tools.

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
- Mention handling now normalizes Unicode names/emails and sends structured mention IDs in comment payload for stronger mention tracking.
- Mention tokens in rendered comments are highlighted and displayed as user names (instead of raw email tokens).
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
- Stakeholder and admin dashboard task cards now surface lifecycle context:
  - `Overdue` indicator for tasks past due and not completed
  - signed-off line with date/by-user when signed data is present
- Stakeholder and admin dashboards now show a product badge on task cards so users can immediately see which product each task belongs to.
- Stakeholder blocked-task callout and search now include product context.
- Admin dashboard task cards now render country as a color-coded badge alongside product/module pills for clearer market visibility.
- Step comment UX now supports multiline drafts, keyboard submit (`Ctrl/Cmd + Enter`), and inline posting feedback.
- Step comment drafts are persisted per user/task in local storage and restored on revisit.
- Step execution outcomes now support explicit tri-state:
  - `PASSED`
  - `FAILED`
  - `CONDITIONAL` (non-blocking caveat)
- `TaskStep.stepResult` is stored in DB (with backwards compatibility for legacy `isPassed`) and surfaced in task detail, dashboard cards, and sign-off report export.
- `TaskStep.conditionalReason` is stored for conditional outcomes and required by API when a step is marked `CONDITIONAL`.
- New `PortalSetting` model stores DB-backed app settings, currently used for stakeholder dashboard helpful links.
- Stakeholder dashboard helpful links are now admin-editable from System Database -> Helpful Links tab.
- Key task/comment/step/sign-off API flows now emit structured `[pilot]` server logs for pilot troubleshooting.
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
- Task detail signed state UX:
  - explicit read-only lock notice after sign-off
  - signed signature block displays `Signed by [name] on [date]` with styled identity/date emphasis
- In-portal Knowledge Base:
  - dedicated knowledge-base page with visual horizontal workflow timeline + exception route
  - includes plain-language status definitions with distinct visual status separation
  - includes stakeholder tutorial cards (pass/fail, comment, mention tagging)
  - tutorial labels resolve stakeholder/admin names from session + DB user list context
  - includes FAQ guidance on sign-off PDF download (from signed-off task detail)
  - includes FAQ guidance for identifying legitimate portal notification emails
  - route is available to authenticated users via top navigation
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
- `npm run db:migrate:deploy` → runs `prisma migrate deploy` against the current `DATABASE_URL`
- `npm run start`
- `npm run lint`
- `npm run audit:check-admin` (guard: admin write routes must call `createAdminAudit`)
- `npm run perf:sample` (manual latency sampling for `X-Query-Time-Ms` headers)
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:studio`
- `npm run prisma:seed`
  - seeds baseline data plus ~100 mock tasks spanning all task statuses.
- `npm run db:purge-and-seed`
  - destructive reset: deletes all data and recreates base countries/modules/users (requires `CONFIRM_PURGE=YES`).

Also:
- `postinstall` runs `prisma generate` (important for Vercel consistency).
- DB migrations are intentionally separate from `npm run build` so deploys do not fail just because the target DB is temporarily unreachable.
- `/tasks/[id]` is forced dynamic so Vercel does not try to run task-detail Prisma reads during preview build compilation.
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
- Current rollout target URLs:
  - production: `https://ctt-dksh.vercel.app/`
  - staging / UAT: `https://cttstg-dksh.vercel.app/`
- Operational reference docs:
  - `PRODUCTION_READINESS.md`
  - `OPS_RUNBOOK.md`
  - `UAT_PROD_READINESS.md`
  - `TESTER_UAT_PACK.md`
  - `SECURITY_COMPLIANCE_CHECKLIST.md`
  - `AZURE_BITBUCKET_MIGRATION_PLAN.md`
  - `ISO27001_UAT_CHECKLIST.md`
  - `HERMES_AGENT.md` — external agent integration for drafting UAT test cases (CSV compatible with the Import Wizard)

## Known Technical Debt / Next Candidates
- Move Tailwind usage from CDN-style setup into full config-based pipeline if desired.
- Add explicit runtime `TASK_ASSIGNED` event creation in admin task-creation API flow.
- Consolidate TaskDetail-side optimistic updates with stricter server refresh boundaries.
