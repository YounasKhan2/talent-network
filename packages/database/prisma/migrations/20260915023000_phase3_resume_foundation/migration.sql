-- CreateEnum
CREATE TYPE "ResumeProcessingState" AS ENUM (
  'UPLOADING',
  'UPLOADED',
  'VALIDATING',
  'SCANNING',
  'EXTRACTING',
  'OCR_REQUIRED',
  'PARSING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL'
);

-- CreateTable
CREATE TABLE "Resume" (
  "id" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "currentVersionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
  "id" UUID NOT NULL,
  "resumeId" UUID NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "processingState" "ResumeProcessingState" NOT NULL DEFAULT 'UPLOADING',
  "objectKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT,
  "processingPipelineVersion" TEXT NOT NULL DEFAULT 'resume-pipeline-v1',
  "failureCode" TEXT,
  "failureMetadata" JSONB,
  "uploadedAt" TIMESTAMP(3),
  "approvedProfileVersionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Resume_currentVersionId_key" ON "Resume"("currentVersionId");

-- CreateIndex
CREATE INDEX "Resume_candidateId_updatedAt_idx" ON "Resume"("candidateId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVersion_objectKey_key" ON "ResumeVersion"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVersion_resumeId_versionNumber_key" ON "ResumeVersion"("resumeId", "versionNumber");

-- CreateIndex
CREATE INDEX "ResumeVersion_resumeId_createdAt_idx" ON "ResumeVersion"("resumeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ResumeVersion_processingState_updatedAt_idx" ON "ResumeVersion"("processingState", "updatedAt");

-- CreateIndex
CREATE INDEX "ResumeVersion_approvedProfileVersionId_idx" ON "ResumeVersion"("approvedProfileVersionId");

-- AddForeignKey
ALTER TABLE "Resume"
ADD CONSTRAINT "Resume_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion"
ADD CONSTRAINT "ResumeVersion_resumeId_fkey"
FOREIGN KEY ("resumeId") REFERENCES "Resume"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion"
ADD CONSTRAINT "ResumeVersion_approvedProfileVersionId_fkey"
FOREIGN KEY ("approvedProfileVersionId") REFERENCES "CandidateProfileVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume"
ADD CONSTRAINT "Resume_currentVersionId_fkey"
FOREIGN KEY ("currentVersionId") REFERENCES "ResumeVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
