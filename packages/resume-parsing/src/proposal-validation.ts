import type {
  ParsedClaim,
  ParsedEvidence,
  ParsedResume,
  ParsedResumeConfidenceSummary,
} from './contracts.js';
import type { PreprocessedResumeDocument, ResumeSourceFragment } from './preprocessing.js';
import { RESUME_PARSER_POLICY_VERSION } from './versions.js';

export const RESUME_CONFIDENCE_POLICY = {
  version: RESUME_PARSER_POLICY_VERSION,
  highThreshold: 0.85,
  reviewThreshold: 0.65,
} as const;

export type ResumeConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ResumeProposalValidationResult {
  confidencePolicyVersion: typeof RESUME_CONFIDENCE_POLICY.version;
  confidenceSummary: ParsedResumeConfidenceSummary;
  claimCount: number;
  evidenceCount: number;
}

export class ResumeProposalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumeProposalValidationError';
  }
}

export function classifyResumeClaimConfidence(confidence: number): ResumeConfidenceBand {
  assertConfidence(confidence, 'claim confidence');
  if (confidence >= RESUME_CONFIDENCE_POLICY.highThreshold) return 'HIGH';
  if (confidence >= RESUME_CONFIDENCE_POLICY.reviewThreshold) return 'MEDIUM';
  return 'LOW';
}

export function validateResumeProposal(
  parsedResume: ParsedResume,
  preprocessedDocument: PreprocessedResumeDocument,
  expectedSourceExtractionId: string,
): ResumeProposalValidationResult {
  if (parsedResume.resumeVersionId !== preprocessedDocument.resumeVersionId) {
    fail('Parsed resume and preprocessed document must belong to the same ResumeVersion.');
  }

  if (parsedResume.sourceExtractionId !== expectedSourceExtractionId) {
    fail('Parsed resume sourceExtractionId does not match the expected extraction.');
  }

  const claims = collectParsedClaims(parsedResume);
  let evidenceCount = 0;

  for (const [path, claim] of claims) {
    assertConfidence(claim.confidence, `${path}.confidence`);

    if (claim.evidence.length === 0) {
      fail(`${path} must contain at least one source evidence reference.`);
    }

    if (classifyResumeClaimConfidence(claim.confidence) === 'LOW' && claim.warnings.length === 0) {
      fail(`${path} is low confidence and must surface a review warning.`);
    }

    for (const evidence of claim.evidence) {
      validateEvidence(
        evidence,
        preprocessedDocument,
        expectedSourceExtractionId,
        `${path}.evidence`,
      );
      evidenceCount += 1;
    }
  }

  const confidenceSummary = deriveConfidenceSummary(claims.map(([, claim]) => claim));
  assertConfidenceSummaryMatches(parsedResume.confidenceSummary, confidenceSummary);

  return {
    confidencePolicyVersion: RESUME_CONFIDENCE_POLICY.version,
    confidenceSummary,
    claimCount: claims.length,
    evidenceCount,
  };
}

function validateEvidence(
  evidence: ParsedEvidence,
  document: PreprocessedResumeDocument,
  expectedSourceExtractionId: string,
  path: string,
): void {
  if (evidence.resumeExtractionId !== expectedSourceExtractionId) {
    fail(`${path} references a different ResumeExtraction.`);
  }

  if (evidence.sourceRange.start < 0 || evidence.sourceRange.end <= evidence.sourceRange.start) {
    fail(`${path} contains an empty or invalid source range.`);
  }

  const matchingFragments = collectSourceFragments(document).filter((fragment) => {
    if (fragment.pageNumber !== evidence.pageNumber) return false;
    if (evidence.blockIndex !== undefined && fragment.blockIndex !== evidence.blockIndex)
      return false;
    return (
      evidence.sourceRange.start >= fragment.sourceRange.start &&
      evidence.sourceRange.end <= fragment.sourceRange.end
    );
  });

  if (matchingFragments.length === 0) {
    fail(`${path} does not map to a real preprocessed source fragment.`);
  }
}

function collectSourceFragments(document: PreprocessedResumeDocument): ResumeSourceFragment[] {
  const fragments: ResumeSourceFragment[] = [];
  const seen = new Set<string>();

  for (const section of document.sections) {
    for (const fragment of section.fragments) {
      const key = [
        fragment.pageNumber ?? 'null',
        fragment.blockIndex,
        fragment.segmentIndex,
        fragment.sourceRange.start,
        fragment.sourceRange.end,
      ].join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      fragments.push(fragment);
    }
  }

  return fragments;
}

