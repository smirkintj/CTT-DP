-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetSystem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProductAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProductAccess_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Module" ADD COLUMN "productId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "productId" TEXT;
ALTER TABLE "Task" ADD COLUMN "targetSystemId" TEXT;

-- Seed default product for legacy records
INSERT INTO "Product" ("id", "name", "slug", "isActive", "createdAt", "updatedAt")
VALUES ('prod_easyorder', 'EasyOrder', 'easyorder', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "Module"
SET "productId" = 'prod_easyorder'
WHERE "productId" IS NULL;

UPDATE "Task"
SET "productId" = 'prod_easyorder'
WHERE "productId" IS NULL;

INSERT INTO "TargetSystem" ("id", "productId", "name", "baseUrl", "isActive", "createdAt", "updatedAt")
VALUES
  ('ts_easyorder_ordering', 'prod_easyorder', 'Ordering Portal', 'https://www.easyorderstg.dksh.com', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ts_easyorder_admin', 'prod_easyorder', 'Admin Portal', 'https://www.easyorderadminstg.dksh.com', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "Task"
SET "targetSystemId" = 'ts_easyorder_ordering'
WHERE "targetSystemId" IS NULL;

INSERT INTO "UserProductAccess" ("id", "userId", "productId", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || u."id"), u."id", 'prod_easyorder', CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'STAKEHOLDER';

ALTER TABLE "Module" ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "productId" SET NOT NULL;

-- DropIndex
DROP INDEX "Module_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "Module_productId_name_key" ON "Module"("productId", "name");
CREATE UNIQUE INDEX "TargetSystem_productId_name_key" ON "TargetSystem"("productId", "name");
CREATE UNIQUE INDEX "UserProductAccess_userId_productId_key" ON "UserProductAccess"("userId", "productId");
CREATE INDEX "UserProductAccess_productId_createdAt_idx" ON "UserProductAccess"("productId", "createdAt");
CREATE INDEX "Task_productId_updatedAt_idx" ON "Task"("productId", "updatedAt");
CREATE INDEX "Task_productId_status_updatedAt_idx" ON "Task"("productId", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TargetSystem" ADD CONSTRAINT "TargetSystem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProductAccess" ADD CONSTRAINT "UserProductAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProductAccess" ADD CONSTRAINT "UserProductAccess_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_targetSystemId_fkey" FOREIGN KEY ("targetSystemId") REFERENCES "TargetSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
