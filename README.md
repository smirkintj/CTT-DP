# CTT (Cuba Try Test)

CTT is a Next.js App Router web app for UAT workflow management across countries/markets.

## Stack
- Next.js 15 (App Router)
- React 19
- NextAuth v4 (Credentials)
- Prisma + PostgreSQL (Neon)
- Tailwind CSS

## Main Routes
- `/`
- `/admin/dashboard`
- `/admin/tasks`
- `/admin/database`
- `/import`
- `/tasks/[id]`

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

## Notes
- Build script runs `prisma generate && next build` to avoid stale Prisma client issues in CI/Vercel.
- Middleware enforces:
  - `/admin/*` and `/import` => ADMIN only
  - `/tasks/*` => authenticated users
- Login hardening is enabled:
  - client-side email validation + submit throttling UX
  - server-side temporary lockout after repeated failed attempts
- Recent Activity is database-backed via `Activity` and `ActivityRead` tables.
- Task mutation APIs enforce:
  - status transition rules (invalid transitions return `409`)
  - optimistic concurrency using `expectedUpdatedAt` (stale updates return `409`)
- Step-comment normalization:
  - `Comment.stepOrder` is the source of truth for step-level mapping.
  - Run `npm run comments:backfill-step-order` once after upgrading old environments.
- Email notifications:
  - Admin test email: `/api/admin/test-notification`
  - Assignment email: `/api/tasks/[id]/notify-assigned`
  - Manual reminder email: `/api/tasks/[id]/reminder`
  - Sign-off email is triggered from `/api/tasks/[id]/signoff`

## Admin UX Updates
- `/admin/tasks` table rows are clickable to open task details.
- Delete action is moved to Task Detail page (admin-only).
- Due date in admin task table is date-only (no time).
- Priority badges are standardized with colored dots for all levels.
- Save-state + unsaved-change guards are active on:
  - Task Detail edits
  - Admin Task create modal
  - Admin Database notification settings (email + Teams)

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
