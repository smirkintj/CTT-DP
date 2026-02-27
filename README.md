# CTT (Cuba Try Test)

CTT is a Next.js App Router web app for UAT workflow management across countries/markets.

## Stack
- Next.js 15 (App Router)
- React 19
- NextAuth v4 (Credentials)
- Prisma + PostgreSQL (Neon)
- Tailwind CSS

Dependency hygiene:
- Unused `recharts` dependency has been removed.

## Main Routes
- `/`
- `/admin/dashboard`
- `/admin/tasks`
- `/admin/database`
- `/import`
- `/tasks/[id]`
- `/api/health` (runtime + dependency health checks)

## Prerequisites
- Node.js 18+
- PostgreSQL database (Neon supported)

## Environment Variables
Set in `.env` (or deployment env):

- `DATABASE_URL` = PostgreSQL connection string
- `NEXTAUTH_SECRET` = strong random secret
- `NEXTAUTH_URL` = app base URL (required in deployed env)
- `RESEND_API_KEY` = Resend API key
- `EMAIL_FROM` = sender email (must match Resend/domain policy)

## Install
```bash
npm install
```

## Database Setup
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Run Locally
```bash
npm run dev
```

## Build
```bash
npm run build
npm run start
```

## Useful Scripts
- `npm run lint`
- `npm run prisma:studio`
- `npm run clean`
- `npm run reset:dev` (kills local dev server ports and clears `.next` cache)
- `npm run comments:backfill-step-order` (one-time legacy comment step-order backfill)
- `npm run audit:check-admin` (fails if admin write route has no `createAdminAudit` call)
- `npm run perf:sample` (samples API latency headers; supports `APP_URL`, `TASK_ID`, `COOKIE_HEADER`)
- `scripts/playwright_admin_flow.sh` (automates admin browser smoke flow with Playwright CLI wrapper)

## Playwright Browser Automation (Admin Flow)
Technical dependencies:
- Node.js/npm with `npx` available
- running local app (`npm run dev`)
- valid admin credentials

Run steps:
```bash
# 1) start app in a separate terminal
npm run dev

# 2) run browser flow (credentials via env vars for security)
export APP_URL="http://localhost:3000"
export ADMIN_EMAIL="your-admin-email"
export ADMIN_PASSWORD="your-admin-password"
export HEADED=1
./scripts/playwright_admin_flow.sh
```

What it validates:
- login page and credential submit
- `/admin/dashboard`
- `/admin/tasks`
- `/admin/database`

Artifacts:
- saved in `output/playwright/<run-label>-<timestamp>/`
- includes snapshots, screenshots, console warnings, and network logs

Security notes:
- credentials are not hardcoded
- use environment variables and avoid committing secrets

## Notes
- Build script runs `prisma generate && next build` to avoid stale Prisma client issues in CI/Vercel.
- Vercel Speed Insights is enabled in `/Users/putra/Desktop/CTT-DKSH-main/app/layout.tsx` for runtime frontend performance telemetry.
- Middleware enforces:
  - `/admin/*` and `/import` => ADMIN only
  - `/tasks/*` => authenticated users
- Login hardening is enabled:
  - client-side email validation + submit throttling UX
  - server-side temporary lockout after repeated failed attempts
  - disabled users (`User.isActive = false`) cannot log in
  - forced permanent-password setup (`mustChangePassword`) before portal access, then user stays signed in and is redirected to dashboard
  - password-change modal now uses focused centered width, stronger backdrop layering, and real-time password rule/match validation
  - accessibility improvements on login form controls and error/loading semantics
- Recent Activity is database-backed via `Activity` and `ActivityRead` tables.
- Task mutation APIs enforce:
  - status transition rules (invalid transitions return `409`)
  - optimistic concurrency using `expectedUpdatedAt` (stale updates return `409`)
  - assignee integrity checks on create/edit (active stakeholder in matching country)
  - non-draft tasks cannot be unassigned
