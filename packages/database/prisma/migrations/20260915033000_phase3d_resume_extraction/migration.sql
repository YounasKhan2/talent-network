-- Phase 3D-A: rebuildable, candidate-private resume extraction output.
CREATE TYPE "ResumeExtractionMethod" AS ENUM ('NATIVE_PDF', 'NATIVE_DOCX', 'OCR');
CREATE TYPE "ResumeExtractionStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED');

CREATE TABLE "ResumeExtraction" (
    "id" UUID NOT NULL,
    "resumeVersionId" UUID NOT NULL,
    "extractionMethod" "ResumeExtractionMethod" NOT NULL,
    "extractorName" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT 'resume-document-v1',
    "pipelineVersion" TEXT NOT NULL,
    "status" "ResumeExtractionStatus" NOT NULL DEFAULT 'STARTED',
    "qualityMetadata" JSONB,
    "documentJson" JSONB,
    "documentObjectKey" TEXT,
    "textChecksumSha256" TEXT,
    "failureCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeExtraction_pkey" PRIMARY KEY ("id")
);

-- One extractor execution identity can only materialize one derived record.
-- Re-delivery therefore converges on the same row instead of duplicating private text.
CREATE UNIQUE INDEX "ResumeExtraction_resumeVersionId_pipelineVersion_extractorName_extractorVersion_extractionMethod_key"
ON "ResumeExtraction"("resumeVersionId", "pipelineVersion", "extractorName", "extractorVersion", "extractionMethod");

CREATE INDEX "ResumeExtraction_resumeVersionId_createdAt_idx"
ON "ResumeExtraction"("resumeVersionId", "createdAt" DESC);

CREATE INDEX "ResumeExtraction_status_updatedAt_idx"
ON "ResumeExtraction"("status", "updatedAt");

ALTER TABLE "ResumeExtraction"
ADD CONSTRAINT "ResumeExtraction_resumeVersionId_fkey"
FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
