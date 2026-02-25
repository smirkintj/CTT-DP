# UAT Portal Testing Checklist (Pre-Go-Live)

Last updated: 2026-02-24  
Purpose: Release readiness checklist before enabling production usage for admins and stakeholders.

How to use:
- Mark each item: `PASS`, `FAIL`, or `N/A`.
- Capture evidence (screenshot/video) for any `FAIL`.
- Block go-live until all P0 and P1 checks pass.

---

## 0) Test Metadata
- Release/Commit:
- Environment URL:
- Tester name:
- Date/time:
- Browser(s):
- Device(s):

---

## 1) P0 Smoke Tests (Must Pass)

## 1.1 App Boot and Navigation
- [ ] `PASS/FAIL` Login page loads without console runtime errors.
- [ ] `PASS/FAIL` Admin can log in and reach `/admin/dashboard`.
- [ ] `PASS/FAIL` Stakeholder can log in and reach `/`.
- [ ] `PASS/FAIL` Core routes resolve: `/`, `/admin/dashboard`, `/admin/tasks`, `/tasks/[id]`, `/inbox`.

## 1.2 Session and Authorization
- [ ] `PASS/FAIL` Unauthenticated user cannot access `/admin/*`.
- [ ] `PASS/FAIL` Stakeholder blocked from admin pages.
- [ ] `PASS/FAIL` Stakeholder can open own-country assigned task only.
- [ ] `PASS/FAIL` Admin can open all tasks.

## 1.3 Core Data Persistence
- [ ] `PASS/FAIL` Admin creates task -> persists after refresh.
- [ ] `PASS/FAIL` Admin edits task fields -> persists after refresh.
- [ ] `PASS/FAIL` Stakeholder adds comment -> appears immediately and after refresh.
- [ ] `PASS/FAIL` Step pass/fail updates persist and remain consistent after refresh.
- [ ] `PASS/FAIL` Sign-off persists and locks the task.

---

## 2) Authentication and Login UX
- [ ] `PASS/FAIL` Invalid credentials show friendly error.
- [ ] `PASS/FAIL` Sign-in CTA stays disabled until valid email + password are entered.
- [ ] `PASS/FAIL` Password eye icon toggles visibility inside password input correctly.
- [ ] `PASS/FAIL` Login shows in-progress state (`Signing in...`) while request is running.
- [ ] `PASS/FAIL` Remember-email option retains email after reload.
- [ ] `PASS/FAIL` Password autofill works with browser password manager.
- [ ] `PASS/FAIL` After 3 failed login attempts, account/email is temporarily locked and shows countdown.
- [ ] `PASS/FAIL` Logout clears session and returns to login screen.

---

## 3) Admin Functional Testing

## 3.1 Task Creation
- [ ] `PASS/FAIL` Multi-country create generates one task per country.
- [ ] `PASS/FAIL` Jira ticket accepts numeric or `EO-xxxx` and stores correctly.
- [ ] `PASS/FAIL` CR no and developer fields persist.
- [ ] `PASS/FAIL` Due date saves as date and displays date-only.
- [ ] `PASS/FAIL` Country assignee dropdown appears and allows explicit selection.
- [ ] `PASS/FAIL` Chosen assignee is reflected on created task.
- [ ] `PASS/FAIL` Closing task-create modal with unsaved input shows discard confirmation.
- [ ] `PASS/FAIL` Browser refresh/close warns when task-create modal has unsaved input.
- [ ] `PASS/FAIL` Create button shows save progress (`Creating...`) and completion feedback.

## 3.2 Task Management Table
- [ ] `PASS/FAIL` Search returns correct tasks.
- [ ] `PASS/FAIL` Status/priority/country/signed-off filters work.
- [ ] `PASS/FAIL` Sorting works (due date, priority, status, created, updated).
- [ ] `PASS/FAIL` Clicking task row opens task detail.

## 3.3 Task Detail (Admin)
- [ ] `PASS/FAIL` Inline edits for title/description/module/priority/developer/due date/jira/cr no work.
- [ ] `PASS/FAIL` Save changes shows `Saving...` then success state and data refreshes.
- [ ] `PASS/FAIL` Unsaved changes warning appears on back navigation.
- [ ] `PASS/FAIL` Browser refresh/close warns when unsaved changes exist.
- [ ] `PASS/FAIL` Jira icon opens correct link format.
- [ ] `PASS/FAIL` Admin can add/edit/delete steps on unlocked tasks.
- [ ] `PASS/FAIL` Signed-off task shows lock message and blocks edit APIs.
- [ ] `PASS/FAIL` Delete task works and task is removed from list.

## 3.4 Admin Dashboard
- [ ] `PASS/FAIL` KPI cards display values from live DB data.
- [ ] `PASS/FAIL` Open task count includes required statuses (per current rule).
- [ ] `PASS/FAIL` Unread comments KPI updates after comments/read actions.
- [ ] `PASS/FAIL` Due dates displayed in date-only format.

## 3.5 Admin Database (Notifications)
- [ ] `PASS/FAIL` Reminder settings save button shows saving/saved state and persists values.
- [ ] `PASS/FAIL` Teams config save button shows saving/saved state per country.
- [ ] `PASS/FAIL` Switching away from Notifications tab with unsaved edits prompts for confirmation.
- [ ] `PASS/FAIL` Browser refresh/close warns when notification settings are unsaved.

