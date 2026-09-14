-- CreateEnum
CREATE TYPE "CandidateVisibility" AS ENUM ('PRIVATE', 'NETWORK', 'VERIFIED_RECRUITERS');

-- CreateEnum
CREATE TYPE "CandidateDiscoverability" AS ENUM ('HIDDEN', 'SEARCHABLE');

-- CreateEnum
CREATE TYPE "CandidateProfileVersionStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CandidateProfileSource" AS ENUM ('MANUAL', 'RESUME_IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CandidateAvailabilityStatus" AS ENUM ('IMMEDIATE', 'NOTICE_PERIOD', 'OPEN_TO_OFFERS', 'NOT_LOOKING');

-- CreateEnum
CREATE TYPE "CandidateWorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE');

-- CreateTable
CREATE TABLE "Candidate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "visibility" "CandidateVisibility" NOT NULL DEFAULT 'PRIVATE',
    "discoverability" "CandidateDiscoverability" NOT NULL DEFAULT 'HIDDEN',
    "primaryLocale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currentProfileVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProfileVersion" (
    "id" UUID NOT NULL,
    "candidateId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "CandidateProfileVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "CandidateProfileSource" NOT NULL DEFAULT 'MANUAL',
    "headline" TEXT,
    "summary" TEXT,
    "availabilityStatus" "CandidateAvailabilityStatus",
    "availableFrom" TIMESTAMP(3),
    "compensationCurrency" TEXT,
    "compensationMinimum" INTEGER,
    "compensationTarget" INTEGER,
    "compensationPeriod" TEXT,
    "preferredWorkModes" "CandidateWorkMode"[] NOT NULL DEFAULT ARRAY[]::"CandidateWorkMode"[],
    "preferredEmploymentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEmployment" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employmentType" TEXT,
    "location" TEXT,
    "workMode" "CandidateWorkMode",
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateEmployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEducation" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "institutionName" TEXT NOT NULL,
    "degree" TEXT,
    "fieldOfStudy" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateSkill" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "proficiency" TEXT,
    "experienceMonths" INTEGER,
    "lastUsedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateProject" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "role" TEXT,
    "url" TEXT,
    "repositoryUrl" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateCertification" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "credentialId" TEXT,
    "credentialUrl" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateLanguage" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "proficiency" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateLink" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateLocationPreference" (
    "id" UUID NOT NULL,
    "profileVersionId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "remoteOnly" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateLocationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_userId_key" ON "Candidate"("userId");
CREATE UNIQUE INDEX "Candidate_currentProfileVersionId_key" ON "Candidate"("currentProfileVersionId");
CREATE INDEX "Candidate_discoverability_visibility_updatedAt_idx" ON "Candidate"("discoverability", "visibility", "updatedAt" DESC);
CREATE UNIQUE INDEX "CandidateProfileVersion_candidateId_versionNumber_key" ON "CandidateProfileVersion"("candidateId", "versionNumber");
CREATE INDEX "CandidateProfileVersion_candidateId_createdAt_idx" ON "CandidateProfileVersion"("candidateId", "createdAt" DESC);
CREATE INDEX "CandidateProfileVersion_candidateId_status_createdAt_idx" ON "CandidateProfileVersion"("candidateId", "status", "createdAt" DESC);
CREATE INDEX "CandidateEmployment_profileVersionId_sortOrder_idx" ON "CandidateEmployment"("profileVersionId", "sortOrder");
CREATE INDEX "CandidateEducation_profileVersionId_sortOrder_idx" ON "CandidateEducation"("profileVersionId", "sortOrder");
CREATE UNIQUE INDEX "CandidateSkill_profileVersionId_normalizedName_key" ON "CandidateSkill"("profileVersionId", "normalizedName");
CREATE INDEX "CandidateSkill_normalizedName_profileVersionId_idx" ON "CandidateSkill"("normalizedName", "profileVersionId");
CREATE INDEX "CandidateSkill_profileVersionId_sortOrder_idx" ON "CandidateSkill"("profileVersionId", "sortOrder");
CREATE INDEX "CandidateProject_profileVersionId_sortOrder_idx" ON "CandidateProject"("profileVersionId", "sortOrder");
CREATE INDEX "CandidateCertification_profileVersionId_sortOrder_idx" ON "CandidateCertification"("profileVersionId", "sortOrder");
CREATE UNIQUE INDEX "CandidateLanguage_profileVersionId_name_key" ON "CandidateLanguage"("profileVersionId", "name");
CREATE INDEX "CandidateLanguage_profileVersionId_sortOrder_idx" ON "CandidateLanguage"("profileVersionId", "sortOrder");
CREATE INDEX "CandidateLink_profileVersionId_sortOrder_idx" ON "CandidateLink"("profileVersionId", "sortOrder");
CREATE INDEX "CandidateLocationPreference_profileVersionId_sortOrder_idx" ON "CandidateLocationPreference"("profileVersionId", "sortOrder");
CREATE INDEX "CandidateLocationPreference_countryCode_city_idx" ON "CandidateLocationPreference"("countryCode", "city");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_currentProfileVersionId_fkey" FOREIGN KEY ("currentProfileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CandidateProfileVersion" ADD CONSTRAINT "CandidateProfileVersion_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateEmployment" ADD CONSTRAINT "CandidateEmployment_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateSkill" ADD CONSTRAINT "CandidateSkill_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateProject" ADD CONSTRAINT "CandidateProject_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateCertification" ADD CONSTRAINT "CandidateCertification_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateLanguage" ADD CONSTRAINT "CandidateLanguage_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateLink" ADD CONSTRAINT "CandidateLink_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateLocationPreference" ADD CONSTRAINT "CandidateLocationPreference_profileVersionId_fkey" FOREIGN KEY ("profileVersionId") REFERENCES "CandidateProfileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