- Task APIs are being standardized to a shared error response shape via `lib/apiError.ts` (`error`, `code`, optional `detail` in dev).
- Shared Prisma include maps are centralized at `app/api/tasks/_query.ts` to reduce query-shape drift.
- Performance baseline work (Phase 1):
  - `/api/tasks` now uses a lighter list query shape (summary fields only).
  - `/api/tasks` now returns `commentCount` summary instead of full comments payload for faster list response.
  - `/api/tasks`, `/api/tasks/[id]`, and `/api/tasks/[id]/history` return `X-Query-Time-Ms` response header for quick latency checks.
  - Client task list now uses short-lived session cache (30s) to reduce repeated fetch latency on quick page reloads/navigation.
  - Task detail avoids redundant hydration fetch when already opened with rich step data.
  - Added DB performance index migration:
    - `prisma/migrations/20260226190000_add_task_comment_performance_indexes/migration.sql`
- Immutable task history is enabled:
  - all core task mutations write `TaskHistory` entries
  - admin can review history in Task Detail
  - API endpoint: `/api/tasks/[id]/history`
- Step-comment normalization:
  - `Comment.stepOrder` is the source of truth for step-level mapping.
  - Run `npm run comments:backfill-step-order` once after upgrading old environments.
- Email notifications:
  - Admin test email: `/api/admin/test-notification`
  - Assignment email: `/api/tasks/[id]/notify-assigned`
  - Manual reminder email: `/api/tasks/[id]/reminder`
  - Sign-off email is triggered from `/api/tasks/[id]/signoff`
- Admin user management:
  - List/create/update/disable/reset password endpoints:
    - `/api/admin/users`
    - `/api/admin/users/[id]`
    - `/api/admin/users/[id]/reset-password`
  - UI: `/admin/database` → `Users` tab (drawer-based management)
  - Security rules:
    - ADMIN-only APIs
    - cannot create additional ADMIN users (current policy)
    - cannot disable your own admin account
    - reset-password is rate-limited per admin/user target (60s)
    - reset password emails temporary password and forces password change on next login
- Admin audit coverage:
  - Checklist file: `/Users/putra/Desktop/CTT-DKSH-main/ADMIN_AUDIT_COVERAGE.md`
  - CI guard (`npm run audit:check-admin`) now validates:
    - `/api/admin/**` write routes
    - admin-capable task write routes (`/api/tasks/[id]/notify-assigned`, `/api/tasks/[id]/reminder`, `/api/tasks/[id]/steps/import`)
  - Manual notification trigger endpoints now emit admin audit events:
    - `/api/tasks/[id]/notify-assigned`
    - `/api/tasks/[id]/reminder`
    - `/api/admin/test-notification`
  - Step import route now emits explicit admin audit entries:
    - `/api/tasks/[id]/steps/import`
- Accessibility (Phase 1):
  - improved keyboard/ARIA support in:
    - login screen
    - admin task management filters/table row open flow
    - task detail step toggle and icon-only controls
- Operational docs:
  - Production checklist: `/Users/putra/Desktop/CTT-DKSH-main/PRODUCTION_READINESS.md`
  - Incident runbook: `/Users/putra/Desktop/CTT-DKSH-main/OPS_RUNBOOK.md`
- Import wizard:
  - `/import` supports CSV files exported from Excel (header row required).
  - Admin maps columns (description/expected result/actual result/test data), manually fixes missing preview fields inline, and then either:
    - replace steps in an existing task, or
    - create a brand-new task from the imported steps.
  - Preview fields support multiline text editing.
  - After successful import, admin can directly open task detail from the success state.
  - Existing-task replacement uses in-app confirmation modal (no browser-native confirm popup).
- Multi-market global admin update:
  - tasks created for multiple countries now share `taskGroupId` automatically.
  - in task detail, admin can opt to apply supported fields across the full group:
    - title, description, Jira ticket, CR number, developer, due date
  - signed-off tasks are skipped automatically and reported in save summary.
  - preview API: `/api/tasks/[id]/group-preview`
  - security: global update is ADMIN-only and still enforces signed-off locks.
  - task detail preview now shows affected market list and disables global apply when no editable tasks remain.
  - admin task table now supports selected-group global edit modal (same supported fields as task detail global update).
- Reporting:
  - Admin task table supports filtered CSV export.
  - Sign-off report uses a dedicated portrait printable template via `/api/tasks/[id]/signoff-report`, includes recent task history plus step-grouped comments, and supports auto print prompt (`?autoprint=1`).
  - If a task has no comments, the comments section is omitted from the PDF output.

