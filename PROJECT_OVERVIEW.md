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

### Task audit/signoff fields
- `Task.updatedById` → relation to `User` (`updatedBy`)
- `Task.signedOffAt`
- `Task.signedOffById` → relation to `User` (`signedOffBy`)

## API Surface
### Auth
- `POST/GET /api/auth/[...nextauth]`

### Tasks
- `GET /api/tasks`
- `GET /api/tasks/[id]`
- `PATCH /api/tasks/[id]`
- `DELETE /api/tasks/[id]` (admin only)
- `POST /api/tasks/[id]/status`
- `POST /api/tasks/[id]/comments`
- `POST /api/tasks/[id]/signoff`
- `POST /api/tasks/[id]/notify-assigned` (admin manual trigger)
- `POST /api/tasks/[id]/reminder` (admin manual trigger)
- `POST /api/tasks/[id]/steps`
- `PATCH /api/tasks/[id]/steps/[stepId]`
- `DELETE /api/tasks/[id]/steps/[stepId]`

Task mutation guarantees:
- Server-enforced status transition rules (`lib/taskGuards.ts` + `/api/tasks/[id]/status`)
- Optimistic concurrency via `expectedUpdatedAt` on task detail mutations (`409 Conflict` on stale writes)
- Signed-off task lock enforcement across metadata, status, steps, and comments
- `GET /api/tasks` includes a resilient fallback path: if relation-heavy fetch fails, API returns minimal task payload so dashboards still load.

### Admin Utilities
- `POST /api/admin/test-notification`
  - Admin-only test email endpoint for Resend setup verification.

### Activities
- `GET /api/activities`
  - admin sees all
  - stakeholder sees scoped activity
- `POST /api/activities/mark-read`
  - mark one or mark all as read

### Debug
- `GET /api/debug/env`

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
- Due date in admin table shows date-only.
- Priority badge styling standardized across levels.

Additional behavior:
- Failed events include step context when available (example: `Step 2 in <Task Title>`).
- Comment activity can include step context.
- No-op status changes are ignored.
- Mark-as-read is stored per user via `ActivityRead`.
- Save-state + unsaved-change guards are implemented in:
  - `views/TaskDetail.tsx`
  - `views/AdminTaskManagement.tsx` (create modal)
  - `views/AdminDatabase.tsx` (notification settings)

## Data Mapping Layer
- `app/api/tasks/_mappers.ts`
  - Maps Prisma entities to UI DTO shape.
  - Step-level comments map by structured `Comment.stepOrder`.
- `app/api/tasks/_types.ts`
  - DTO contracts used by task APIs.

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
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:studio`
- `npm run prisma:seed`

Also:
- `postinstall` runs `prisma generate` (important for Vercel consistency).

## Local Setup
1. `npm install`
2. Set env vars:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (for deployed env)
3. `npm run prisma:migrate`
4. `npm run prisma:seed`
5. `npm run dev`

## Deployment Notes (Vercel)
- Ensure production env vars are set in Vercel.
- Build uses Prisma client generation before Next build.
- If schema changes are deployed, run migrations against production DB before/with deploy process.

## Known Technical Debt / Next Candidates
- Move Tailwind usage from CDN-style setup into full config-based pipeline if desired.
- Add explicit runtime `TASK_ASSIGNED` event creation in admin task-creation API flow.
- Consolidate TaskDetail-side optimistic updates with stricter server refresh boundaries.
