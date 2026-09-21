-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "importBatchId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Trade_holdingId_externalId_key" ON "Trade"("holdingId", "externalId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

