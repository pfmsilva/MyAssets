-- CreateTable
CREATE TABLE "ProofOfLifeCheck" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "recipients" TEXT NOT NULL,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "triggeredAt" TIMESTAMP(3),
    "releasedTo" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofOfLifeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProofOfLifeCheck_token_key" ON "ProofOfLifeCheck"("token");

-- CreateIndex
CREATE INDEX "ProofOfLifeCheck_sentAt_idx" ON "ProofOfLifeCheck"("sentAt");
