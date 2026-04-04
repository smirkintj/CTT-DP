# ISO 27001:2013 Aligned UAT Checklist

Last updated: 2026-03-19

Purpose:
- Help the team run UAT in a way that aligns with ISO 27001:2013-style control expectations.
- Focus on evidence, access control, data handling, and change discipline.

Important note:
- This is an alignment checklist for project delivery and testing discipline.
- It is not a formal ISO certification claim.

## 1) Test Environment Control

- [ ] UAT is executed in staging, not production.
- [ ] Only approved testers have access to UAT.
- [ ] UAT accounts are created, tracked, and removable.
- [ ] UAT data is clearly marked as test data.
- [ ] If production-like data is used, it is handled with the same protection standard.

## 2) Access Control

- [ ] Admin and stakeholder roles are tested separately.
- [ ] Unauthorized access to admin routes is blocked.
- [ ] Disabled users cannot log in.
- [ ] Password reset and forced password change are tested.
- [ ] Session timeout / re-login behavior is understood by testers.

## 3) Change Control

- [ ] The build deployed to UAT is identified by branch and commit SHA.
- [ ] UAT changes are deployed in a controlled manner.
- [ ] Defects are logged and tracked.
- [ ] Retests are documented after fixes.
- [ ] Production deployment happens only after UAT approval.

## 4) Data Handling

- [ ] Test exports, screenshots, and PDFs are stored only in approved locations.
- [ ] Sensitive information is not shared in open chat or tickets.
- [ ] Staging data is not copied back into production.
- [ ] User lists and passwords are shared securely.

## 5) Logging, Audit, And Traceability

- [ ] Admin actions tested in UAT are auditable.
- [ ] Key task changes are visible in task history.
- [ ] Test evidence includes who tested, when, and on which environment.
- [ ] Defect records reference the correct environment and timestamp.

## 6) Core UAT Test Scenarios

### 6.1 Authentication
- [ ] Admin can log in.
- [ ] Stakeholder can log in.
- [ ] Invalid password is rejected.
- [ ] Forced password change works correctly.

### 6.2 Task Lifecycle
- [ ] Admin can create a task.
- [ ] Admin can assign a stakeholder in the correct market.
- [ ] Stakeholder can open assigned tasks.
- [ ] Status transitions follow allowed rules.
- [ ] Completed or signed-off tasks cannot be edited incorrectly.

### 6.3 Collaboration And Evidence
- [ ] Comments can be added correctly.
- [ ] Step updates behave correctly.
- [ ] Sign-off flow works correctly.
- [ ] Sign-off report can be generated.

### 6.4 Notifications
- [ ] Email notifications are triggered as expected.
- [ ] Notification preferences are respected.
- [ ] Failures are visible and manageable.

## 7) Exit Criteria

- [ ] No critical defects remain open.
- [ ] Business owner confirms workflow acceptance.
- [ ] Security / data-handling concerns are resolved or accepted.
- [ ] Production deployment decision is recorded.

## 8) Evidence To Retain

- tester name
- date and time
- environment URL
- commit SHA
- executed test cases
- defect IDs
- signoff decision
