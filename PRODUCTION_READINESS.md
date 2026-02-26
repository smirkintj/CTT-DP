# Production Readiness Pack (CTT UAT Portal)

Last updated: 2026-02-26

Purpose:
- Provide a single pre-deploy and post-deploy checklist for admin-owned releases.
- Reduce deployment mistakes (missing migration/env), and speed up rollback decisions.

## 1) Pre-Deploy Checklist

## 1.1 Code Quality Gate
- [ ] `npm ci`
- [ ] `npm run lint`
- [ ] `npm run audit:check-admin`
- [ ] `npm run build`

## 1.2 Database Readiness
- [ ] Confirm migration files exist and are committed.
- [ ] Confirm latest migration includes required index/schema updates.
- [ ] Confirm no destructive migration is being applied unintentionally.

Command:
```bash
npx prisma migrate status
```

## 1.3 Environment Variables (Vercel + local parity)
- [ ] `DATABASE_URL`
- [ ] `NEXTAUTH_SECRET`
- [ ] `NEXTAUTH_URL`
- [ ] `RESEND_API_KEY`
- [ ] `EMAIL_FROM`

Security rule:
- Never print secrets in logs or screenshots.

## 1.4 Release Metadata
- [ ] Release commit SHA documented.
- [ ] Owner/on-call person identified.
- [ ] Rollback target commit identified.

---

## 2) Deploy Steps

1. Push/merge commit to `main`.
2. Apply production migrations:
```bash
npx prisma migrate deploy
```
3. Trigger/verify Vercel deployment for the same commit SHA.

---

## 3) Post-Deploy Smoke Checks

## 3.1 Runtime Health
```bash
curl -sS https://<your-domain>/api/health
```

Expected:
- `status: "ok"`
- `checks.database: "ok"`
- `checks.authConfig: "ok"`

## 3.2 App Flows
- [ ] Admin login works.
- [ ] Stakeholder login works.
- [ ] `/api/tasks` loads from dashboard.
- [ ] Admin can open task detail and save edits.
- [ ] Stakeholder can execute step/comment/signoff on READY task.

## 3.3 Notification Flows
- [ ] Admin test notification endpoint works.
- [ ] Assignment/reminder/signoff email flow works.
- [ ] Teams webhook posts (if configured).

---

## 4) Rollback Procedure

Use when:
- authentication fails globally
- `/api/tasks` returns repeated 500s
- migration introduced critical regression

Steps:
1. Roll back Vercel to previous healthy deployment.
2. If DB migration is backward-compatible, keep DB state and hotfix forward.
3. If DB migration is not backward-compatible, execute planned DB rollback script (must be pre-approved).
4. Re-run smoke checks from section 3.

---

## 5) Go/No-Go Decision

- [ ] GO: all required checks pass
- [ ] NO-GO: blockers exist (document issue + owner + ETA)
