# Admin Audit Coverage Checklist

Last updated: 2026-02-26

Purpose:
- Track which admin-capable write endpoints emit immutable/admin audit events.
- Prevent silent operational changes that are hard to trace.

Legend:
- `Covered`: emits admin audit event.
- `Needs Coverage`: no explicit admin audit event yet.

## Admin Endpoints

| Endpoint | Method | Coverage | Notes |
|---|---|---|---|
| `/api/admin/countries` | `POST` | Covered | Country save event logged. |
| `/api/admin/countries` | `DELETE` | Covered | Country delete event logged. |
| `/api/admin/modules` | `POST` | Covered | Module save event logged. |
| `/api/admin/modules` | `DELETE` | Covered | Module delete event logged. |
| `/api/admin/teams-webhooks` | `POST` | Covered | Teams config changes logged with metadata. |
| `/api/admin/users` | `POST` | Covered | User creation logged with actor + target user id. |
| `/api/admin/users/[id]` | `PATCH` | Covered | User update logged with changed fields metadata. |
| `/api/admin/users/[id]/reset-password` | `POST` | Covered | Password reset action logged with email-sent flag. |
| `/api/admin/test-notification` | `POST` | Covered | Success/failure of test email trigger logged. |

## Admin Task Actions

| Endpoint | Method | Coverage | Notes |
|---|---|---|---|
| `/api/tasks` | `POST` | Covered | Task history (`TASK_CREATED`) + activity entry. |
| `/api/tasks/[id]` | `PATCH` | Covered | Task history (`TASK_UPDATED`) + activity entry. |
| `/api/tasks/[id]` | `DELETE` | Covered | Task history (`TASK_DELETED`). |
| `/api/tasks/[id]/status` | `POST` | Covered | Task history (`STATUS_CHANGED`) + activity/Teams hooks. |
| `/api/tasks/[id]/steps` | `POST` | Covered | Task history (`STEP_CREATED`). |
| `/api/tasks/[id]/steps/[stepId]` | `PATCH` | Covered | Task history (`STEP_UPDATED`). |
| `/api/tasks/[id]/steps/[stepId]` | `DELETE` | Covered | Task history (`STEP_DELETED`). |
| `/api/tasks/[id]/steps/import` | `POST` | Covered | Task history + explicit admin audit event for import success/failure. |
| `/api/tasks/[id]/comments` | `POST` | Covered | Task history (`COMMENT_ADDED`) + activity entry. |
| `/api/tasks/[id]/signoff` | `POST` | Covered | Task history (`SIGNED_OFF`) + activity/email/Teams hooks. |
| `/api/tasks/[id]/notify-assigned` | `POST` | Covered | Manual assignment email trigger audit added. |
| `/api/tasks/[id]/reminder` | `POST` | Covered | Manual reminder email trigger audit added. |

## Remaining Work (Next)

- Keep extending `scripts/check-admin-audit-coverage.mjs` route list whenever a new admin-capable write endpoint is added outside `/api/admin/**`.
- Add explicit audit entries for non-task admin reads only if required by policy (currently not needed).