---

## 4) Stakeholder Functional Testing

## 4.1 Stakeholder Dashboard
- [ ] `PASS/FAIL` Only assigned country tasks are visible.
- [ ] `PASS/FAIL` Search and status filter tabs behave correctly.
- [ ] `PASS/FAIL` Task cards show due date and status badge correctly.
- [ ] `PASS/FAIL` Progress/Open/Unread KPI values are correct.

## 4.2 Task Execution
- [ ] `PASS/FAIL` Stakeholder can add actual result, pass/fail step, attach image, add comments.
- [ ] `PASS/FAIL` Comments display local formatted timestamps (not raw ISO).
- [ ] `PASS/FAIL` Step comments are shown on the exact step where they were posted.
- [ ] `PASS/FAIL` Mention input accepts `@Name` format.
- [ ] `PASS/FAIL` Sign-off only enabled when all steps completed.
- [ ] `PASS/FAIL` Signed-off task is read-only for stakeholder.

## 4.3 Inbox and Notifications
- [ ] `PASS/FAIL` Inbox loads and unread indicators match dashboard count.
- [ ] `PASS/FAIL` Opening relevant task from inbox works.
- [ ] `PASS/FAIL` Mark-all-read updates UI counters.

---

## 5) Email and Notification Checks
- [ ] `PASS/FAIL` Admin “Send Test Notification” succeeds.
- [ ] `PASS/FAIL` Assignment email sends on task assignment.
- [ ] `PASS/FAIL` Reminder endpoint sends email.
- [ ] `PASS/FAIL` Sign-off email sends with expected recipients.
- [ ] `PASS/FAIL` Email failures show user-safe message; no UI crash.

## 5.1 Microsoft Teams Notification Checks
- [ ] `PASS/FAIL` Admin can save Teams webhook config per country.
- [ ] `PASS/FAIL` Task assignment posts message to the correct country channel.
- [ ] `PASS/FAIL` Reminder action posts message to the correct country channel.
- [ ] `PASS/FAIL` Sign-off action posts message to the correct country channel.
- [ ] `PASS/FAIL` Failed-step/status event posts message to the correct country channel.
- [ ] `PASS/FAIL` Invalid webhook does not block task API flow (only logs/soft fail).

---

## 6) Data Integrity and Security
- [ ] `PASS/FAIL` No unauthorized data visible via direct API calls.
- [ ] `PASS/FAIL` API returns 401/403/404 correctly.
- [ ] `PASS/FAIL` Invalid status transitions are blocked with `409 Conflict`.
- [ ] `PASS/FAIL` Concurrent stale writes are blocked with `409 Conflict` (task metadata/status/steps/comments/signoff).
- [ ] `PASS/FAIL` Legacy step comments are backfilled (`npm run comments:backfill-step-order`) and still appear under the correct step.
- [ ] `PASS/FAIL` No task mutation allowed after sign-off lock.
- [ ] `PASS/FAIL` Signed-off lock blocks: status change, step mutation, comment creation.
- [ ] `PASS/FAIL` Activity entries are recorded for key actions.
- [ ] `PASS/FAIL` TaskHistory entries are recorded for create/update/status/steps/comments/sign-off actions.
- [ ] `PASS/FAIL` Admin sees Task History timeline in task detail with newest entries first.
- [ ] `PASS/FAIL` Stakeholder cannot access unauthorized task history via direct API call.
- [ ] `PASS/FAIL` DB entries match UI after CRUD operations.

---

## 7) Reliability and Error Handling
- [ ] `PASS/FAIL` Simulated API failure surfaces toast error (no white screen).
- [ ] `PASS/FAIL` Failed comment create does not crash task page.
- [ ] `PASS/FAIL` Failed metadata save preserves input and shows error toast.
- [ ] `PASS/FAIL` Dev reset script recovers from local chunk issues (`npm run reset:dev`).
- [ ] `PASS/FAIL` Key task APIs return standardized error shape (`error`, `code`, optional `detail` in dev).

---

## 8) Performance and Compatibility
- [ ] `PASS/FAIL` Initial page load acceptable on desktop and mobile.
- [ ] `PASS/FAIL` Task list interactions stay responsive with high task volume.
- [ ] `PASS/FAIL` Works on Chrome/Edge/Safari (latest stable).
- [ ] `PASS/FAIL` No major layout breakpoints on mobile widths.

---

## 9) Production Readiness Gate
- [ ] `PASS/FAIL` Latest deployment matches expected commit hash.
- [ ] `PASS/FAIL` All required env vars present in production.
- [ ] `PASS/FAIL` Prisma migrations applied in production DB.
- [ ] `PASS/FAIL` Seed data strategy reviewed (no unwanted test data in prod).
- [ ] `PASS/FAIL` Rollback plan confirmed.

Go-live decision:
- [ ] `APPROVED`
- [ ] `BLOCKED` (reason):

---

## 10) Defect Log (during test cycle)
- Defect ID:
- Severity:
- Steps to reproduce:
- Expected result:
- Actual result:
- Owner:
- Status:
