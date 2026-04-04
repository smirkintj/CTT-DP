# Security And Compliance Checklist

Last updated: 2026-03-19

Purpose:
- Provide a practical security review list for internal approval.
- Translate technical controls into business-readable checkpoints.

Important note:
- This checklist supports internal readiness review.
- It is not a formal certification statement.

## 1) Identity And Access Management

- [ ] Admin access is restricted to approved admin accounts only.
- [ ] Stakeholder access is restricted to authenticated users only.
- [ ] Unauthorized users cannot reach admin routes.
- [ ] Disabled users cannot log in.
- [ ] Password reset flow forces a new password on next login.
- [ ] Password policy is enforced in the application.
- [ ] Authentication secrets are stored in deployment environment variables, not in source control.

Current code evidence:
- NextAuth-based authentication and JWT session handling in `lib/auth.ts`
- middleware route protection in `middleware.ts`
- forced password change flow in `App.tsx` and `app/api/users/change-password/route.ts`

## 2) Authorization And Segregation

- [ ] Admin-only routes enforce admin authorization server-side.
- [ ] Task access is scoped so users only access allowed data.
- [ ] UI restrictions are backed by server-side enforcement.
- [ ] Cross-country or cross-user access is not granted without explicit authorization.

## 3) Secrets And Configuration

- [ ] `DATABASE_URL` is stored only in environment variables.
- [ ] `NEXTAUTH_SECRET` is stored only in environment variables.
- [ ] `RESEND_API_KEY` is stored only in environment variables.
- [ ] Secrets are not printed in logs, docs, screenshots, or tickets.
- [ ] Staging and production use separate environment values where required.

## 4) Auditability And Change Trace

- [ ] Admin write actions are covered by admin audit checks.
- [ ] Task history is stored immutably for key task changes.
- [ ] User, timestamp, and action context are retained where required.
- [ ] Release commit SHA is captured for each deployment.

Current code evidence:
- admin audit guard via `npm run audit:check-admin`
- task history via `TaskHistory`
- operational release checklist in `PRODUCTION_READINESS.md`

## 5) Data Protection

- [ ] Production data is not copied to staging without business approval.
- [ ] If production-like data is used in staging, it is protected to the same standard.
- [ ] Staging data is used only for testing.
- [ ] Sensitive screenshots, logs, and exports are handled carefully.
- [ ] CSV imports and exports are limited to approved admin users.

## 6) Operational Security

- [ ] Health checks exist and are monitored during rollout.
- [ ] Rollback steps are documented.
- [ ] Incident escalation path is defined.
- [ ] Deployment steps are repeatable without relying on one person only.
- [ ] Backups and database recovery expectations are confirmed with the hosting team.

## 7) Application Security Review

- [ ] Input validation exists on write APIs.
- [ ] Role checks exist on protected endpoints.
- [ ] Concurrency protection exists for task edits.
- [ ] Signed-off tasks are protected from unauthorized mutation.
- [ ] Login abuse protections exist.
- [ ] Password reset and temporary password flows are reviewed.

## 8) Outstanding Confirmation Items

These still need explicit confirmation outside the codebase:
- [ ] Production and staging databases are physically separate.
- [ ] Backup and restore procedures are approved by the infrastructure team.
- [ ] Company retention and logging requirements are documented.
- [ ] Company identity, SSO, or MFA requirements are assessed.
- [ ] Company network, firewall, and IP allowlist requirements are assessed.

## 9) Approval Section

- Security reviewer:
- Infrastructure reviewer:
- Application owner:
- Decision date:
- Approved / blocked:
