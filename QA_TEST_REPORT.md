# CTT — Pre-Release QA Report

**Scope:** Full functional, security, and exploratory QA pass against the CTT (Change Tracking Tool) codebase at the state of branch `claude/qa-testing-validation-trme04`.
**Method:** Static code review, live HTTP/API testing against a locally seeded instance (Postgres 16 + `prisma migrate deploy` + `prisma:seed`), and headless-browser (Playwright/Chromium) exploratory testing.
**Test accounts used:** `admin@dksh.com` (ADMIN), `uat-my@dksh.com` (STAKEHOLDER/MY) — both seeded locally by `prisma/seed.ts`.

---

## 1. Executive Summary

The app is functionally usable for the core admin/stakeholder UAT happy path (login, dashboard, task list, task detail, status transitions, IDOR guarding by country/product) — those areas are solid. However, this pass found **one release-blocking build failure**, **one completely non-functional security control** (login lockout), **one fully bypassable security control** (rate limiting), and a **major functional gap** (the QA role/portal — a documented core feature — cannot be created through the product's own admin tooling). Several admin routes also have inconsistent authorization scoping and secrets can silently fall back to plaintext storage.

None of this looks like deliberate malice — it reads as classic AI-assisted "vibe coding" drift: features (README) racing ahead of enforcement (code), a stub left in place (`lib/loginRateLimit.ts`), and a validation default (`'General'` module) that was never reconciled with an unrelated migration that made module optional.

## 2. Pass / Fail Status

| Area | Status |
|---|---|
| Production build (`npm run build`) | **FAIL** — TypeScript compile error, build cannot ship |
| Login / auth (happy path) | PASS |
| Login lockout / brute-force protection | **FAIL** — non-functional |
| Rate limiting (API) | **FAIL** — trivially bypassable |
| Task CRUD (happy path) | PASS |
| Task status transition rules | PASS (verified via `/api/tasks/[id]/status`) |
| Cross-country / cross-product IDOR guards | PASS |
| Stored XSS (task title/comments) | PASS — React escaping confirmed, no `dangerouslySetInnerHTML` |
| Sign-off PDF report HTML escaping | PASS — all interpolated fields escaped |
| Forced password-change gate | **FAIL** — client-side only, not enforced by API/pages |
| QA role & `/qa` portal reachability | **FAIL** — cannot be created via admin UI/API |
| Admin audit coverage (`npm run audit:check-admin`) | **FAIL** — 2 routes not covered, script currently red |
| Admin product-scoping consistency | **FAIL** — several admin routes skip scope check |
| Secrets-at-rest (Jira token / Teams webhook) | **AT RISK** — silent plaintext fallback |

## 3. Bugs by Severity

### Critical

**C1. Production build is broken (`npm run build` fails).**
- **Category:** Functional / Release-blocking
- **Steps:** `npm run build` on a clean checkout of this branch.
- **Expected:** Build succeeds (this is the exact command used for Vercel deploys per `package.json`/README).
- **Actual:** Fails during type-checking:
  ```
  ./lib/parseExcel.ts:19:28
  Type error: Argument of type 'Buffer<ArrayBufferLike>' is not assignable to parameter of type 'Buffer'.
  ```
  Two more related type errors on the same file/line 26 (`CellHyperlinkValue` → `CellRichTextValue` cast, missing `.text`).
- **Root cause:** `@types/node`'s newer generic `Buffer<T>` no longer structurally matches the `Buffer` type `exceljs`'s `.xlsx.load()` expects; the `ExcelJS.Value` union cast on line 26 assumes every cell value is rich text.
- **Fix:** Cast explicitly (`workbook.xlsx.load(buffer as any)` is a stopgap; better: `Buffer.from(buffer)` normalization) and narrow the `CellValue` union before accessing `.richText`/`.text` in `lib/parseExcel.ts`.
- **Confidence:** Certain — directly reproduced, clean git tree, not caused by anything in this QA pass.

**C2. Login brute-force lockout is completely disabled.**
- **Category:** Security
- **Steps:** POST 10 consecutive wrong-password attempts to `/api/auth/callback/credentials` for the same account.
- **Expected (per README):** "server-side temporary lockout after repeated failed attempts... lockout now lasts 30 seconds and the login error message shows a live countdown."
- **Actual:** All 10 attempts return the identical `CredentialsSignin` error with no lockout, no countdown, no throttling. Root cause (confirmed by code review): `lib/loginRateLimit.ts` is a stub — `LOGIN_LOCK_MS = 0` and every exported function is a no-op returning `0`. `middleware.ts` also explicitly excludes `/api/auth/*` from its general rate limiter.
- **Impact:** The credentials endpoint has **zero** brute-force protection of any kind.
- **Fix:** Implement the lockout logic for real (the README describes exactly what was intended — it just isn't wired up), and/or bring `/api/auth/*` under the general rate limiter.
- **Confidence:** Certain — reproduced live + confirmed in source.

**C3. QA role cannot be created — the entire `/qa` portal is unreachable via the product itself.**
- **Category:** Functional
- **Steps:** As ADMIN, `POST /api/admin/users` with `"role":"QA"`.
- **Expected:** A user with `role: QA` is created (schema has `UserRole.QA`; `middleware.ts` has a dedicated `isQaRoute` branch; `/qa/dashboard`, `/qa/sit-tasks`, `/qa/jira-queue` all exist).
- **Actual:** User is created with `role: "STAKEHOLDER"` regardless of what was requested. `normalizeRole()` in `app/api/admin/users/route.ts` (and the `[id]` PATCH route) only ever produces `ADMIN` or `STAKEHOLDER`. `prisma/seed.ts` also never seeds a QA user. The **only** place a QA-role row is ever created is `scripts/seed-staging.ts`, a raw-Prisma manual script, bypassing the app entirely.
- **Impact:** Nobody can reach the SIT/QA workflow — a documented, apparently-core feature — through any UI an actual admin has access to. This looks like a half-migrated feature.
- **Fix:** Add QA to `normalizeRole()`'s allowed set and to the admin "create user" UI's role picker.
- **Confidence:** Certain — reproduced live + confirmed in source.

### High

**H1. Rate limiter is trivially bypassed via `X-Forwarded-For` spoofing.**
- **Category:** Security
- **Steps:** Exhaust the read limit (120 req/min) for the current session, confirm `429`, then repeat the same request with header `X-Forwarded-For: 55.44.33.22` (or any arbitrary value).
- **Expected:** Still rate-limited (same authenticated user/session).
- **Actual:** Returns `200` immediately — a new header value gets a brand-new bucket. `middleware.ts` keys the limiter purely on `req.headers.get('x-forwarded-for')` with no validation that the value came from a trusted proxy.
- **Impact:** Combined with C2, this means **no meaningful throttling exists anywhere in the app** for a motivated client — not on login, not on writes, not on reads. Any automated attack can simply rotate the header per request.
- **Fix:** Only trust `x-forwarded-for` when the request genuinely came through the deployment's edge/proxy (Vercel sets this reliably at its edge — validate against Vercel's known behavior or use `req.ip`/a platform-provided header that can't be client-set), and additionally key sensitive endpoints (login) by account/email, not just IP.
- **Confidence:** Certain — reproduced live.

**H2. Forced password-change gate is enforced only in the UI, not by the API or pages.**
- **Category:** Security / Functional
- **Steps:** Log in as a user with `mustChangePassword: true` (true for every freshly seeded/reset account). Call `GET /api/tasks` or load `/admin/dashboard` directly.
- **Expected:** Blocked or redirected until the password is changed (this is presented as a security control — "forced permanent-password setup... before portal access").
- **Actual:** Both return `200` with the **full** dataset (confirmed: 136 tasks returned via API; screenshot shows the entire dashboard — KPIs, task cards, sidebar — already rendered in the DOM *behind* the "Set your password" modal overlay). The modal is purely a client-side blocking overlay layered on top of already-fetched, already-rendered data.
- **Impact:** Any user/attacker with a valid session cookie (e.g. a leaked temporary-password session, or simply opening devtools and removing the modal / calling the API directly) gets full portal access without ever setting a permanent password.
- **Fix:** Enforce `mustChangePassword` server-side: middleware or a shared API guard should reject/redirect for any authenticated request while the flag is true (aside from the password-set endpoint itself).
- **Confidence:** Certain — reproduced live via curl and visually confirmed via screenshot.

**H3. Admin product-scoping is inconsistently enforced across admin routes.**
- **Category:** Security (IDOR / authorization)
- **Where:** `app/api/admin/products/route.ts`, `app/api/admin/modules/route.ts`, `app/api/admin/target-systems/route.ts`, `app/api/admin/countries/route.ts`, `app/api/admin/draft-tasks/**`, `app/api/admin/sit-tasks/**`, `app/api/admin/task-config/route.ts`.
- **Expected:** A "scoped" admin (one restricted to specific products via `UserProductAccess`, per README's "Admin scope rule") cannot act on products outside their scope — this rule *is* correctly applied in `app/api/tasks/*` and `app/api/admin/users/*`.
- **Actual:** The routes above only check `role === 'ADMIN'`, never `adminCanAccessProduct()`/`getAdminProductScope()`. A scoped admin (e.g. EasyOrder-only) can `PATCH /api/admin/products` for SalesHub's ID and read/overwrite its Jira config, or mutate modules/target systems for a product they shouldn't touch.
- **Fix:** Apply the same `adminCanAccessProduct` guard already used elsewhere to these routes.
- **Confidence:** Plausible — confirmed via code review of the guard's usage sites vs. absence sites; not independently re-verified live in this pass (recommend a follow-up live IDOR test with two differently-scoped admin accounts).

**H4. Jira API tokens / Teams webhook URLs silently fall back to plaintext if `WEBHOOK_ENCRYPTION_KEY` is unset.**
- **Category:** Security
- **Where:** `lib/encrypt.ts` (`encryptField`) — catches the "key not configured" error and returns the input unchanged, with no warning log or startup assertion.
- **Impact:** If this env var is ever missing in a real deployment (a plausible misconfiguration — it isn't documented in the README's environment variable list), Jira tokens and Teams webhook URLs get written to Postgres in cleartext with zero visible signal that encryption silently didn't happen.
- **Fix:** Fail loudly (throw, don't swallow) if the encryption key is missing when encrypting a genuinely sensitive field, or at minimum log a startup warning and surface it on `/api/health`.
- **Confidence:** Plausible (code-review finding, not independently re-verified live).

**H5. `npm run audit:check-admin` currently fails.**
- **Category:** Regression / Process
- **Steps:** `npm run audit:check-admin`.
- **Actual:** 
  ```
  Admin audit coverage check failed.
  The following admin write route(s) do not call createAdminAudit():
  - app/api/admin/draft-tasks/[id]/route.ts
  - app/api/admin/sit-tasks/[id]/acknowledge/route.ts
  ```
- **Impact:** The tool that's supposed to guarantee every admin write is audited is, right now, red on this branch — meaning either CI isn't actually gating on it, or it's been failing silently. Either way, two admin mutations currently leave no audit trail.
- **Fix:** Add `createAdminAudit()` calls to those two routes (or expand the scanned-file list intentionally and confirm exemption).
- **Confidence:** Certain — reproduced live.

### Medium

**M1. Optimistic concurrency check (`expectedUpdatedAt`) is bypassed by simply omitting the field.**
`lib/taskGuards.ts` → `validateExpectedUpdatedAt` returns "no conflict" whenever `expectedUpdatedAt` is `undefined`/`null`. Any API caller that doesn't send it (e.g. a modified client, or a script) silently skips the "Task was updated by another user" guard on PATCH/status/comments/signoff routes, reintroducing the lost-update race this field exists to prevent.

**M2. In-memory rate limiter doesn't scale — and is undermined further by H1.** `lib/apiRateLimit.ts` keeps its counters in a process-local `Map`. On a horizontally-scaled/serverless deployment (Vercel), each instance has its own bucket, so the effective limit is `configured limit × instance count`, and it resets on every cold start/redeploy. This is a real gap for the documented 30/120 per-minute limits, independent of the X-Forwarded-For bypass in H1.

**M3. SIT task status updates have no transition/enum validation.** `app/api/sit-tasks/[id]/route.ts` writes a client-supplied `status` string directly into `prisma.sitTask.update` with no validation against the `SitTaskStatus` enum and no transition rules — unlike the main `Task` workflow, which correctly validates via `lib/taskGuards.ts`. A QA/product-scoped user can set an arbitrary or invalid status value.

**M4. Admin audit coverage script has a narrow, hardcoded scope.** `scripts/check-admin-audit-coverage.mjs` only scans `app/api/admin/**` plus 3 hardcoded extra files. It misses admin-privileged mutations elsewhere — e.g. `app/api/tasks/route.ts` (admin task creation), `app/api/tasks/[id]/route.ts` (admin PATCH/DELETE), and `app/api/sit-tasks/**` — which use per-task history (`createTaskHistory`) but never the centralized `createAdminAudit`, so admin deletions/reassignments/global group-updates never surface in the Admin Audit Log even though the coverage check currently reports (when green) that everything is covered.

**M5. `Task.module` has no real "no module" path — omitting it defaults to a hardcoded `'General'` that almost never validates.** `app/api/tasks/route.ts`: `const moduleName = body?.module?.toString().trim() || body?.featureModule?.toString().trim() || 'General';` then requires a `Module` row named exactly `'General'` to exist for that product. None of the three seeded products (`EasyOrder`, `SalesHub`, `ServicePro`) has a module called "General". Net effect: any task-creation request that doesn't explicitly pass a module fails with the confusing `TASK_MODULE_INVALID` error, contradicting both the migration name (`make_task_module_optional`) and the apparent intent that module is optional.
- **Reproduced:** `POST /api/tasks` with a valid product/country/date but no `module` → `400 {"error":"Module is invalid for the selected product","code":"TASK_MODULE_INVALID"}`.

**M6. No maximum length validation on `Task.description`.** `title` is capped at 200 chars server-side (verified: a 300-char title is correctly rejected), but `description` has no equivalent cap — a 50,000-character string was accepted and stored (`201 Created`). This is a minor DoS/storage-bloat and UI-rendering risk (unbounded text in task cards/detail pages, PDF export, CSV export).

**M7. Vercel Speed Insights is broken by the app's own CSP.** Every page load throws a console error:
```
Refused to load the script 'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js' because it violates ... "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
```
The CSP in `middleware.ts` doesn't allowlist `va.vercel-scripts.com` in `script-src`/`script-src-elem`, so the "active" Speed Insights feature documented in the README (`@vercel/speed-insights` is installed and active) silently never actually reports data, and pollutes the console on literally every page.

### Low

**L1. `Task.title` has no unique constraint,** so `prisma/seed.ts`'s `task.createMany({ skipDuplicates: true })` for mock tasks is a silent no-op w.r.t. duplicate prevention (confirmed via `psql \d "Task"` — no unique index on `title`). Currently masked by an outer per-stakeholder existence guard, but fragile if that guard is ever changed — a partial reseed could silently create duplicate rows with no error surfaced.

**L2. Cron secret comparison uses `!==` instead of a constant-time comparison** (`app/api/cron/reminders/route.ts` and similarly `app/api/cron/sit-intake/route.ts`). Minor timing-attack surface; trivial to harden with `crypto.timingSafeEqual`.

**L3. `scripts/seed-staging.ts` prints plaintext credentials (and real-looking email addresses) to stdout** at the end of the seed run (`console.log(`Admin: ...@dksh.com / ${ADMIN_PASSWORD}`)` ×8 lines). If this script is ever run in a CI pipeline whose logs are retained/shared, that's a live credential leak. Recommend writing to a local-only file or masking output instead.

---

## 4. High-Risk Areas (prioritized)

1. **Release blocker:** `npm run build` fails — nothing else matters until this is fixed (C1).
2. **Auth/session security:** disabled lockout (C2) + spoofable rate limiter (H1) together mean the login endpoint has no real-world brute-force protection at all.
3. **Access control drift:** the forced-password-change bypass (H2) and inconsistent admin product scoping (H3) both stem from the same pattern — a control implemented in one layer (UI, or one route family) but not enforced everywhere it needs to be.
4. **QA/SIT workflow (C3):** if SIT testing via the QA role is meant to ship, this is currently dead on arrival for real admins.
5. **Secrets handling (H4):** silent plaintext fallback for Jira/Teams credentials is the kind of thing that only gets noticed after a leak.

## 5. Recommended Fixes, In Priority Order

1. Fix the `lib/parseExcel.ts` TypeScript errors so `npm run build` succeeds (C1).
2. Implement real login lockout logic in `lib/loginRateLimit.ts` and wire it into the credentials provider (C2).
3. Stop trusting client-supplied `X-Forwarded-For` blindly for rate-limit keys; validate the source or use a platform-guaranteed client-IP signal (H1).
4. Enforce `mustChangePassword` server-side (middleware or shared guard), not just via a UI modal (H2).
5. Add QA to the admin "create user" role whitelist so the QA portal is actually reachable (C3).
6. Apply `adminCanAccessProduct` consistently across all `app/api/admin/**` routes (H3).
7. Make `encryptField` fail loudly (or health-check-visible) instead of silently returning plaintext when the encryption key is missing (H4).
8. Add `createAdminAudit()` calls to the two currently-uncovered routes and get `npm run audit:check-admin` green again (H5); consider widening its scan scope (M4).
9. Decide whether `expectedUpdatedAt` should be mandatory for mutating endpoints, or explicitly document it as best-effort (M1).
10. Add enum/transition validation to SIT task status updates, mirroring `lib/taskGuards.ts` (M3).
11. Fix the `module` default so task creation without an explicit module actually works, or make module creation mandatory in the UI with clear messaging (M5).
12. Add a reasonable max length to `description` (and any other unbounded free-text fields) (M6).
13. Allowlist `va.vercel-scripts.com` in the CSP `script-src`/`script-src-elem`, or remove Speed Insights if it's not actually wanted (M7).

## 6. Untested Areas (out of scope for this pass — flag for follow-up)

- Import wizard (`/import`) end-to-end file upload flow (CSV/Excel) — not exercised live; note `lib/parseExcel.ts` has active type errors (C1) so this path is currently unbuildable regardless.
- Email delivery (Resend) and Teams webhook delivery — not tested against real endpoints (no real `RESEND_API_KEY`/webhook URL available in this environment).
- Jira intake (`/qa/jira-queue`, product Jira config) — not tested against a real Jira instance.
- In-app AI assistant (`/api/assistant/chat`) — not exercised against a real LLM backend (no Ollama instance available in this environment).
- Image evidence upload/paste + auto-optimization in task detail — requires interactive file/clipboard operations not exercised in this pass.
- Sign-off PDF generation's print/auto-print behavior in a real browser print dialog.
- Multi-tab / concurrent-session behavior beyond the automated concurrency-bypass check in M1.
- Full accessibility audit (screen reader pass, full keyboard-only walkthrough) — only spot-checked.
- Load/performance testing beyond `scripts/perf-baseline.sh`'s existing sampling.

## 7. Technical Debt Observed

- A rate limiter and a login-lockout mechanism both exist in name (files, config, README claims) but only one is real; the other is a stub. Suggests README documentation is being updated ahead of/independently from implementation.
- Authorization checks (`adminCanAccessProduct`) were clearly added at some point and applied to *some* routes but not backfilled across all admin routes — classic incremental-feature-add gap.
- `scripts/seed-staging.ts` and `prisma/seed.ts` have diverged (only the former can create QA users), suggesting the QA role was added to schema/UI/portal but the seeding/admin-creation path was never fully updated to match.
- TypeScript's `strict: false` plus the exceljs type mismatch suggests dependency versions have drifted since `lib/parseExcel.ts` was last touched, and CI (if any) isn't currently catching it — or isn't running `npm run build`/`tsc --noEmit` at all.

## 8. Overall Production Readiness Score: **38 / 100**

The core UAT task-tracking workflow (create → assign → test → sign-off) is well-built and several controls (IDOR guarding, HTML escaping, status-transition validation) are done correctly and hold up under adversarial testing. But a broken production build is an automatic hard floor on this score, and it's compounded by two independent, fully-confirmed authentication/rate-limiting bypasses and a documented core feature (QA portal) that cannot be reached through the product itself. This is not ready to ship; recommend treating items C1–C3 and H1–H2 as blocking, everything else as pre-launch-fix or fast-follow.

---

*Report generated via local QA pass: Postgres 16 (local), seeded via `prisma/seed.ts`, app run via `npm run dev`, tested via direct HTTP (curl/NextAuth credentials flow) and headless Chromium (Playwright).*
