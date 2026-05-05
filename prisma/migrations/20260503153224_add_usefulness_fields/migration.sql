-- AlterTable
ALTER TABLE "Ad" ADD COLUMN "recommendedAction" TEXT;
ALTER TABLE "Ad" ADD COLUMN "usefulnessConfidence" REAL;
ALTER TABLE "Ad" ADD COLUMN "usefulnessReason" TEXT;
ALTER TABLE "Ad" ADD COLUMN "usefulnessStatus" TEXT;
