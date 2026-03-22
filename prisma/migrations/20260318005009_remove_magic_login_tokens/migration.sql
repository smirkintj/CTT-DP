/*
  Warnings:

  - You are about to drop the `MagicLoginToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "MagicLoginToken" DROP CONSTRAINT "MagicLoginToken_userId_fkey";

-- DropTable
DROP TABLE "MagicLoginToken";
