-- Compound index for stakeholder activity feed query:
-- WHERE countryCode = $1 ORDER BY createdAt DESC
-- Allows Postgres to use a single index range scan instead of
-- separate single-column indexes with an in-memory sort.
CREATE INDEX IF NOT EXISTS "Activity_countryCode_createdAt_idx"
ON "Activity"("countryCode", "createdAt" DESC);
