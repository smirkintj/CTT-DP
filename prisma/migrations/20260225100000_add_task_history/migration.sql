-- CreateEnum
CREATE TYPE "TaskHistoryAction" AS ENUM (
  'TASK_CREATED',
  'TASK_UPDATED',
  'STATUS_CHANGED',
  'STEP_CREATED',
  'STEP_UPDATED',
  'STEP_DELETED',
  'COMMENT_ADDED',
  'SIGNED_OFF',
  'DEPLOYED',
  'TASK_DELETED'
);

-- CreateTable
CREATE TABLE "TaskHistory" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" "TaskHistoryAction" NOT NULL,
  "message" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskHistory_taskId_createdAt_idx" ON "TaskHistory"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskHistory_actorId_createdAt_idx" ON "TaskHistory"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
