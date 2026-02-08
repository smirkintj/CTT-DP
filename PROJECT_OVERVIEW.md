# CTT Web App — Developer Overview

This document explains the architecture, code structure, data flow, and styling conventions so new developers can navigate the project quickly.

## Tech Stack
- Framework: Next.js 15 (App Router)
- Auth: NextAuth v4 (Credentials provider)
- Database: PostgreSQL (Neon) via Prisma
- Styling: Tailwind CSS (via CDN in `app/layout.tsx`), plus a small global CSS file

## High-Level Architecture
The app is a single-page UX rendered by a client-only `App.tsx` that holds UI state and decides which view to render. Routing is handled by the App Router and a small client shell (`AppRouteShell`) that maps view changes to URLs.

### Entry Points
- `app/layout.tsx`  
  Defines global HTML structure, loads Tailwind CDN, sets font and metadata, and wraps children in `Providers` for NextAuth session context.
- `app/Providers.tsx`  
  Client wrapper that injects `SessionProvider`.
- `app/page.tsx`  
  Loads `AppRouteShell` for the root route.

### Pages / Routes
Routes are thin; they render the shared shell and a specific `initialView`:
- `/` → `app/page.tsx`
- `/admin/dashboard` → `app/admin/dashboard/page.tsx`
- `/admin/tasks` → `app/admin/tasks/page.tsx`
- `/admin/database` → `app/admin/database/page.tsx`
- `/import` → `app/import/page.tsx`
- `/tasks/[id]` → `app/tasks/[id]/page.tsx`

The task detail page performs server-side authorization and renders a minimal error card for 403/404 using `ErrorLayout`.

## Core UI Flow
`App.tsx` is the main client component that:
- reads NextAuth session
- sets `currentUser`
- fetches tasks from `/api/tasks`
- tracks current view (dashboard/admin/task detail, etc.)
- renders the appropriate view component

### Views
Located in `views/`:
- `StakeholderDashboard.tsx`
- `AdminDashboard.tsx`
- `AdminTaskManagement.tsx`
- `AdminDatabase.tsx`
- `TaskDetail.tsx`
- `ImportWizard.tsx`

Most views are pure UI, driven by props and local state only.

### Components
Located in `components/`:
- `Layout.tsx`: top nav, notifications, profile, shared layout shell
- `Badge.tsx`, `SignatureCanvas.tsx`, etc.

## Auth & Session
Auth is handled by NextAuth Credentials provider with Prisma:

- Route: `app/api/auth/[...nextauth]/route.ts`
- Options: `lib/auth.ts`
  - Checks user by email
  - Compares password with `bcryptjs`
  - Stores `id`, `role`, `countryCode` in JWT + session

Session access:
- Client: `useSession` in `App.tsx`
- Server: `getServerSession(authOptions)` in API routes and page-level authorization

## Access Control
### Middleware (`middleware.ts`)
Enforces route protection:
- `/admin/*` and `/import` → ADMIN only
- `/tasks/*` → authenticated user

### Page-Level Authorization
`app/tasks/[id]/page.tsx` checks:
- not logged in → redirect to `/`
- task missing → render “Task not found”
- non-admin and country mismatch → render “Access denied”

## Data Layer
Prisma models live in `prisma/schema.prisma`.  
Prisma client is in `lib/prisma.ts`.

### Task API Endpoints
Under `app/api/tasks`:
- `GET /api/tasks`
  - Admin: all tasks
  - Stakeholder: assigned tasks only
- `GET /api/tasks/[id]`
  - Admin: any
  - Stakeholder: only tasks in their country and assigned
- `POST /api/tasks/[id]/status`
  - Update task status
- `POST /api/tasks/[id]/comments`
  - Add a comment

The API maps database tasks into UI-friendly shapes in `app/api/tasks/_mappers.ts`.

## Styling
The UI is Tailwind-based:
- Tailwind CDN injected in `app/layout.tsx`
- Global styles in `app/globals.css` (fonts + scrollbars)
- Brand colors defined in Tailwind config snippet (see layout script)

## Local Development
1. Install deps: `npm install`
2. Set `DATABASE_URL`
3. Run migrations: `npm run prisma:migrate -- --name init`
4. Seed: `npm run prisma:seed`
5. Run: `npm run dev`

## Common Editing Patterns
- UI changes: `views/` and `components/`
- Auth changes: `lib/auth.ts` and `app/api/auth/[...nextauth]/route.ts`
- Data/API changes: `app/api/tasks/*` and `app/api/tasks/_mappers.ts`
- Routing changes: `app/*/page.tsx` + `AppRouteShell.tsx`
