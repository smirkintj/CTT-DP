# CTT — Claude Code Context

## Project
Change Tracking Tool (CTT) for DKSH. Tracks UAT and SIT testing across products and markets before production deployments.

**Stack:** Next.js 15 (App Router), React 19, TypeScript ~5.8, Prisma 6, PostgreSQL (Neon), Tailwind 3, Vercel  
**Version:** `1.4.2` (semver in `package.json`)

## Conventions

### Commits
Conventional Commits with scope:
- `feat(sit): add sign-off route`
- `fix(api): correct product access guard`
- `perf(dashboard): reduce task list query`
- `docs: update README for SIT flow`

### Branches
- `feat/<name>` or `codex/<name>` — always branch off main, never work directly on main

### TypeScript
- `strict: false`, `ES2022` target
- Use `@/*` for all root-relative imports (e.g. `@/lib/prisma`, `@/components/Button`)

### Database
- **Never delete or squash migrations**
- `prisma migrate dev` for local development
- `prisma migrate deploy` for staging/production
- **Never run `prisma migrate reset` on staging** — it wipes all data

### UI / Frontend
- Pure Tailwind only — no component libraries
- Lucide icons only
- Apple-like minimal aesthetic — clean, simple, no clutter
- `slate-900` as primary dark colour

### Docs
After any non-trivial feature or flow change, update both:
- `README.md`
- `PROJECT_OVERVIEW.md`

…in the same commit as the feature.

## Key Scripts
```bash
npm run dev              # local dev server
npm run build            # prisma generate + next build
npm run lint             # ESLint via next lint
npm run perf:sample      # run perf baseline (scripts/perf-baseline.sh)
npm run db:purge-and-seed   # wipe + reseed local DB
```

## Performance
- `@vercel/speed-insights` is installed and active
- Baseline script: `scripts/perf-baseline.sh`
- Branch convention for perf work: `perf/<name>`

## Roles & Access Model
- `ADMIN` — full access, manages products/tasks/users
- `STAKEHOLDER` — scoped to assigned tasks per country
- `QA` — scoped to assigned products, runs SIT testing

## Products in System
- EasyOrder (`EO`) — primary pilot product
- SalesHub (`SH`)
- ServicePro (`SP`)

## Staging Credentials
- Admin: `putra.mahirudin@dksh.com` / `Admin123@`
- Stakeholder pilot (MY): `uat-my@dksh.com` / `User123@`
- QA pilot: `qa-eo@dksh.com` / `User123@`
