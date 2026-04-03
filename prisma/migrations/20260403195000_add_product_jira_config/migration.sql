-- Add per-product Jira intake configuration
ALTER TABLE "Product"
ADD COLUMN "jiraProjectKey" TEXT,
ADD COLUMN "jiraPullStatuses" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Improve linked-task lookups by Jira ticket
CREATE INDEX "Task_jiraTicket_idx" ON "Task"("jiraTicket");
