import { apiRequest, type CandidatePassportResponse } from './api';

export const MAX_RESUME_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_RESUME_UPLOAD_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export interface CandidateResumeListItem {
  id: string;
  title: string;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: {
    id: string;
    versionNumber: number;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    processingState: string;
    failureCode: string | null;
    uploadedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export interface ParsedClaim<T = unknown> {
  value: T;
  normalizedValue?: unknown;
  confidence: number;
  evidence: Array<{
    resumeExtractionId: string;
    pageNumber: number | null;
    blockIndex?: number;
    sourceRange: { start: number; end: number };
    evidenceKind: string;
  }>;
  warnings: string[];
}

export interface ParsedResumeProposal {
  schemaVersion: string;
  resumeVersionId: string;
  sourceExtractionId: string;
  parser: {
    name: string;
    version: string;
    parserPolicyVersion: string;
    evidencePolicyVersion: string;
    promptVersion?: string;
    provider?: string;
    model?: string;
  };
  identityCandidate?: {
    fullName?: ParsedClaim<string>;
    email?: ParsedClaim<string>;
    phone?: ParsedClaim<string>;
  };
  headline?: ParsedClaim<string>;
  summary?: ParsedClaim<string>;
  experiences: unknown[];
  education: unknown[];
  skills: unknown[];
  projects: unknown[];
  certifications: unknown[];
  languages: unknown[];
  links: unknown[];
  locations: unknown[];
  warnings: string[];
  confidenceSummary: {
    overall: number;
    lowConfidenceClaimCount: number;
    totalClaimCount: number;
  };
}

export interface CandidateResumeReviewResponse {
  resume: {
    id: string;
    title: string;
    currentVersionId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  version: CandidateResumeListItem['currentVersion'];
  proposal: {
    id: string;
    sourceExtractionId: string;
    parserName: string;
    parserVersion: string;
    schemaVersion: string;
    parserPolicyVersion: string;
    evidencePolicyVersion: string;
    promptVersion: string;
    provider: string | null;
    model: string | null;
    status: string;
    parsedJson: ParsedResumeProposal | null;
    confidenceSummary: unknown;
    warnings: unknown;
    completedAt: string | null;
    createdAt: string;
  } | null;
  passport: {
    candidateId: string;
    currentProfileVersion: CandidatePassportResponse['currentProfileVersion'];
  };
  review: {
    available: boolean;
    blockingReason: string | null;
    record: {
      id: string;
      decision: 'PENDING' | 'ACCEPTED' | 'EDITED' | 'IGNORED';
      candidateEdits: unknown;
      appliedProfileVersionId: string | null;
      decidedAt: string | null;
      createdAt: string;
      updatedAt: string;
    } | null;
  };
}

export interface ResumeUploadAuthorization {
  resumeId: string;
  resumeVersionId: string;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresInSeconds: number;
    maxSizeBytes: number;
  };
}

export type ResumeReviewDecisionRequest =
  | { decision: 'ACCEPT' }
  | { decision: 'IGNORE' }
  | {
      decision: 'EDIT';
      edits: {
        headline?: string | null;
        summary?: string | null;
      };
    };

export function listCandidateResumes(): Promise<CandidateResumeListItem[]> {
  return apiRequest<CandidateResumeListItem[]>('/candidate/resumes');
}

export function getCandidateResumeReview(resumeId: string): Promise<CandidateResumeReviewResponse> {
  return apiRequest<CandidateResumeReviewResponse>(`/candidate/resumes/${resumeId}/review`);
}

export function decideCandidateResumeReview(
  resumeId: string,
  input: ResumeReviewDecisionRequest,
): Promise<CandidateResumeReviewResponse> {
  return apiRequest<CandidateResumeReviewResponse>(`/candidate/resumes/${resumeId}/review/decision`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function authorizeCandidateResumeUpload(input: {
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ResumeUploadAuthorization> {
  return apiRequest<ResumeUploadAuthorization>('/candidate/resumes/upload-authorization', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function completeCandidateResumeUpload(resumeVersionId: string): Promise<unknown> {
  return apiRequest('/candidate/resumes/upload-complete', {
    method: 'POST',
    body: JSON.stringify({ resumeVersionId }),
  });
}

export async function putCandidateResumeFile(
  authorization: ResumeUploadAuthorization,
  file: File,
): Promise<void> {
  const response = await fetch(authorization.upload.url, {
    method: authorization.upload.method,
    headers: authorization.upload.headers,
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Private resume upload failed with status ${response.status}.`);
  }
}
