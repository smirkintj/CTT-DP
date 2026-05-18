# CTT (Change Tracking Tool) — 1 Pager

**What it is**
CTT is an internal UAT and SIT tracking platform built for DKSH's digital product deployments. It replaces email threads and spreadsheets with a structured, auditable workflow — from test assignment to sign-off — across all markets before any feature goes live.

---

## The Problem It Solves

Before CTT, UAT coordination across 6 markets (SG, MY, TH, VN, HK, TW) happened over email. There was no visibility into which country had tested what, no formal sign-off trail, no way to surface blockers early, and no link between Jira tickets and actual test outcomes. Deployments were delayed or risky because nobody had a single source of truth.

---

## What's Been Built

**Live in production today:**
- Multi-country UAT task management with step-by-step test cases
- Role-based access: Admin (DKSH CSSC), Stakeholder (country UAT testers), QA
- Jira integration — tickets pulled automatically, linked to UAT tasks
- Digital sign-off with signature capture and PDF report generation
- Deployment tracking (release version, deployed by, deployed at)
- Activity feed, inbox, comment threads per test step
- Full audit trail per task

**Products currently onboarded:** EasyOrder (pilot), SalesHub, ServicePro
**Markets:** SG, MY, TH, VN, HK, TW

**SIT portal (backend complete, UI in progress):**
The SIT (System Integration Testing) layer is built for the QA team (led by Venkka). Backend, schema, APIs and sign-off reporting are deployed. The QA-facing UI (dashboard, Jira queue, test execution view) is the next build — pending a proper process alignment with Venkka on the e2e SIT workflow.

---

## Relevance Beyond EasyOrder

CTT is product-agnostic by design. Connect Client and Connect Customer can be onboarded with zero architectural changes — just a product configuration in the admin panel. The same UAT and SIT workflow applies: country teams test, QA validates integration, admin tracks deployment.

This means CTT becomes the single UAT/SIT layer across DKSH's entire digital product portfolio.

---

## Impact & Outcomes

| Before | After |
|--------|-------|
| UAT status in email threads | Real-time dashboard per product and market |
| Manual sign-off via email | Digital sign-off with PDF audit report |
| No link between Jira and test outcomes | Jira tickets auto-linked to UAT/SIT tasks |
| Deployment decisions made on gut feel | Deployment gated by sign-off status |
| QA process ad-hoc | Structured SIT portal with evidence, defects, conditional tracking |

---

## Support Needed

A strategic decision on ownership is needed:

**Option A — Continue as internal tool (current state)**
Maintained ad-hoc by Putra with AI-assisted development. Fast and low-cost, but not sustainable for a growing product portfolio.

**Option B — Formalise with dedicated resource**
Assign a part-time developer or make CTT an official internal product. Required if Connect Client and Connect Customer are onboarding.

**Option C — Evaluate off-the-shelf**
Tools like TestRail or Zephyr exist but don't integrate with DKSH's Jira setup, don't support the multi-market sign-off model, and aren't customisable for the deployment tracking workflow CTT already does.

**Recommendation:** Option B. The tool works. The question is whether DKSH wants to own it properly.

---

*CTT is live at [production URL] | Built on Next.js 15, PostgreSQL, Vercel | v1.4.2*
