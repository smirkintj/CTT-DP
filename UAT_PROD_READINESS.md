# UAT / Production Readiness Pack

Last updated: 2026-03-19

Purpose:
- Give management, testers, and IT a single rollout reference.
- Separate what is already in place from what still needs confirmation.

## 1) Environment Model

Current target environments:
- Production: `https://ctt-dksh.vercel.app/`
- Staging / UAT: `https://cttstg-dksh.vercel.app/`

Required operating rule:
- Production is for real business users only.
- Staging / UAT is for testers, demos, and pre-release validation only.
- Staging data must not be migrated back into production.

## 2) What Is Already In Place

- Separate Vercel environments exist for `Production`, `Preview`, and `Development`.
- `DATABASE_URL` is configured separately for `Production` versus `Preview/Development`.
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`, and `EMAIL_FROM` are configured in Vercel.
- The app shows a non-production banner outside production.
- Authentication, role checks, audit history, and admin audit coverage are already implemented in the codebase.

## 3) What Must Be Confirmed Before UAT

- [ ] `https://cttstg-dksh.vercel.app/` is deployed and reachable by testers.
- [ ] Staging uses a staging database, not the production database.
- [ ] Staging contains only tester accounts and test data.
- [ ] Email sending behavior in staging is acceptable for testing.
- [ ] UAT test accounts are created and shared securely.
- [ ] A named owner is assigned for UAT issue triage.

## 4) What Must Be Confirmed Before Production Rollout

- [ ] `https://ctt-dksh.vercel.app/` is the approved production URL.
- [ ] Production uses a dedicated production database.
- [ ] Production contains only approved real user accounts.
- [ ] Required migrations have been applied successfully.
- [ ] Rollback owner and rollback steps are documented.
- [ ] Go-live smoke test has been completed successfully.

## 5) Readiness Checklist

### 5.1 Environment Separation
- [ ] Staging and production are using different `DATABASE_URL` values.
- [ ] `NEXTAUTH_URL` matches the correct URL in each environment.
- [ ] Staging and production secrets are not copied into source control.
- [ ] Test data and production data are handled separately.

### 5.2 Access and Identity
- [ ] Admin users are approved and documented.
- [ ] Stakeholder/tester users are scoped by market and role.
- [ ] Disabled users cannot log in.
- [ ] Forced password change works for newly reset users.

### 5.3 Application Safety
- [ ] Health endpoint responds successfully: `/api/health`
- [ ] Task list loads successfully.
- [ ] Task detail loads successfully.
- [ ] Admin updates are recorded in audit history.
- [ ] Completed task restrictions behave correctly.

### 5.4 Operational Readiness
- [ ] Deployment owner is assigned.
- [ ] Support contact for incidents is assigned.
- [ ] Smoke test checklist is completed.
- [ ] Rollback plan is approved.

## 6) Suggested Release Flow

Recommended working model:
- `main` branch -> production deployment
- `staging` branch -> staging / UAT deployment
- feature branches -> internal preview only

Operational rule:
- Only code already approved for testing should be merged to `staging`.
- Only code already signed off in UAT should be merged to `main`.

## 7) UAT Exit Criteria

UAT should only be marked complete when:
- [ ] All critical test cases pass.
- [ ] No open blocker defects remain.
- [ ] Business owner confirms the workflow is acceptable.
- [ ] Security and data-handling expectations are met.
- [ ] Production rollout date and rollback owner are agreed.

## 8) Supporting Documents

- `PRODUCTION_READINESS.md`
- `OPS_RUNBOOK.md`
- `SECURITY_COMPLIANCE_CHECKLIST.md`
- `AZURE_BITBUCKET_MIGRATION_PLAN.md`
- `ISO27001_UAT_CHECKLIST.md`
