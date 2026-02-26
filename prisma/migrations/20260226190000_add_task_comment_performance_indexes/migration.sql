-- Task list and dashboard query acceleration
CREATE INDEX IF NOT EXISTS "Task_assigneeId_updatedAt_idx" ON "Task"("assigneeId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Task_countryCode_updatedAt_idx" ON "Task"("countryCode", "updatedAt");
CREATE INDEX IF NOT EXISTS "Task_status_updatedAt_idx" ON "Task"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "Task_countryCode_status_updatedAt_idx" ON "Task"("countryCode", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "Task_dueDate_idx" ON "Task"("dueDate");

-- Comment/history query acceleration for task detail and report
CREATE INDEX IF NOT EXISTS "Comment_taskId_createdAt_idx" ON "Comment"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "Comment_taskId_stepOrder_createdAt_idx" ON "Comment"("taskId", "stepOrder", "createdAt");
