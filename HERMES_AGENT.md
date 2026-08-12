# Hermes Agent Integration — Drafting CTT UAT

Last updated: 2026-08-12

## Purpose
Let an external AI agent ("Hermes") read this repository and draft UAT test
case content for CTT, without giving it database, API, or production access.
Hermes produces a **draft artifact**; a human reviews it and imports it
through the existing Import Wizard (`/import`). Hermes never writes directly
to the app or database.

## What Hermes needs to read
Point Hermes at these, in order of usefulness for drafting UAT steps:
- `PROJECT_OVERVIEW.md` — architecture, route map, API surface, workflow rules
- `TESTER_UAT_PACK.md` — how testers execute UAT, defect/signoff templates
- `prisma/schema.prisma` — `Task` / `TaskStep` field definitions (source of truth)
- The feature spec, PR diff, or Jira ticket for the change being tested (supplied per request — Hermes has no Jira/DB access of its own)
- `ISO27001_UAT_CHECKLIST.md`, `UAT_PROD_READINESS.md` for compliance-flavored asks

## Domain model Hermes must respect
A UAT test case in CTT is a `Task` (metadata) containing ordered `TaskStep`s.

**Task-level fields** (set once per drafted test case):
- `title`, `description`
- `product` — one of `EO` (EasyOrder), `SH` (SalesHub), `SP` (ServicePro)
- `module` — must be valid for the chosen product
- `targetSystem` — must be valid for the chosen product
- `countryCode` — market the task applies to
- `jiraTicket`, `crNumber` — optional traceability fields
- `dueDate`, `developer` — optional

**Step-level fields** (one row per test step):
- `description` — the action to perform (required)
- `expectedResult` — required
- `testData` — optional, supports multiline
- `actualResult` — optional, left blank for testers to fill during execution

Do not draft `stepResult`, `conditionalReason`, `signedOffAt`, or any audit
field — those are set by testers/admins during execution, not at drafting time.

## Output contract — CSV matching the Import Wizard
Draft steps as CSV with a header row using these exact column names so a
human can upload the file directly at `/import` and map columns 1:1:

```csv
description,expectedResult,testData,actualResult
"Log in as stakeholder uat-my@dksh.com","User lands on Stakeholder Dashboard","email: uat-my@dksh.com",
"Open assigned task and mark step 1 as Passed","Step status updates to PASSED and activity feed logs the change","",
```

Leave `actualResult` empty — it's filled in during execution, not drafting.

Put task-level metadata (title, product, module, target system, country,
Jira ticket) in a short header comment or an accompanying `.md`/`.json`
sidecar next to the CSV — the Import Wizard's CSV import only carries step
rows; task metadata is entered in the UI (or via a new-task create flow)
when the CSV is imported.

## Where drafts live
Write Hermes output under `drafts/uat/` (gitignored — create the folder
locally, do not commit generated drafts):
```
drafts/uat/<product>-<short-feature-slug>.csv
drafts/uat/<product>-<short-feature-slug>.meta.md   # task-level fields
```

## Guardrails
- Hermes has **no** credentials, API access, or DB access to CTT. It reads
  static docs/specs and writes local draft files only.
- Never invent product/module/target-system values — cross-check against
  `/api/admin/task-config` output (fetched by a human, not Hermes) or the
  `Product`/`Module`/`TargetSystem` seed data in `prisma/`.
- A human always reviews drafts in the Import Wizard preview step before
  confirming import — Hermes output is a proposal, not a commit.
- Do not draft steps involving admin-only or destructive flows (user
  management, product/database admin, bulk delete) unless the request
  explicitly scopes to testing those admin flows.
- Staging credentials are in 1Password (CTT vault) — Hermes must never be
  given these; drafts reference account *roles*, not real passwords.

## Related docs
- `PROJECT_OVERVIEW.md`
- `TESTER_UAT_PACK.md`
- `ISO27001_UAT_CHECKLIST.md`
- `UAT_PROD_READINESS.md`
