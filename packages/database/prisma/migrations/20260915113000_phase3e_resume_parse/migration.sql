-- Phase 3E-A: candidate-private structured resume parse proposals.
CREATE TYPE "ResumeParseStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED');

CREATE TABLE "ResumeParseResult" (
    "id" UUID NOT NULL,
    "resumeVersionId" UUID NOT NULL,
    "sourceExtractionId" UUID NOT NULL,
    "pipelineVersion" TEXT NOT NULL,
    "parserName" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT 'parsed-resume-v1',
    "parserPolicyVersion" TEXT NOT NULL DEFAULT 'resume-parser-policy-v1',
    "evidencePolicyVersion" TEXT NOT NULL DEFAULT 'resume-evidence-policy-v1',
    "promptVersion" TEXT NOT NULL DEFAULT 'none',
    "provider" TEXT,
    "model" TEXT,
    "status" "ResumeParseStatus" NOT NULL DEFAULT 'STARTED',
    "parsedJson" JSONB,
    "parsedObjectKey" TEXT,
    "evidenceMapJson" JSONB,
    "evidenceObjectKey" TEXT,
    "confidenceSummary" JSONB,
    "warnings" JSONB,
    "inputChecksumSha256" TEXT,
    "failureCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeParseResult_pkey" PRIMARY KEY ("id")
);

-- Stable parse execution identity. `promptVersion` uses the explicit sentinel
-- `none` for non-AI parsers so nullable uniqueness cannot create duplicate runs.
CREATE UNIQUE INDEX "resume_parse_execution_key"
ON "ResumeParseResult"(
    "resumeVersionId",
    "sourceExtractionId",
    "pipelineVersion",
    "parserName",
    "parserVersion",
    "schemaVersion",
    "promptVersion"
);

CREATE INDEX "ResumeParseResult_resumeVersionId_createdAt_idx"
ON "ResumeParseResult"("resumeVersionId", "createdAt" DESC);

CREATE INDEX "ResumeParseResult_sourceExtractionId_idx"
ON "ResumeParseResult"("sourceExtractionId");

CREATE INDEX "ResumeParseResult_status_updatedAt_idx"
ON "ResumeParseResult"("status", "updatedAt");

ALTER TABLE "ResumeParseResult"
ADD CONSTRAINT "ResumeParseResult_resumeVersionId_fkey"
FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResumeParseResult"
ADD CONSTRAINT "ResumeParseResult_sourceExtractionId_fkey"
FOREIGN KEY ("sourceExtractionId") REFERENCES "ResumeExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