## Task Workflow
- New tasks are created as `DRAFT`.
- `DRAFT` tasks are visible to assigned stakeholders for anticipation, but stakeholder testing actions are locked.
- Admin finalizes task details/steps, then uses `Mark as READY` in Task Detail.
- When `DRAFT -> READY`:
  - assignment email is automatically triggered to the assignee
  - Teams assignment notification is triggered (if configured)
- Security guardrails:
  - stakeholder comment/step/sign-off actions are blocked for `DRAFT` tasks
  - signed-off tasks remain locked for edits
  - manual assignment/reminder email triggers are blocked for `DRAFT` and completed (`SIGNED_OFF`/`DEPLOYED`) tasks

## Admin UX Updates
- `/admin/tasks` table rows are clickable to open task details.
- Delete action is moved to Task Detail page (admin-only).
- Bulk delete is supported from `/admin/tasks` via row selection.
- After task deletion from detail view, admin is redirected to task management table.
- Due date in admin task table is date-only (no time).
- Priority badges are standardized with colored dots for all levels.
- Save-state + unsaved-change guards are active on:
  - Task Detail edits
  - Admin Task create modal
  - Admin Database notification settings (email + Teams)
- Auth/session hydration now shows a neutral loading state to prevent brief login-page flicker on refresh.
- Stakeholder UX updates:
  - Inbox `Open task` now deep-links task detail to the latest unread step context.
  - Inbox supports quick triage filters (`All Discussions`, `My Assigned Tasks` for admin, `Blocked / Failed`).
  - Stakeholder dashboard filter/search state is persisted per market in local storage.
  - Step action area in task detail shows inline save feedback (`Saving step...`, `Step saved`, `Save failed`).
  - Step comments now support multiline input, keyboard submit (`Ctrl/Cmd + Enter`), and inline post-state feedback.
  - Stakeholder dashboard uses loading skeletons for KPI cards/task cards to reduce perceived loading delay.
- Form styling is being consolidated with shared Apple-style utility classes:
  - `/Users/putra/Desktop/CTT-DKSH-main/components/ui/formClasses.ts`
- Inline validation is now enforced in key task create/edit flows (client + server).
- Jira validation/normalization is centralized via `lib/taskValidation.ts` and reused in task create/edit UI.
- Import wizard new-task path now validates title length and due date format before submit.
- Critical confirmations use in-app modals (no browser-native confirm popups).

## Troubleshooting
### 1) Vercel build error: `Property 'activity' does not exist on type PrismaClient`
Cause:
- Prisma client in build environment is stale (generated before latest schema).

Fix:
1. Ensure `package.json` has:
   - `postinstall: prisma generate`
   - `build: prisma generate && next build`
2. Redeploy after pushing latest commit.

### 2) Task detail/API returns 500 after schema changes
Cause:
- DB schema is behind code expectations (new Prisma fields/tables not migrated).

Fix:
1. Run:
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
2. If needed, run seed again:
   - `npm run prisma:seed`
3. Restart dev server:
   - `npm run dev`
4. If pulling latest history feature changes, run migration:
   - `npx prisma migrate deploy` (production/staging)
   - or `npm run prisma:migrate` (local dev)

### 4) Dashboard login succeeds but `/api/tasks` returns 500
Cause:
- Relation include or legacy data shape can break full task hydration in development.

Current behavior:
- `/api/tasks` now has a resilient fallback to return minimal task data if full relational fetch fails.
- In development only, API response includes `detail` to help identify root cause safely.

### 5) Task detail shows "Failed to refresh task"
Cause:
- Relation include or legacy data shape can fail on `/api/tasks/[id]` hydration.

Current behavior:
- `/api/tasks/[id]` now has the same resilient fallback behavior as task list fetch.
- In development only, API response includes `detail` for faster diagnosis.

### 3) Runtime module error: `Cannot find module './vendor-chunks/...` or missing chunk files
Cause:
- Corrupted/stale local Next.js cache (`.next`) in dev mode.

Fix:
1. Run:
   - `npm run reset:dev`
2. Start dev server:
   - `npm run dev`

## Documentation
For detailed architecture and flow, see:
- `/Users/putra/Desktop/CTT-DKSH-main/PROJECT_OVERVIEW.md`
