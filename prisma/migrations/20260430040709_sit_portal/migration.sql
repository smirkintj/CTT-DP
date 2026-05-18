-- CreateEnum
CREATE TYPE "SitTaskStatus" AS ENUM ('DRAFT', 'READY', 'IN_PROGRESS', 'SIGNED_OFF');

-- CreateEnum
CREATE TYPE "SitCaseStatus" AS ENUM ('NOT_STARTED', 'PASS', 'CONDITIONAL', 'FAIL', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SitEvidenceType" AS ENUM ('IMAGE', 'JAM_LINK');

-- CreateEnum
CREATE TYPE "SitHistoryAction" AS ENUM ('TASK_CREATED', 'TASK_PUBLISHED', 'STATUS_CHANGED', 'TEST_CASE_ADDED', 'TEST_CASE_MODIFIED', 'TEST_CASE_REMOVED', 'TEST_CASE_RESULT_RECORDED', 'CONDITIONAL_ACKNOWLEDGED', 'DEFECT_LINKED', 'DEFECT_UNLINKED', 'EVIDENCE_ADDED', 'SCOPE_NOTE_ADDED', 'SIGNED_OFF');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'QA';

-- DropIndex
DROP INDEX "NotificationConfig_countryCode_key";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "jiraReadyForTestingTransition" TEXT,
ADD COLUMN     "jiraSitDoneTransition" TEXT,
ADD COLUMN     "jiraTestingTransition" TEXT;

-- CreateTable
CREATE TABLE "SitTask" (
    "id" TEXT NOT NULL,
    "sprintName" TEXT NOT NULL,
    "jiraTicket" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "module" TEXT,
    "environment" TEXT,
    "status" "SitTaskStatus" NOT NULL DEFAULT 'DRAFT',
    "assigneeId" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "signedOffById" TEXT,
    "signatureData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SitTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitTaskCountry" (
    "sitTaskId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,

    CONSTRAINT "SitTaskCountry_pkey" PRIMARY KEY ("sitTaskId","countryCode")
);

-- CreateTable
CREATE TABLE "SitTestCase" (
    "id" TEXT NOT NULL,
    "sitTaskId" TEXT NOT NULL,
    "seqId" INTEGER NOT NULL,
    "priority" TEXT,
    "category" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" TEXT,
    "expectedResult" TEXT,
    "testData" TEXT,
    "actualResult" TEXT,
    "status" "SitCaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "testerName" TEXT,
    "testedAt" TIMESTAMP(3),
    "conditionalNote" TEXT,
    "adminAcknowledgedAt" TIMESTAMP(3),
    "adminAcknowledgedById" TEXT,
    "splitByCountry" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitTestCaseCountryResult" (
    "id" TEXT NOT NULL,
    "sitTestCaseId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "status" "SitCaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "actualResult" TEXT,
    "testerName" TEXT,
    "testedAt" TIMESTAMP(3),

    CONSTRAINT "SitTestCaseCountryResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitEvidence" (
    "id" TEXT NOT NULL,
    "sitTestCaseId" TEXT NOT NULL,
    "type" "SitEvidenceType" NOT NULL,
    "url" TEXT,
    "imageData" TEXT,
    "filename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitDefect" (
    "id" TEXT NOT NULL,
    "sitTestCaseId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT,
    "priority" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitDefect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitTaskHistory" (
    "id" TEXT NOT NULL,
    "sitTaskId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "SitHistoryAction" NOT NULL,
    "message" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitTaskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitTask_productId_status_idx" ON "SitTask"("productId", "status");

-- CreateIndex
CREATE INDEX "SitTask_assigneeId_status_idx" ON "SitTask"("assigneeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SitTask_jiraTicket_productId_key" ON "SitTask"("jiraTicket", "productId");

-- CreateIndex
CREATE INDEX "SitTestCase_sitTaskId_seqId_idx" ON "SitTestCase"("sitTaskId", "seqId");

-- CreateIndex
CREATE UNIQUE INDEX "SitTestCaseCountryResult_sitTestCaseId_countryCode_key" ON "SitTestCaseCountryResult"("sitTestCaseId", "countryCode");

-- CreateIndex
CREATE INDEX "SitDefect_sitTestCaseId_idx" ON "SitDefect"("sitTestCaseId");

-- CreateIndex
CREATE INDEX "SitDefect_jiraKey_idx" ON "SitDefect"("jiraKey");

-- CreateIndex
CREATE INDEX "SitTaskHistory_sitTaskId_createdAt_idx" ON "SitTaskHistory"("sitTaskId", "createdAt");

-- AddForeignKey
ALTER TABLE "SitTask" ADD CONSTRAINT "SitTask_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTask" ADD CONSTRAINT "SitTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTask" ADD CONSTRAINT "SitTask_signedOffById_fkey" FOREIGN KEY ("signedOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTask" ADD CONSTRAINT "SitTask_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTaskCountry" ADD CONSTRAINT "SitTaskCountry_sitTaskId_fkey" FOREIGN KEY ("sitTaskId") REFERENCES "SitTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTaskCountry" ADD CONSTRAINT "SitTaskCountry_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTestCase" ADD CONSTRAINT "SitTestCase_sitTaskId_fkey" FOREIGN KEY ("sitTaskId") REFERENCES "SitTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTestCase" ADD CONSTRAINT "SitTestCase_adminAcknowledgedById_fkey" FOREIGN KEY ("adminAcknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTestCaseCountryResult" ADD CONSTRAINT "SitTestCaseCountryResult_sitTestCaseId_fkey" FOREIGN KEY ("sitTestCaseId") REFERENCES "SitTestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTestCaseCountryResult" ADD CONSTRAINT "SitTestCaseCountryResult_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitEvidence" ADD CONSTRAINT "SitEvidence_sitTestCaseId_fkey" FOREIGN KEY ("sitTestCaseId") REFERENCES "SitTestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitDefect" ADD CONSTRAINT "SitDefect_sitTestCaseId_fkey" FOREIGN KEY ("sitTestCaseId") REFERENCES "SitTestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTaskHistory" ADD CONSTRAINT "SitTaskHistory_sitTaskId_fkey" FOREIGN KEY ("sitTaskId") REFERENCES "SitTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitTaskHistory" ADD CONSTRAINT "SitTaskHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
