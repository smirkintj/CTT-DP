# SIT Portal — archived

The QA-facing SIT portal backend was removed from the codebase on 2026-09-17.
It is **on the roadmap but not near-term**, so this file records what existed
and how to bring it back, rather than leaving ~1,300 lines of unreachable code
in the tree.

**Nothing was lost.** The database models and every migration remain in place,
and the deleted code is in git history.

## Why it was removed

The portal was built backend-first. Its three QA pages (`/qa/dashboard`,
`/qa/jira-queue`, `/qa/sit-tasks/[id]`) were only ever stubs wired to
`AppRouteShell`, which the RSC migration reduced to `return null` — so they
rendered blank in production. Those stubs were deleted earlier, leaving the
entire REST surface with **zero callers** anywhere in the codebase.

## Restoring it

Everything is recoverable from the commit before the removal:

```bash
# The last commit where the routes still existed
git log --oneline -- app/api/sit-tasks

# Restore the whole surface
git checkout 6bafc4a -- app/api/sit-tasks app/api/admin/sit-tasks \
  app/api/jira/sit-queue lib/sitSignoffReport.ts lib/sitHistory.ts
```

Before trusting restored code, re-check it against the current schema and
against `lib/apiError.ts` / `lib/adminAccess.ts`, which have moved on since.

## What was removed

### Routes (~1,156 lines)

| Route | Methods |
|---|---|
| `/api/sit-tasks` | GET, POST |
| `/api/sit-tasks/[id]` | GET, PUT |
| `/api/sit-tasks/[id]/history` | GET, POST |
| `/api/sit-tasks/[id]/signoff` | POST |
| `/api/sit-tasks/[id]/signoff-report` | GET |
| `/api/sit-tasks/[id]/test-cases` | POST |
| `/api/sit-tasks/[id]/test-cases/[tcId]` | PUT, DELETE |
| `/api/sit-tasks/[id]/test-cases/[tcId]/defects` | GET, POST |
| `/api/sit-tasks/[id]/test-cases/[tcId]/defects/[defectId]` | DELETE |
| `/api/sit-tasks/[id]/test-cases/[tcId]/evidence` | POST |
| `/api/sit-tasks/[id]/test-cases/[tcId]/evidence/[evidenceId]` | DELETE |
| `/api/admin/sit-tasks` | GET |
| `/api/admin/sit-tasks/[id]/acknowledge` | POST |
| `/api/jira/sit-queue` | GET |

### Libraries (~172 lines)

- `lib/sitSignoffReport.ts` — built the SIT sign-off report payload
- `lib/sitHistory.ts` — `createSitHistory()`, the audit trail for SIT actions

## What was kept

Retained because it is live, or because it is the data model the portal would
be rebuilt on.

**Database — untouched.** Models `SitTask`, `SitTaskCountry`, `SitTestCase`,
`SitTestCaseCountryResult`, `SitEvidence`, `SitDefect`, `SitTaskHistory`, and
the `SitHistoryAction` enum all remain in `prisma/schema.prisma`, with their
migrations. Per project convention migrations are never deleted, and keeping
the models means a future portal starts from a working schema.

**Still live and in use:**

- `lib/sitDetection.ts` — `isSitCompleteComment()` / `extractAdfText()`, used by
  `/api/admin/jira-intake` to spot SIT-complete comments in Jira
- `/api/admin/sit-acknowledge` — used by the JIRA Queue screen; it stamps
  `sitSignedOffAt` on UAT tasks and touches only `Task`, not the SIT models
- The whole SIT → UAT intake pipeline, which is a different feature:
  `lib/sitIntake.ts`, `lib/sitWorkbook.ts`, `lib/sitWorkbookServer.ts`,
  `lib/draftTask.ts`, `/api/cron/sit-intake`, `/api/admin/sit-intake/run`,
  `/api/admin/draft-tasks`, `/api/import/draft-tasks`

## If you rebuild it

Two lessons from the first attempt are worth carrying forward:

1. **Build a screen alongside each route.** The backend was complete and
   correct and still delivered nothing for months, because no page ever
   consumed it, and nothing in CI noticed.
2. **Cover it with e2e.** `e2e/smoke.spec.ts` asserts that every page renders
   real content with no API error — the check that would have caught blank QA
   pages the day they shipped. Add QA routes to that list as they are built.
