-- AlterTable
ALTER TABLE "CandidateProfileVersion"
ADD COLUMN "contactFullName" TEXT,
ADD COLUMN "contactEmail" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "contactLocation" TEXT;

-- AlterTable
ALTER TABLE "CandidateCustomSection"
ADD COLUMN "sectionTypeKey" TEXT,
ADD COLUMN "sourceHeading" TEXT,
ADD COLUMN "classificationConfidence" DOUBLE PRECISION,
ADD COLUMN "classificationStatus" TEXT;

-- CreateTable
CREATE TABLE "CandidateAward" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "issuer" TEXT,
    "awardedAt" TIMESTAMP(3),
    "description" TEXT,
    "url" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateAward_profileVersionId_sortOrder_idx" ON "CandidateAward"("profileVersionId", "sortOrder");
CREATE INDEX "CandidateCustomSection_profileVersionId_sectionTypeKey_sortOrder_idx" ON "CandidateCustomSection"("profileVersionId", "sectionTypeKey", "sortOrder");

-- AddForeignKey
ALTER TABLE "CandidateAward" ADD CONSTRAINT "CandidateAward_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
