export const RESUME_PARSE_QUEUE = 'resume.parse' as const;

export type ResumeParseJobData = {
  resumeVersionId: string;
  processingPipelineVersion: string;
  extractionId: string;
};

export const resumeParseJobId = (
  resumeVersionId: string,
  processingPipelineVersion: string,
  extractionId: string,
) => `resume-parse-${resumeVersionId}-${processingPipelineVersion}-${extractionId}`;
