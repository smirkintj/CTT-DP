# Tester UAT Pack

Last updated: 2026-03-20

Purpose:
- Give testers a simple, controlled way to run UAT.
- Standardize how issues are reported, retested, and signed off.

## 1) Environment To Use

Use staging only:
- `https://ctt-dksh-git-staging-ptrmhrdn-4569s-projects.vercel.app`

Do not use for UAT:
- `https://ctt-dksh.vercel.app`

Environment rule:
- staging is for testers and test data only
- production is for real users only

## 2) Test Accounts

Default staging accounts created by the reset script:

Admin users:
- `leong.keen@dksh.com`
- `putra.mahirudin@dksh.com`
- `asvin.sraatharan@dksh.com`

Stakeholder users:
- `uat-my@dksh.com`
- `uat-sg@dksh.com`
- `uat-th@dksh.com`
- `uat-vn@dksh.com`
- `uat-hk@dksh.com`
- `uat-tw@dksh.com`

Default passwords after staging reset:
- admin temporary password: `Admin123@`
- stakeholder temporary password: `User123@`

Security rules:
- testers must change their password when prompted
- do not share passwords in open chat groups
- do not reuse production passwords in staging

## 3) What Testers Should Validate

### 3.1 Login And Access
- log in successfully
- complete forced password change when required
- verify role-based access is correct
- confirm unauthorized pages are not accessible

### 3.2 Dashboard And Navigation
- dashboard loads successfully
- inbox loads successfully
- knowledge base loads successfully
- navigation links work correctly

### 3.3 Task Execution
- assigned tasks are visible
- task detail loads correctly
- steps can be updated
- comments can be added
- status changes follow expected workflow
- sign-off works when task is complete

### 3.4 Admin Flows
- admin dashboard loads
- admin can open task management
- admin can create or update task data
- admin can manage users as intended
- import flow works if part of the release scope

### 3.5 Notifications And Reporting
- notification settings load
- email notification flow works if included in test scope
- sign-off report can be opened/generated

## 4) UAT Execution Method

Recommended order:
1. login and password change
2. dashboard and navigation
3. task execution
4. comments and sign-off
5. admin-only functions
6. report defects
7. retest fixes
8. sign off

Execution rule:
- testers should record the exact date, time, environment URL, and account used

## 5) Defect Reporting Template

Use this template for every issue:

- Title:
- Environment: `staging`
- URL:
- Date and time:
- User account used:
- Role used:
- Steps to reproduce:
- Expected result:
- Actual result:
- Severity: `Critical` / `High` / `Medium` / `Low`
- Screenshot or screen recording:
- Task ID or feature area:

Severity guide:
- `Critical`: blocks testing or causes data/security risk
- `High`: core feature broken with no practical workaround
- `Medium`: feature works partially but has meaningful issue
- `Low`: cosmetic or minor usability issue

## 6) UAT Daily Status Format

Use this summary format for each UAT day:

- Date:
- Environment:
- Testers active:
- Areas tested:
- Passed:
- Failed:
- Blocked:
- Critical defects open:
- High defects open:
- Key decisions / notes:

## 7) Signoff Template

Use this when a tester or business owner completes review:

- Name:
- Role:
- Environment used:
- Date:
- Scope tested:
- Issues remaining:
- Decision:
  - `Approved for production`
  - `Approved with minor issues`
  - `Not approved`
- Comments:

## 8) UAT Exit Rule

UAT should be considered complete only when:
- all critical issues are closed or explicitly accepted
- high-priority issues have a clear decision
- business owner confirms acceptance
- production rollout owner agrees to proceed

## 9) Support Model During UAT

Recommended ownership:
- UAT coordinator: manages tester scope and progress
- application owner: decides on feature intent and priority
- technical owner: investigates and fixes defects
- deployment owner: controls staging and production release movement

## 10) Related Project Documents

- `UAT_PROD_READINESS.md`
- `ISO27001_UAT_CHECKLIST.md`
- `PRODUCTION_READINESS.md`
- `OPS_RUNBOOK.md`
