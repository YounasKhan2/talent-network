import type {
  ParsedClaim,
  ParsedResume,
  ParsedResumeDraft,
  ResumeParseInput,
  ResumeParser,
} from './contracts.js';
import {
  PARSED_RESUME_SCHEMA_VERSION,
  RESUME_EVIDENCE_POLICY_VERSION,
  RESUME_PARSER_POLICY_VERSION,
} from './versions.js';

export class LocalDeterministicResumeParser implements ResumeParser {
  readonly name = 'local-deterministic-resume-parser';
  readonly version = '1';

  parse(input: ResumeParseInput): Promise<ParsedResumeDraft> {
    const email = input.preprocessedDocument.candidates.find((candidate) => candidate.kind === 'EMAIL');
    const phone = input.preprocessedDocument.candidates.find((candidate) => candidate.kind === 'PHONE');
    const urls = input.preprocessedDocument.candidates.filter((candidate) => candidate.kind === 'URL');

    const emailClaim = email
      ? detectionClaim(email.value, input.sourceExtractionId, email, 1)
      : undefined;
    const phoneClaim = phone
      ? detectionClaim(phone.value, input.sourceExtractionId, phone, 0.98)
      : undefined;
    const linkClaims = urls.map((candidate) => ({
      url: detectionClaim(candidate.value, input.sourceExtractionId, candidate, 1),
    }));

    const claimConfidences = [
      ...(emailClaim ? [emailClaim.confidence] : []),
      ...(phoneClaim ? [phoneClaim.confidence] : []),
      ...linkClaims.map((link) => link.url.confidence),
    ];
    const overall =
      claimConfidences.length === 0
        ? 0
        : claimConfidences.reduce((sum, confidence) => sum + confidence, 0) /
          claimConfidences.length;

    const parsedResume: ParsedResume = {
      schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
      resumeVersionId: input.resumeVersionId,
      sourceExtractionId: input.sourceExtractionId,
      parser: {
        name: this.name,
        version: this.version,
        parserPolicyVersion: RESUME_PARSER_POLICY_VERSION,
        evidencePolicyVersion: RESUME_EVIDENCE_POLICY_VERSION,
      },
      ...(emailClaim || phoneClaim
        ? {
            identityCandidate: {
              ...(emailClaim ? { email: emailClaim } : {}),
              ...(phoneClaim ? { phone: phoneClaim } : {}),
            },
          }
        : {}),
      experiences: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      languages: [],
      links: linkClaims,
      locations: [],
      warnings: [
        'Runtime parser is deterministic-only; semantic resume sections require candidate review or a configured AI parser.',
      ],
      confidenceSummary: {
        overall,
        lowConfidenceClaimCount: 0,
        totalClaimCount: claimConfidences.length,
      },
    };

    return Promise.resolve({ parsedResume });
  }
}

function detectionClaim(
  value: string,
  sourceExtractionId: string,
  candidate: {
    pageNumber: number | null;
    blockIndex: number;
    sourceRange: { start: number; end: number };
  },
  confidence: number,
): ParsedClaim<string> {
  return {
    value,
    confidence,
    evidence: [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: candidate.pageNumber,
        blockIndex: candidate.blockIndex,
        sourceRange: candidate.sourceRange,
        evidenceKind: 'DIRECT_TEXT',
      },
    ],
    warnings: [],
  };
}