function collectParsedClaims(parsedResume: ParsedResume): Array<[string, ParsedClaim<unknown>]> {
  const claims: Array<[string, ParsedClaim<unknown>]> = [];
  const push = <T>(path: string, claim: ParsedClaim<T> | undefined): void => {
    if (claim) claims.push([path, claim]);
  };

  push('identityCandidate.fullName', parsedResume.identityCandidate?.fullName);
  push('identityCandidate.email', parsedResume.identityCandidate?.email);
  push('identityCandidate.phone', parsedResume.identityCandidate?.phone);
  push('headline', parsedResume.headline);
  push('summary', parsedResume.summary);

  parsedResume.experiences.forEach((item, index) => {
    push(`experiences[${index}].company`, item.company);
    push(`experiences[${index}].role`, item.role);
    push(`experiences[${index}].location`, item.location);
    push(`experiences[${index}].dates`, item.dates);
    push(`experiences[${index}].summary`, item.summary);
    item.highlights.forEach((claim, claimIndex) =>
      push(`experiences[${index}].highlights[${claimIndex}]`, claim),
    );
  });

  parsedResume.education.forEach((item, index) => {
    push(`education[${index}].institution`, item.institution);
    push(`education[${index}].qualification`, item.qualification);
    push(`education[${index}].fieldOfStudy`, item.fieldOfStudy);
    push(`education[${index}].location`, item.location);
    push(`education[${index}].dates`, item.dates);
    item.details.forEach((claim, claimIndex) =>
      push(`education[${index}].details[${claimIndex}]`, claim),
    );
  });

  parsedResume.skills.forEach((item, index) => {
    push(`skills[${index}].name`, item.name);
    push(`skills[${index}].category`, item.category);
  });

  parsedResume.projects.forEach((item, index) => {
    push(`projects[${index}].name`, item.name);
    push(`projects[${index}].description`, item.description);
    push(`projects[${index}].url`, item.url);
    item.technologies.forEach((claim, claimIndex) =>
      push(`projects[${index}].technologies[${claimIndex}]`, claim),
    );
  });

  parsedResume.certifications.forEach((item, index) => {
    push(`certifications[${index}].name`, item.name);
    push(`certifications[${index}].issuer`, item.issuer);
    push(`certifications[${index}].issuedAt`, item.issuedAt);
    push(`certifications[${index}].expiresAt`, item.expiresAt);
    push(`certifications[${index}].credentialId`, item.credentialId);
    push(`certifications[${index}].credentialUrl`, item.credentialUrl);
  });

  parsedResume.languages.forEach((item, index) => {
    push(`languages[${index}].name`, item.name);
    push(`languages[${index}].proficiency`, item.proficiency);
  });

  parsedResume.links.forEach((item, index) => {
    push(`links[${index}].label`, item.label);
    push(`links[${index}].url`, item.url);
  });

  parsedResume.locations.forEach((item, index) => {
    push(`locations[${index}].value`, item.value);
  });

  return claims;
}

function deriveConfidenceSummary(claims: ParsedClaim<unknown>[]): ParsedResumeConfidenceSummary {
  if (claims.length === 0) {
    return { overall: 0, lowConfidenceClaimCount: 0, totalClaimCount: 0 };
  }

  const total = claims.reduce((sum, claim) => sum + claim.confidence, 0);
  const lowConfidenceClaimCount = claims.filter(
    (claim) => classifyResumeClaimConfidence(claim.confidence) === 'LOW',
  ).length;

  return {
    overall: total / claims.length,
    lowConfidenceClaimCount,
    totalClaimCount: claims.length,
  };
}

function assertConfidenceSummaryMatches(
  supplied: ParsedResumeConfidenceSummary,
  derived: ParsedResumeConfidenceSummary,
): void {
  assertConfidence(supplied.overall, 'confidenceSummary.overall');
  if (supplied.totalClaimCount !== derived.totalClaimCount) {
    fail('confidenceSummary.totalClaimCount does not match the parsed claims.');
  }
  if (supplied.lowConfidenceClaimCount !== derived.lowConfidenceClaimCount) {
    fail('confidenceSummary.lowConfidenceClaimCount does not match the parsed claims.');
  }
  if (Math.abs(supplied.overall - derived.overall) > 1e-9) {
    fail('confidenceSummary.overall does not match the parsed claims.');
  }
}

function assertConfidence(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${path} must be between 0 and 1.`);
  }
}

function fail(message: string): never {
  throw new ResumeProposalValidationError(message);
}
