CREATE TYPE "ResumeReviewDecision" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED', 'IGNORED');

CREATE TABLE "ResumeReview" (
  "id" UUID NOT NULL,
  "resumeVersionId" UUID NOT NULL,
  "parseResultId" UUID NOT NULL,
  "baseProfileVersionId" UUID NOT NULL,
  "decision" "ResumeReviewDecision" NOT NULL DEFAULT 'PENDING',
  "candidateEdits" JSONB,
  "appliedProfileVersionId" UUID,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResumeReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResumeReview_resumeVersionId_key" ON "ResumeReview"("resumeVersionId");
CREATE UNIQUE INDEX "ResumeReview_parseResultId_key" ON "ResumeReview"("parseResultId");
CREATE UNIQUE INDEX "ResumeReview_appliedProfileVersionId_key" ON "ResumeReview"("appliedProfileVersionId");
CREATE INDEX "ResumeReview_resumeVersionId_decision_idx" ON "ResumeReview"("resumeVersionId", "decision");
CREATE INDEX "ResumeReview_baseProfileVersionId_idx" ON "ResumeReview"("baseProfileVersionId");

ALTER TABLE "ResumeReview"
  ADD CONSTRAINT "ResumeReview_parseResultId_fkey"
  FOREIGN KEY ("parseResultId") REFERENCES "ResumeParseResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
