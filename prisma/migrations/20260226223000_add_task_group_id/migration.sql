-- Add task grouping id for cross-market global updates
ALTER TABLE "Task"
ADD COLUMN "taskGroupId" TEXT;

CREATE INDEX "Task_taskGroupId_updatedAt_idx"
ON "Task"("taskGroupId", "updatedAt");
