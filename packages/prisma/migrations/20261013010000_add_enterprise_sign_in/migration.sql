-- CreateTable
CREATE TABLE "EnterpriseSignInConnection" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'creating',
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseSignInConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseSignInIdentity" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "EnterpriseSignInIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseSignInAttempt" (
    "stateHash" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "secrets" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "linkingUserId" INTEGER,
    "linkingSessionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "EnterpriseSignInAttempt_pkey" PRIMARY KEY ("stateHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseSignInConnection_organisationId_key" ON "EnterpriseSignInConnection"("organisationId");

-- CreateIndex
CREATE INDEX "EnterpriseSignInIdentity_userId_idx" ON "EnterpriseSignInIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseSignInIdentity_connectionId_subjectId_key" ON "EnterpriseSignInIdentity"("connectionId", "subjectId");

-- CreateIndex
CREATE INDEX "EnterpriseSignInAttempt_expiresAt_idx" ON "EnterpriseSignInAttempt"("expiresAt");

-- AddForeignKey
ALTER TABLE "EnterpriseSignInConnection" ADD CONSTRAINT "EnterpriseSignInConnection_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseSignInIdentity" ADD CONSTRAINT "EnterpriseSignInIdentity_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "EnterpriseSignInConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseSignInIdentity" ADD CONSTRAINT "EnterpriseSignInIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseSignInAttempt" ADD CONSTRAINT "EnterpriseSignInAttempt_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "EnterpriseSignInConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

