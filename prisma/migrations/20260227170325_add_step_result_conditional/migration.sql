DO $$
BEGIN
  CREATE TYPE "StepResult" AS ENUM ('PASSED', 'FAILED', 'CONDITIONAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "TaskStep"
ADD COLUMN IF NOT EXISTS "stepResult" "StepResult";

UPDATE "TaskStep"
SET "stepResult" = CASE
  WHEN "isPassed" = TRUE THEN 'PASSED'::"StepResult"
  WHEN "isPassed" = FALSE THEN 'FAILED'::"StepResult"
  ELSE NULL
END
WHERE "stepResult" IS NULL;
