export const RESUME_EXTRACTION_QUEUE = 'resume.extract' as const;
export const RESUME_OCR_QUEUE = 'resume.ocr' as const;

export type ResumeExtractionJobData = {
  resumeVersionId: string;
  processingPipelineVersion: string;
};

export type ResumeOcrJobData = {
  resumeVersionId: string;
  processingPipelineVersion: string;
  extractionId: string;
};

export const resumeExtractionJobId = (resumeVersionId: string, processingPipelineVersion: string) =>
  `resume-extract-${resumeVersionId}-${processingPipelineVersion}`;

export const resumeOcrJobId = (
  resumeVersionId: string,
  processingPipelineVersion: string,
  extractionId: string,
) => `resume-ocr-${resumeVersionId}-${processingPipelineVersion}-${extractionId}`;
