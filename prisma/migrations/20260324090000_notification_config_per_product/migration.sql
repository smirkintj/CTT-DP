-- Drop old unique constraint
ALTER TABLE "NotificationConfig" DROP CONSTRAINT "NotificationConfig_countryCode_key";

-- Delete existing configs (they have no productId, can't be migrated)
DELETE FROM "NotificationConfig";

-- Add productId column
ALTER TABLE "NotificationConfig" ADD COLUMN "productId" TEXT NOT NULL;

-- Add foreign key to Product
ALTER TABLE "NotificationConfig" ADD CONSTRAINT "NotificationConfig_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add new compound unique constraint
ALTER TABLE "NotificationConfig" ADD CONSTRAINT "NotificationConfig_productId_countryCode_key"
  UNIQUE ("productId", "countryCode");
