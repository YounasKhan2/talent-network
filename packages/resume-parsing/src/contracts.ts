import type {
  ResumeIntelligenceDiagnosticCode,
  ResumeRecordReconciliation,
  ResumeSourceCoverageSummary,
} from '@talent-network/contracts';
import type { ResumeDocumentGraphSource } from './document-graph.js';
import type { PreprocessedResumeDocument } from './preprocessing.js';
import type {
  ParsedResumeSchemaVersion,
  ResumeEvidencePolicyVersion,
  ResumeParserPolicyVersion,
} from './versions.js';

export interface ParsedEvidenceRange {
  start: number;
  end: number;
}

export type ParsedEvidenceKind =
  'DIRECT_TEXT' | 'SECTION_CONTEXT' | 'NORMALIZED_VALUE' | 'DERIVED_DATE' | 'DERIVED_LINK';

export interface ParsedEvidence {
  resumeExtractionId: string;
  pageNumber: number | null;
  blockIndex?: number;
  sourceRange: ParsedEvidenceRange;
  evidenceKind: ParsedEvidenceKind;
}

export interface ParsedClaim<T> {
  value: T;
  normalizedValue?: T | string;
  confidence: number;
  evidence: ParsedEvidence[];
  warnings: string[];
}

export interface ParsedDateRange {
  start?: string;
  end?: string;
  isCurrent?: boolean;
}

export interface ParsedExperience {
  company?: ParsedClaim<string>;
  role?: ParsedClaim<string>;
  location?: ParsedClaim<string>;
  dates?: ParsedClaim<ParsedDateRange>;
  summary?: ParsedClaim<string>;
  highlights: ParsedClaim<string>[];
}

export interface ParsedEducation {
  institution?: ParsedClaim<string>;
  qualification?: ParsedClaim<string>;
  fieldOfStudy?: ParsedClaim<string>;
  location?: ParsedClaim<string>;
  dates?: ParsedClaim<ParsedDateRange>;
  details: ParsedClaim<string>[];
}

export interface ParsedSkill {
  name: ParsedClaim<string>;
  category?: ParsedClaim<string>;
}

export interface ParsedProject {
  name?: ParsedClaim<string>;
  description?: ParsedClaim<string>;
  url?: ParsedClaim<string>;
  technologies: ParsedClaim<string>[];
}

export interface ParsedCertification {
  name: ParsedClaim<string>;
  issuer?: ParsedClaim<string>;
  issuedAt?: ParsedClaim<string>;
  expiresAt?: ParsedClaim<string>;
  credentialId?: ParsedClaim<string>;
  credentialUrl?: ParsedClaim<string>;
}

export interface ParsedAward {
  name: ParsedClaim<string>;
  issuer?: ParsedClaim<string>;
  issuedAt?: ParsedClaim<string>;
  details?: ParsedClaim<string>;
}

export interface ParsedLanguage {
  name: ParsedClaim<string>;
  proficiency?: ParsedClaim<string>;
}

export interface ParsedLink {
  label?: ParsedClaim<string>;
  url: ParsedClaim<string>;
}

export interface ParsedLocation {
  value: ParsedClaim<string>;
  kind?: 'CURRENT' | 'PREFERRED' | 'OTHER';
}

export interface ParsedIdentityCandidate {
  fullName?: ParsedClaim<string>;
  email?: ParsedClaim<string>;
  phone?: ParsedClaim<string>;
}

export interface ParsedAdditionalSection {
  sourceOrder: number;
  heading: ParsedClaim<string>;
  entries: ParsedClaim<string>[];
}

export interface ResumeParserMetadata {
  name: string;
  version: string;
  parserPolicyVersion: ResumeParserPolicyVersion;
  evidencePolicyVersion: ResumeEvidencePolicyVersion;
  promptVersion?: string;
  provider?: string;
  model?: string;
}

export interface ParsedResumeConfidenceSummary {
  overall: number;
  lowConfidenceClaimCount: number;
  totalClaimCount: number;
}

export type ResumeCoverageSectionKey =
  | 'IDENTITY'
  | 'SUMMARY'
  | 'EXPERIENCE'
  | 'EDUCATION'
  | 'SKILLS'
  | 'PROJECTS'
  | 'CERTIFICATIONS'
  | 'LANGUAGES'
  | 'LINKS';

export type ResumeCoverageSectionStatus = 'NOT_PRESENT' | 'DETECTED' | 'MISSED';

export interface ParsedResumeCoverageSection {
  key: ResumeCoverageSectionKey;
  sourcePresent: boolean;
  detectedCount: number;
  status: ResumeCoverageSectionStatus;
}

export interface ParsedResumeCoverageSummary {
  ratio: number;
  coveredSectionCount: number;
  sourceSectionCount: number;
  status: 'COMPLETE' | 'PARTIAL' | 'NONE';
  sections: ParsedResumeCoverageSection[];
}

export interface ParsedResumeRuntimeDiagnostic {
  code: ResumeIntelligenceDiagnosticCode;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  reviewRequired: boolean;
}

export interface ParsedResumeRuntimeV2 {
  schemaVersion: 'resume-intelligence-runtime-v2';
  documentQuality: number | null;
  structuralConfidence: number | null;
  sourceCoverage: ResumeSourceCoverageSummary;
  reconciliations: ResumeRecordReconciliation[];
  diagnostics: ParsedResumeRuntimeDiagnostic[];
  privateSourceCount: number;
  privateContentPersisted: false;
}

export interface ParsedResume {
  schemaVersion: ParsedResumeSchemaVersion;
  resumeVersionId: string;
  sourceExtractionId: string;
  parser: ResumeParserMetadata;
  identityCandidate?: ParsedIdentityCandidate;
  headline?: ParsedClaim<string>;
  summary?: ParsedClaim<string>;
  experiences: ParsedExperience[];
  education: ParsedEducation[];
  skills: ParsedSkill[];
  projects: ParsedProject[];
  certifications: ParsedCertification[];
  awards?: ParsedAward[];
  languages: ParsedLanguage[];
  links: ParsedLink[];
  locations: ParsedLocation[];
  additionalSections?: ParsedAdditionalSection[];
  warnings: string[];
  confidenceSummary: ParsedResumeConfidenceSummary;
  coverageSummary?: ParsedResumeCoverageSummary;
  runtimeV2?: ParsedResumeRuntimeV2;
}

export interface ResumeParseInput {
  resumeVersionId: string;
  sourceExtractionId: string;
  processingPipelineVersion: string;
  sourceDocumentSchemaVersion: string;
  sourceDocument?: ResumeDocumentGraphSource;
  preprocessedDocument: PreprocessedResumeDocument;
}

export interface ParsedResumeDraft {
  parsedResume: ParsedResume;
  inputChecksumSha256?: string;
}

export interface ResumeParser {
  readonly name: string;
  readonly version: string;
  parse(input: ResumeParseInput): Promise<ParsedResumeDraft>;
}
