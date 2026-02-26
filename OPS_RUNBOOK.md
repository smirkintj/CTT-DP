# Ops Runbook (CTT UAT Portal)

Last updated: 2026-02-26

Purpose:
- Fast triage guide for common production issues.
- Admin-friendly actions with exact commands and expected outcomes.

## 1) Health First

Run:
```bash
curl -sS https://<your-domain>/api/health
```

Interpretation:
- `status: ok` -> app + DB baseline healthy.
- `status: degraded` -> check `checks.*` fields to isolate issue.

---

## 2) Common Incidents

## 2.1 `{"error":"Unauthorized"}` on API calls
Likely causes:
- session expired
- `NEXTAUTH_URL` mismatch
- browser/cookie issue

Actions:
1. Logout/login again.
2. Verify `NEXTAUTH_URL` in deployment env.
3. Check middleware-protected route behavior.

## 2.2 `/api/tasks` returns 500
Likely causes:
- migration mismatch
- DB connectivity issue
- relation hydration edge case

Actions:
1. Check `/api/health` DB status.
2. Run migration status:
```bash
npx prisma migrate status
```
3. Apply pending migrations:
```bash
npx prisma migrate deploy
```

## 2.3 `TASK_STALE` / conflict on save
Cause:
- optimistic concurrency working as designed.

Actions:
1. Refresh task detail.
2. Re-apply change.
3. If frequent, check if multiple admins are editing same task simultaneously.

## 2.4 Email send failures
Likely causes:
- Resend credentials/domain policy
- invalid recipient

Actions:
1. Verify `RESEND_API_KEY` and `EMAIL_FROM`.
2. Test endpoint:
```bash
curl -X POST https://<your-domain>/api/admin/test-notification
```
3. Check Resend dashboard logs.

## 2.5 Teams webhook notifications missing
Likely causes:
- invalid/deactivated webhook config per country

Actions:
1. Verify Teams config in Admin Database.
2. Trigger assignment/reminder manually.
3. Confirm non-blocking behavior (task operations should still succeed).

---

## 3) Dev/Local Recovery

If chunk/module errors appear:
```bash
npm run reset:dev
npm run dev
```

---

## 4) Escalation

Escalate when:
- health endpoint remains degraded > 15 minutes
- login fails for all users
- task create/update broken in production

Escalation payload should include:
- environment URL
- timestamp and timezone
- commit SHA
- failing endpoint + response code
- screenshot/log snippet
