CREATE TABLE "NotificationConfig" (
  "id" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "teamsWebhookUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "notifyTaskAssigned" BOOLEAN NOT NULL DEFAULT true,
  "notifyReminder" BOOLEAN NOT NULL DEFAULT true,
  "notifySignedOff" BOOLEAN NOT NULL DEFAULT true,
  "notifyFailedStep" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationConfig_countryCode_key" ON "NotificationConfig"("countryCode");

ALTER TABLE "NotificationConfig" ADD CONSTRAINT "NotificationConfig_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country"("code") ON DELETE CASCADE ON UPDATE CASCADE;
