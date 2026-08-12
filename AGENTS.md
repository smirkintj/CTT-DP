# Hermes Agent Integration — Drafting CTT UAT

Last updated: 2026-08-12

> File name note: this doc was originally `HERMES_AGENT.md`. Renamed to
> `AGENTS.md` because Hermes only auto-loads `.hermes.md`, `AGENTS.md`,
> `CLAUDE.md`, or `.cursorrules` — the old name was never picked up.

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
- `prisma/seed.ts` — baseline `Product` / `Module` / `TargetSystem` values (see
  "Verified reference data" below)
- The feature spec, PR diff, or Jira ticket for the change being tested — see
  "Jira access" below
- `ISO27001_UAT_CHECKLIST.md`, `UAT_PROD_READINESS.md` for compliance-flavored asks

## Domain model Hermes must respect
A UAT test case in CTT is a `Task` (metadata) containing ordered `TaskStep`s.

**Task-level fields** (set once per drafted test case):
- `title`, `description`
- `product` — identify by `Product.name` (e.g. `EasyOrder`) or `Product.slug`
  (e.g. `easyorder`). **There is no `EO`/`SH`/`SP` code field on `Product` in
  `prisma/schema.prisma`** — those letters are informal shorthand used only in
  `CLAUDE.md`'s "Products in System" list, not a real identifier. Do not draft
  a `product` value as `EO`/`SH`/`SP`; use the verified `name`/`slug` values below.
- `module` — a plain string on `Task.module` (not a foreign key), must match
  one of the module names valid for the chosen product
- `targetSystem` — resolved server-side to `TargetSystem.id`; draft it by
  `TargetSystem.name`, must be valid for the chosen product
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

## Verified reference data (from `prisma/seed.ts`)
These are the baseline seed values checked into the repo — verified by
reading `prisma/seed.ts` directly, not inferred. Admins can add more
products/modules/target systems at runtime through Admin → Database, so this
list can be a **stale floor, not a live ceiling**: treat it as the minimum
guaranteed-valid set, and have a human confirm current values against
`/api/admin/task-config` before drafting against a product/module/target
system not listed here.

| Product (`name` / `slug`) | Modules | Target Systems |
|---|---|---|
| EasyOrder / `easyorder` | Ordering, Pricing, Invoicing | Ordering Portal, Admin Portal |
| SalesHub / `saleshub` | Campaigns, Leads, Reporting | Sales Portal, Sales Admin |
| ServicePro / `servicepro` | Cases, Scheduling, Analytics | Service Workspace, Backoffice Console |

Countries seeded: `MY`, `SG`, `TH`, `VN`, `HK`, `TW`.

Never guess a product/module/target-system/country value outside this table
(or a human-confirmed current value from `/api/admin/task-config`) — an
invalid foreign key fails task creation/import.

## Output contract — CSV matching the Import Wizard
**Verified against code** (`views/ImportWizard.tsx` client parser and
`app/api/tasks/[id]/steps/import/route.ts` server handler as of this
revision — the doc previously asserted this contract without checking the
implementation; it now matches):

- The Import Wizard's CSV parser is a generic column-mapper: it accepts any
  CSV header names, and an admin manually maps columns to
  `description` / `expectedResult` / `actualResult` / `testData` in the UI —
  it does not auto-detect columns by name.
- The server (`POST /api/tasks/[id]/steps/import` and `POST /api/tasks` for
  new-task import) accepts exactly the JSON fields `description`,
  `expectedResult`, `testData`, `actualResult`. `description` and
  `expectedResult` are required per step; a step missing either is rejected
  (`STEP_INVALID`).
- **Both import paths are ADMIN-only** (`session.user.role !== 'ADMIN'` is
  rejected server-side). Hermes drafts are always subject to a human admin's
  review and manual import — there is no path for Hermes output to reach the
  app without that step.

No correction to the column names was needed — using
`description,expectedResult,testData,actualResult` as CSV headers remains
correct practice because it makes the manual column-mapping step trivial for
the reviewing admin, even though the wizard doesn't require those exact names.

```csv
description,expectedResult,testData,actualResult
"Log in as stakeholder uat-my@dksh.com","User lands on Stakeholder Dashboard","email: uat-my@dksh.com",
"Open assigned task and mark step 1 as Passed","Step status updates to PASSED and activity feed logs the change","",
```

Leave `actualResult` empty — it's filled in during execution, not drafting.

Put task-level metadata (title, product, module, target system, country,
Jira ticket) in the `.meta.md` sidecar (see "Drafting workflow" below) — the
Import Wizard's CSV import only carries step rows; task metadata is entered
in the UI (or via a new-task create flow) when the CSV is imported.

## Drafting workflow
1. **Input**: a QA test-scenario `.xlsx` attached to a Jira ticket.
2. **Output**: two files per drafted test case —
   - `drafts/uat/<product>-<slug>.csv` — step rows only, per the CSV contract above
   - `drafts/uat/<product>-<slug>.meta.md` — task-level fields (title,
     product, module, target system, country, Jira ticket, CR number)
3. `actualResult` is always left empty in the CSV — never pre-filled, even if
   the source sheet has expected/sample output data in that shape.
4. **Never invent a test scenario that isn't in the source `.xlsx`.** Every
   drafted step must trace back to a row or scenario in the attached sheet.
5. **Flag, don't drop:** if a ticket's acceptance criteria include something
   with no matching test scenario in the attached sheet, do not silently
   omit it. List it explicitly in the `.meta.md` sidecar under an "Unmatched
   acceptance criteria" heading so a human decides whether to add a scenario
   or accept the gap.

## Jira access
Hermes now has **read access to Jira via the Atlassian API** and can fetch
tickets and their attachments (including the source `.xlsx`) itself — the
earlier assumption in this doc that tickets are supplied manually per
request no longer holds.
- Credentials come from environment variables only.
- Credentials must never be interpolated into shell commands (avoids
  shell history/process-list exposure) and must never be printed/logged,
  including in draft output or error messages.
- Read-only: fetching tickets/attachments does not grant write access to
  Jira, and this doc grants no additional CTT access — the guardrails below
  (no CTT DB/API/credential access) are unchanged.

## Where drafts live
Write Hermes output under `drafts/uat/` (gitignored — the folder exists in
the repo via a tracked `drafts/uat/.gitkeep`, but everything else under it is
ignored; generated drafts must never be committed):
```
drafts/uat/<product>-<short-feature-slug>.csv
drafts/uat/<product>-<short-feature-slug>.meta.md   # task-level fields
```

## Guardrails
- Hermes has **no** credentials, API access, or DB access to CTT itself. It
  reads static docs/specs plus Jira (per "Jira access" above) and writes
  local draft files only.
- Never invent product/module/target-system/country values — use the
  verified table above, or a human-confirmed current value from
  `/api/admin/task-config`.
- A human admin always reviews drafts in the Import Wizard preview step
  before confirming import — Hermes output is a proposal, not a commit, and
  the import endpoints enforce ADMIN-only access server-side regardless.
- Do not draft steps involving admin-only or destructive flows (user
  management, product/database admin, bulk delete) unless the request
  explicitly scopes to testing those admin flows.
- Staging credentials for the CTT app are in 1Password (CTT vault) — Hermes
  must never be given these; drafts reference account *roles*, not real
  passwords. (This is separate from the Jira API credentials above, which
  Hermes does hold via environment variables.)

## Related docs
- `PROJECT_OVERVIEW.md`
- `TESTER_UAT_PACK.md`
- `ISO27001_UAT_CHECKLIST.md`
- `UAT_PROD_READINESS.md`
