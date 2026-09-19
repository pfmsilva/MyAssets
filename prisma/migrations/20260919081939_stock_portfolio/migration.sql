-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'STOCK_PORTFOLIO';

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holding_assetId_idx" ON "Holding"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_assetId_isin_key" ON "Holding"("assetId", "isin");

-- CreateIndex
CREATE INDEX "Trade_holdingId_date_idx" ON "Trade"("holdingId", "date");

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
