# CTT Project Brief — For Claude Sessions

## What This Is
Change Tracking Tool (CTT) for DKSH CSSC. Tracks UAT and SIT testing across digital products and markets before production deployments. Internal tool, vibe-coded, maintained by Putra Mahirudin (putra.mahirudin@dksh.com).

## Stack
Next.js 15 (App Router, RSC), React 19, TypeScript, Prisma 6, PostgreSQL (Neon), Tailwind 3, Vercel. No component libraries. Lucide icons only.

## Products in System
- EasyOrder (EO) — pilot product
- SalesHub (SH)
- ServicePro (SP)
- Connect Client, Connect Customer — DKSH digital products, not yet onboarded

## Markets
SG, MY, TH, VN, HK, TW

## Roles
- ADMIN — DKSH CSSC team (Putra, Leong Keen, Asvin, Fiona)
- STAKEHOLDER — country UAT testers (uat-sg@, uat-my@, uat-tw@ etc.)
- QA — QA team led by Venkka (qa-eo@, qa-sh@)

## Current State (as of May 2026)
- UAT portal: fully built and live in production
- SIT portal: backend complete and deployed, QA-facing UI (3 pages) are blank stubs
- Perf/RSC migration: done, on main
- Jira integration: live

## What's Left to Build
1. SIT frontend — `/qa/dashboard`, `/qa/jira-queue`, `/qa/sit-tasks/[id]`
2. Proper conversation with Venkka on e2e SIT workflow before building UI

## Environments
- Production: main branch → Vercel production → ep-quiet-hill (Neon)
- Staging: staging branch → Vercel preview → ep-falling-wildflower (Neon)

## Staging Credentials
- Admin: putra.mahirudin@dksh.com / Admin123@
- Stakeholder TW: uat-tw@dksh.com / User123@ (Lin Hsiao-Ming)
- Stakeholder MY: uat-my@dksh.com / User123@ (Atiqah Razali)
- QA: qa-eo@dksh.com / User123@ (Nurul Ain)

## Key Files
- `CLAUDE.md` — full dev conventions
- `prisma/schema.prisma` — DB schema
- `app/` — Next.js App Router pages
- `views/` — client components (one per page/role)
- `lib/auth.ts` — NextAuth config
- `scripts/seed-staging.ts` — seed script for staging DB

## Repo
github.com/smirkintj/CTT-DP
