-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "avgPrice" DOUBLE PRECISION,
ADD COLUMN     "costEur" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "RealizedTrade" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticker" TEXT,
    "quantity" DOUBLE PRECISION,
    "openPrice" DOUBLE PRECISION,
    "closePrice" DOUBLE PRECISION,
    "openTime" TIMESTAMP(3),
    "closeTime" TIMESTAMP(3) NOT NULL,
    "profitEur" DOUBLE PRECISION NOT NULL,
    "grossEur" DOUBLE PRECISION,
    "commission" DOUBLE PRECISION,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealizedTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RealizedTrade_assetId_closeTime_idx" ON "RealizedTrade"("assetId", "closeTime");

-- CreateIndex
CREATE UNIQUE INDEX "RealizedTrade_assetId_externalId_key" ON "RealizedTrade"("assetId", "externalId");

-- AddForeignKey
ALTER TABLE "RealizedTrade" ADD CONSTRAINT "RealizedTrade_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealizedTrade" ADD CONSTRAINT "RealizedTrade_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
