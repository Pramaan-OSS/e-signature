CREATE TABLE "CapabilityOperation" (
  "id" TEXT NOT NULL, "userId" INTEGER NOT NULL, "teamId" INTEGER NOT NULL,
  "action" TEXT NOT NULL, "inputHash" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'working',
  "result" JSONB, "resourceRef" TEXT, "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapabilityOperation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CapabilityOperation_userId_teamId_createdAt_idx" ON "CapabilityOperation"("userId", "teamId", "createdAt");
