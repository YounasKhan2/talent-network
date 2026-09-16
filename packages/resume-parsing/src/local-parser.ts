import type {
  ParsedClaim,
  ParsedResume,
  ParsedResumeDraft,
  ResumeParseInput,
  ResumeParser,
} from './contracts.js';
import type {
  PreprocessedResumeDocument,
  ResumePreprocessedSection,
  ResumeSourceFragment,
} from './preprocessing.js';
import {
  PARSED_RESUME_SCHEMA_VERSION,
  RESUME_EVIDENCE_POLICY_VERSION,
  RESUME_PARSER_POLICY_VERSION,
} from './versions.js';

export class LocalDeterministicResumeParser implements ResumeParser {
  readonly name = 'local-deterministic-resume-parser';
  readonly version = '2';

  parse(input: ResumeParseInput): Promise<ParsedResumeDraft> {
    const email = input.preprocessedDocument.candidates.find(
      (candidate) => candidate.kind === 'EMAIL',
    );
    const phone = input.preprocessedDocument.candidates.find(
      (candidate) => candidate.kind === 'PHONE',
    );
    const urls = input.preprocessedDocument.candidates.filter(
      (candidate) => candidate.kind === 'URL',
    );

    const emailClaim = email
      ? detectionClaim(email.value, input.sourceExtractionId, email, 1)
      : undefined;
    const phoneClaim = phone
      ? detectionClaim(phone.value, input.sourceExtractionId, phone, 0.98)
      : undefined;
    const linkClaims = urls.map((candidate) => ({
      url: detectionClaim(candidate.value, input.sourceExtractionId, candidate, 1),
    }));

    const preamble = findPreambleSection(input.preprocessedDocument);
    const identity = deriveIdentityClaims(preamble, input.sourceExtractionId);
    const summary = deriveSummaryClaim(input.preprocessedDocument, input.sourceExtractionId);
    const skills = deriveSkillClaims(input.preprocessedDocument, input.sourceExtractionId);

    const claimConfidences = [
      ...(identity.fullName ? [identity.fullName.confidence] : []),
      ...(emailClaim ? [emailClaim.confidence] : []),
      ...(phoneClaim ? [phoneClaim.confidence] : []),
      ...(identity.headline ? [identity.headline.confidence] : []),
      ...(summary ? [summary.confidence] : []),
      ...skills.flatMap((skill) => [
        skill.name.confidence,
        ...(skill.category ? [skill.category.confidence] : []),
      ]),
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
      ...(identity.fullName || emailClaim || phoneClaim
        ? {
            identityCandidate: {
              ...(identity.fullName ? { fullName: identity.fullName } : {}),
              ...(emailClaim ? { email: emailClaim } : {}),
              ...(phoneClaim ? { phone: phoneClaim } : {}),
            },
          }
        : {}),
      ...(identity.headline ? { headline: identity.headline } : {}),
      ...(summary ? { summary } : {}),
      experiences: [],
      education: [],
      skills,
      projects: [],
      certifications: [],
      languages: [],
      links: linkClaims,
      locations: [],
      warnings: [
        'Deterministic parser v2 only promotes source-grounded identity, summary, contact, link, and skill claims. Experience, education, projects, certifications, languages, and locations still require stronger record grouping before promotion.',
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

function findPreambleSection(
  document: PreprocessedResumeDocument,
): ResumePreprocessedSection | undefined {
  const firstSection = document.sections[0];
  return firstSection?.kind === 'OTHER' && firstSection.fragments.length > 0
    ? firstSection
    : undefined;
}

function deriveIdentityClaims(
  section: ResumePreprocessedSection | undefined,
  sourceExtractionId: string,
): { fullName?: ParsedClaim<string>; headline?: ParsedClaim<string> } {
  if (!section) return {};

  const contentFragments = section.fragments.filter((fragment) =>
    isIdentityTextFragment(fragment.text),
  );
  if (contentFragments.length === 0) return {};

  const nameFragment = contentFragments.find((fragment) =>
    looksLikePersonName(fragment.text),
  );
  const headlineFragment = nameFragment
    ? contentFragments.find(
        (fragment) =>
          fragment !== nameFragment &&
          fragment.sourceRange.start > nameFragment.sourceRange.end &&
          looksLikeHeadline(fragment.text),
      )
    : undefined;

  return {
    ...(nameFragment
      ? {
          fullName: fragmentClaim(
            nameFragment.text.trim(),
            sourceExtractionId,
            nameFragment,
            0.9,
            'DIRECT_TEXT',
          ),
        }
      : {}),
    ...(headlineFragment
      ? {
          headline: fragmentClaim(
            headlineFragment.text.trim(),
            sourceExtractionId,
            headlineFragment,
            0.86,
            'DIRECT_TEXT',
          ),
        }
      : {}),
  };
}

function deriveSummaryClaim(
  document: PreprocessedResumeDocument,
  sourceExtractionId: string,
): ParsedClaim<string> | undefined {
  const section = document.sections.find((candidate) => candidate.kind === 'SUMMARY');
  if (!section) return undefined;

  const fragments = section.fragments.filter(
    (fragment) => fragment !== section.headingFragment,
  );
  const text = fragments
    .map((fragment) => fragment.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 20) return undefined;

  return {
    value: text,
    confidence: 0.95,
    evidence: fragments.map((fragment) => ({
      resumeExtractionId: sourceExtractionId,
      pageNumber: fragment.pageNumber,
      blockIndex: fragment.blockIndex,
      sourceRange: fragment.sourceRange,
      evidenceKind: 'SECTION_CONTEXT' as const,
    })),
    warnings: [],
  };
}

function deriveSkillClaims(
  document: PreprocessedResumeDocument,
  sourceExtractionId: string,
): ParsedResume['skills'] {
  const sections = document.sections.filter((section) => section.kind === 'SKILLS');
  const output: ParsedResume['skills'] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    for (const fragment of section.fragments) {
      if (fragment === section.headingFragment) continue;

      for (const token of splitSkillFragment(fragment.text)) {
        const normalized = token.value.toLocaleLowerCase('en-US');
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        output.push({
          name: {
            value: token.value,
            normalizedValue: normalized,
            confidence: token.confidence,
            evidence: [
              {
                resumeExtractionId: sourceExtractionId,
                pageNumber: fragment.pageNumber,
                blockIndex: fragment.blockIndex,
                sourceRange: {
                  start: fragment.sourceRange.start + token.start,
                  end: fragment.sourceRange.start + token.end,
                },
                evidenceKind: 'DIRECT_TEXT',
              },
            ],
            warnings: [],
          },
          ...(token.category
            ? {
                category: fragmentClaim(
                  token.category,
                  sourceExtractionId,
                  fragment,
                  0.88,
                  'SECTION_CONTEXT',
                ),
              }
            : {}),
        });
      }
    }
  }

  return output;
}

function splitSkillFragment(text: string): Array<{
  value: string;
  start: number;
  end: number;
  confidence: number;
  category?: string;
}> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const colonIndex = text.indexOf(':');
  const category = colonIndex >= 0 ? text.slice(0, colonIndex).trim() : undefined;
  const contentStart = colonIndex >= 0 ? colonIndex + 1 : 0;
  const content = text.slice(contentStart);
  const results: Array<{
    value: string;
    start: number;
    end: number;
    confidence: number;
    category?: string;
  }> = [];

  const tokenPattern = /[^,|•·;\n]+/g;
  for (const match of content.matchAll(tokenPattern)) {
    if (match.index === undefined) continue;
    const raw = match[0];
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (!looksLikeSkillValue(value)) continue;

    const start = contentStart + match.index + leadingWhitespace;
    results.push({
      value,
      start,
      end: start + value.length,
      confidence: category ? 0.96 : 0.9,
      ...(category ? { category } : {}),
    });
  }

  return results;
}

function looksLikePersonName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 70) return false;
  if (/\d|@|https?:\/\//i.test(trimmed)) return false;
  if (/[|•]/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  if (!words.every((word) => /^[A-Za-z][A-Za-z'.-]*$/.test(word))) return false;

  return words.every(
    (word) => word === word.toUpperCase() || /^[A-Z][a-z'.-]+$/.test(word),
  );
}

function looksLikeHeadline(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 120) return false;
  if (/\d{4}|@|https?:\/\//i.test(trimmed)) return false;
  if (/^\+?[\d ()-]{7,}$/.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 12;
}

function isIdentityTextFragment(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/@|https?:\/\//i.test(trimmed)) return false;
  if (/^\+?[\d ()-]{7,}$/.test(trimmed)) return false;
  return true;
}

function looksLikeSkillValue(value: string): boolean {
  if (value.length < 1 || value.length > 80) return false;
  if (/^(skills?|technical skills?|core skills?|competencies|technologies)$/i.test(value)) {
    return false;
  }
  if (/^\d{4}\s*[-–—]/.test(value)) return false;
  if (/[.!?]$/.test(value) && value.split(/\s+/).length > 5) return false;
  return /[A-Za-z0-9+#.]/.test(value);
}

function fragmentClaim(
  value: string,
  sourceExtractionId: string,
  fragment: ResumeSourceFragment,
  confidence: number,
  evidenceKind: 'DIRECT_TEXT' | 'SECTION_CONTEXT',
): ParsedClaim<string> {
  return {
    value,
    confidence,
    evidence: [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: fragment.pageNumber,
        blockIndex: fragment.blockIndex,
        sourceRange: fragment.sourceRange,
        evidenceKind,
      },
    ],
    warnings: [],
  };
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
