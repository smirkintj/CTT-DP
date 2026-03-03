ALTER TABLE "TaskStep"
ADD COLUMN IF NOT EXISTS "conditionalReason" TEXT;

CREATE TABLE IF NOT EXISTS "PortalSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortalSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PortalSetting_key_key" ON "PortalSetting"("key");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PortalSetting_updatedById_fkey'
  ) THEN
    ALTER TABLE "PortalSetting"
      ADD CONSTRAINT "PortalSetting_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
