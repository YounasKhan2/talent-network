import type {
  ParsedAdditionalSection,
  ParsedClaim,
  ParsedResume,
  ParsedResumeCoverageSection,
  ParsedResumeCoverageSummary,
  ParsedResumeDraft,
  ResumeCoverageSectionKey,
  ResumeParseInput,
  ResumeParser,
} from './contracts.js';
import { LocalDeterministicResumeParser } from './local-parser.js';
import type {
  ResumeCandidateDetection,
  ResumeSectionKind,
  ResumeSourceFragment,
} from './preprocessing.js';

const SECTION_MAP: ReadonlyArray<readonly [ResumeCoverageSectionKey, ResumeSectionKind]> = [
  ['SUMMARY', 'SUMMARY'],
  ['EXPERIENCE', 'EXPERIENCE'],
  ['EDUCATION', 'EDUCATION'],
  ['SKILLS', 'SKILLS'],
  ['PROJECTS', 'PROJECTS'],
  ['CERTIFICATIONS', 'CERTIFICATIONS'],
  ['LANGUAGES', 'LANGUAGES'],
];

export class GroundedResumeParser implements ResumeParser {
  readonly name = 'local-deterministic-resume-parser';
  readonly version = '5';

  private readonly base = new LocalDeterministicResumeParser();

  async parse(input: ResumeParseInput): Promise<ParsedResumeDraft> {
    const draft = await this.base.parse(input);
    const links = buildLinkClaims(input.preprocessedDocument.candidates, input.sourceExtractionId);
    const additionalSections = buildAdditionalSections(input);
    const parsedResume: ParsedResume = {
      ...draft.parsedResume,
      parser: {
        ...draft.parsedResume.parser,
        name: this.name,
        version: this.version,
      },
      links,
      additionalSections,
      coverageSummary: deriveCoverageSummary({ ...draft.parsedResume, links }, input),
      warnings: [
        'Deterministic parser v5 promotes source-grounded canonical claims and preserves additional headed sections losslessly for taxonomy classification and candidate review.',
        'Additional preserved sections are evidence-validated but intentionally excluded from claim-confidence arithmetic until their semantics are classified.',
        'Coverage is section-level completeness across source sections that are actually present; it is separate from claim confidence.',
      ],
    };

    return { ...draft, parsedResume };
  }
}

function buildAdditionalSections(input: ResumeParseInput): ParsedAdditionalSection[] {
  const sections: ParsedAdditionalSection[] = [];

  input.preprocessedDocument.sections.forEach((section, sourceOrder) => {
    if (section.kind !== 'OTHER' || !section.heading || !section.headingFragment) return;

    // The first OTHER section is the resume preamble in our current preprocessing model. It may
    // contain an uppercase candidate name, headline, and contact row, so it must never be promoted
    // as a custom Career Passport section merely because the name resembles a heading.
    if (sourceOrder === 0) return;

    const entryFragments = section.fragments.filter(
      (fragment) => fragment !== section.headingFragment && fragment.text.trim().length > 0,
    );
    if (entryFragments.length === 0) return;

    sections.push({
      sourceOrder,
      heading: sourceFragmentClaim(
        section.heading.trim(),
        input.sourceExtractionId,
        section.headingFragment,
        'DIRECT_TEXT',
      ),
      entries: entryFragments.map((fragment) =>
        sourceFragmentClaim(
          fragment.text.trim(),
          input.sourceExtractionId,
          fragment,
          'SECTION_CONTEXT',
        ),
      ),
    });
  });

  return sections;
}

