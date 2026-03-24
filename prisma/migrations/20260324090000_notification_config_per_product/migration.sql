-- Drop old unique constraint if it exists (name varies by environment)
ALTER TABLE "NotificationConfig" DROP CONSTRAINT IF EXISTS "NotificationConfig_countryCode_key";

-- Delete existing configs (they have no productId, can't be migrated)
DELETE FROM "NotificationConfig";

-- Add productId column if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'NotificationConfig' AND column_name = 'productId'
  ) THEN
    ALTER TABLE "NotificationConfig" ADD COLUMN "productId" TEXT NOT NULL DEFAULT '';
    ALTER TABLE "NotificationConfig" ALTER COLUMN "productId" DROP DEFAULT;
  END IF;
END $$;

-- Add foreign key to Product if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'NotificationConfig_productId_fkey'
  ) THEN
    ALTER TABLE "NotificationConfig" ADD CONSTRAINT "NotificationConfig_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Add new compound unique constraint if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'NotificationConfig_productId_countryCode_key'
  ) THEN
    ALTER TABLE "NotificationConfig" ADD CONSTRAINT "NotificationConfig_productId_countryCode_key"
      UNIQUE ("productId", "countryCode");
  END IF;
END $$;
