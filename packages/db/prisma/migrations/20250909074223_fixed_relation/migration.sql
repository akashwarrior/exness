/*
  Warnings:

  - Made the column `userId` on table `ExistingTrades` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."ExistingTrades" DROP CONSTRAINT "ExistingTrades_userId_fkey";

-- AlterTable
ALTER TABLE "public"."ExistingTrades" ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."ExistingTrades" ADD CONSTRAINT "ExistingTrades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
