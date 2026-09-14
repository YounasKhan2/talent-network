-- CreateTable
CREATE TABLE "CandidateCustomSection" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateCustomSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateCustomSectionItem" (
    "id" UUID NOT NULL,
    "customSectionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "url" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateCustomSectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateCustomSection_profileVersionId_sortOrder_idx" ON "CandidateCustomSection"("profileVersionId", "sortOrder");
CREATE INDEX "CandidateCustomSectionItem_customSectionId_sortOrder_idx" ON "CandidateCustomSectionItem"("customSectionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "CandidateCustomSection" ADD CONSTRAINT "CandidateCustomSection_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateCustomSectionItem" ADD CONSTRAINT "CandidateCustomSectionItem_customSectionId_fkey" FOREIGN KEY ("customSectionId") REFERENCES "CandidateCustomSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
