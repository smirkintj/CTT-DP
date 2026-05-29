-- CreateEnum
CREATE TYPE "DraftTaskStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropIndex
DROP INDEX "Activity_countryCode_createdAt_idx";

-- CreateTable
CREATE TABLE "DraftTask" (
    "id" TEXT NOT NULL,
    "jiraTicket" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "DraftTaskStatus" NOT NULL DEFAULT 'PENDING',
    "rawExcelData" JSONB NOT NULL,
    "generatedData" JSONB NOT NULL,
    "editedData" JSONB,
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resultTaskIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftTask_jiraTicket_key" ON "DraftTask"("jiraTicket");

-- CreateIndex
CREATE INDEX "DraftTask_status_createdAt_idx" ON "DraftTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_countryCode_createdAt_idx" ON "Activity"("countryCode", "createdAt");

-- AddForeignKey
ALTER TABLE "DraftTask" ADD CONSTRAINT "DraftTask_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftTask" ADD CONSTRAINT "DraftTask_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
