# Azure And Bitbucket Migration Plan

Last updated: 2026-03-19

Purpose:
- Prepare the project for migration into the company-managed environment.
- Identify what is portable already and what still needs company decisions.

## 1) Current Technical Stack

- Frontend / app server: Next.js 15
- Runtime UI: React 19
- Authentication: NextAuth v4
- Database: PostgreSQL via Prisma
- Mail provider: Resend
- Current deployment target: Vercel

## 2) What Makes This Portable

- The application is Node.js based and can run outside Vercel.
- The database layer is PostgreSQL, which is widely supported.
- Prisma migrations provide a repeatable schema migration path.
- Secrets are environment-variable driven.

## 3) Azure Target Options

Possible Azure landing zones:
- Azure App Service
- Azure Container Apps
- Azure VM-based Node.js hosting

Recommended first target:
- Azure App Service or Azure Container Apps

Reason:
- Simpler operational model than VM hosting.
- Good fit for a web application with environment variables and a managed database.

## 4) Database Migration Considerations

Required decisions:
- [ ] Confirm whether the company standard database is PostgreSQL.
- [ ] Confirm whether Prisma is acceptable in the target environment.
- [ ] Confirm whether the company requires Azure Database for PostgreSQL or another managed database.
- [ ] Confirm backup, restore, and retention policies.

Migration tasks:
- [ ] Export or recreate schema in the target database using Prisma migrations.
- [ ] Recreate environment variables securely in Azure.
- [ ] Run smoke tests against the Azure-hosted application.
- [ ] Confirm connection string security and network access rules.

## 5) Repository Migration To Bitbucket

Required tasks:
- [ ] Create a Bitbucket repository under the company workspace.
- [ ] Push the full Git history or a clean approved history.
- [ ] Recreate branch protections for `main` and `staging`.
- [ ] Recreate CI checks in the company pipeline.
- [ ] Document who owns merge permissions and deployment permissions.

Suggested branch model:
- `main` -> production
- `staging` -> UAT
- feature branches -> development only

## 6) CI / CD Migration Considerations

Current project expectations:
- install dependencies
- run lint
- run `npm run audit:check-admin`
- run build
- run Prisma migration during release

Company pipeline should support:
- [ ] Node.js runtime version required by the project
- [ ] secure environment variable injection
- [ ] build and test stages
- [ ] controlled production deployment approval
- [ ] rollback procedure

## 7) Environment Variable Mapping

Core application variables:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Recommended environment separation:
- Development
- Staging / UAT
- Production

## 8) Migration Risks

- Vercel-specific behavior may need replacement or revalidation in Azure.
- Email deliverability may change in the company environment.
- Auth callback URLs must be updated correctly.
- Build or runtime assumptions may differ outside Vercel.
- Infrastructure approvals may take longer than code migration.

## 9) Definition Of Done For Migration

- [ ] Source code is hosted in company Bitbucket.
- [ ] App is deployed in company Azure environment.
- [ ] Staging and production environments are separated.
- [ ] Company-managed database is connected and tested.
- [ ] Secrets are stored in the approved company mechanism.
- [ ] Deployment, rollback, and support ownership are documented.
