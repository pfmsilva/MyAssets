-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY', 'BOND', 'GOLD', 'CRYPTO', 'CASH', 'REAL_ESTATE', 'MIXED', 'OTHER');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "assetClass" "AssetClass";

-- AlterTable
ALTER TABLE "Instrument" ADD COLUMN     "assetClass" "AssetClass";

-- CreateTable
CREATE TABLE "AllocationTarget" (
    "assetClass" "AssetClass" NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationTarget_pkey" PRIMARY KEY ("assetClass")
);
