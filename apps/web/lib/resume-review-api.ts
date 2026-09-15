import { apiRequest, type CandidatePassportResponse } from './api';

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
  };
}

export function listCandidateResumes(): Promise<CandidateResumeListItem[]> {
  return apiRequest<CandidateResumeListItem[]>('/candidate/resumes');
}

export function getCandidateResumeReview(resumeId: string): Promise<CandidateResumeReviewResponse> {
  return apiRequest<CandidateResumeReviewResponse>(`/candidate/resumes/${resumeId}/review`);
}
