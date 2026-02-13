-- Add audit/signoff fields to Task
ALTER TABLE "Task"
ADD COLUMN "updatedById" TEXT,
ADD COLUMN "signedOffAt" TIMESTAMP(3),
ADD COLUMN "signedOffById" TEXT;

-- Create TaskStep table
CREATE TABLE "TaskStep" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "testData" TEXT,
    "actualResult" TEXT,
    "isPassed" BOOLEAN,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskStep_pkey" PRIMARY KEY ("id")
);

-- Index for ordering
CREATE INDEX "TaskStep_taskId_order_idx" ON "TaskStep"("taskId", "order");

-- Foreign keys
ALTER TABLE "TaskStep" ADD CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_signedOffById_fkey" FOREIGN KEY ("signedOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