function sourceFragmentClaim(
  value: string,
  sourceExtractionId: string,
  fragment: ResumeSourceFragment,
  evidenceKind: 'DIRECT_TEXT' | 'SECTION_CONTEXT',
): ParsedClaim<string> {
  return {
    value,
    confidence: 1,
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

function buildLinkClaims(
  candidates: ResumeCandidateDetection[],
  sourceExtractionId: string,
): ParsedResume['links'] {
  const links: ParsedResume['links'] = [];

  for (const candidate of candidates) {
    if (candidate.kind !== 'URL') continue;
    const normalized = normalizeUrl(candidate.value);
    if (!normalized) continue;

    links.push({
      url: detectionClaim(candidate.value, normalized, sourceExtractionId, candidate, 0.99),
    });
  }

  return links;
}

function detectionClaim(
  value: string,
  normalizedValue: string,
  sourceExtractionId: string,
  candidate: ResumeCandidateDetection,
  confidence: number,
): ParsedClaim<string> {
  return {
    value,
    normalizedValue,
    confidence,
    evidence: [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: candidate.pageNumber,
        blockIndex: candidate.blockIndex,
        sourceRange: candidate.sourceRange,
        evidenceKind: candidate.evidenceKind,
      },
    ],
    warnings: [],
  };
}

function normalizeUrl(value: string): string | null {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function deriveCoverageSummary(
  parsedResume: ParsedResume,
  input: ResumeParseInput,
): ParsedResumeCoverageSummary {
  const presentKinds = new Set(input.preprocessedDocument.sections.map((section) => section.kind));
  const sections: ParsedResumeCoverageSection[] = [];

  const identitySourcePresent =
    input.preprocessedDocument.sections.some(
      (section) => section.kind === 'OTHER' && section.fragments.length > 0,
    ) || input.preprocessedDocument.candidates.some((candidate) => candidate.kind !== 'URL');
  const identityDetectedCount = [
    parsedResume.identityCandidate?.fullName,
    parsedResume.identityCandidate?.email,
    parsedResume.identityCandidate?.phone,
    parsedResume.headline,
  ].filter(Boolean).length;
  sections.push(coverageSection('IDENTITY', identitySourcePresent, identityDetectedCount));

  for (const [key, kind] of SECTION_MAP) {
    const sourcePresent = presentKinds.has(kind);
    sections.push(coverageSection(key, sourcePresent, detectedCount(parsedResume, key)));
  }

  const linkSourcePresent = input.preprocessedDocument.candidates.some(
    (candidate) => candidate.kind === 'URL',
  );
  sections.push(coverageSection('LINKS', linkSourcePresent, parsedResume.links.length));

  const sourceSections = sections.filter((section) => section.sourcePresent);
  const coveredSections = sourceSections.filter((section) => section.status === 'DETECTED');
  const sourceSectionCount = sourceSections.length;
  const coveredSectionCount = coveredSections.length;
  const ratio = sourceSectionCount === 0 ? 0 : coveredSectionCount / sourceSectionCount;

  return {
    ratio,
    coveredSectionCount,
    sourceSectionCount,
    status: ratio === 1 && sourceSectionCount > 0 ? 'COMPLETE' : ratio > 0 ? 'PARTIAL' : 'NONE',
    sections,
  };
}

function coverageSection(
  key: ResumeCoverageSectionKey,
  sourcePresent: boolean,
  detectedCount: number,
): ParsedResumeCoverageSection {
  return {
    key,
    sourcePresent,
    detectedCount,
    status: !sourcePresent ? 'NOT_PRESENT' : detectedCount > 0 ? 'DETECTED' : 'MISSED',
  };
}

function detectedCount(parsedResume: ParsedResume, key: ResumeCoverageSectionKey): number {
  switch (key) {
    case 'SUMMARY':
      return parsedResume.summary ? 1 : 0;
    case 'EXPERIENCE':
      return parsedResume.experiences.length;
    case 'EDUCATION':
      return parsedResume.education.length;
    case 'SKILLS':
      return parsedResume.skills.length;
    case 'PROJECTS':
      return parsedResume.projects.length;
    case 'CERTIFICATIONS':
      return parsedResume.certifications.length;
    case 'LANGUAGES':
      return parsedResume.languages.length;
    case 'LINKS':
      return parsedResume.links.length;
    case 'IDENTITY':
      return 0;
  }
}
