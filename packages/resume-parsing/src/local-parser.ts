import type {
  ParsedClaim,
  ParsedDateRange,
  ParsedEducation,
  ParsedExperience,
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

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

const DATE_RANGE_PATTERN =
  /(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?((?:19|20)\d{2})\s*[-–—]\s*(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?((?:19|20)\d{2}|Present|Current)/i;
const SINGLE_YEAR_PATTERN = /(?:Graduated\s+)?((?:19|20)\d{2})$/i;
const ROLE_KEYWORD_PATTERN =
  /\b(developer|engineer|architect|designer|manager|lead|consultant|specialist|analyst|intern|administrator|scientist)\b/i;
const BULLET_PATTERN = /^\s*[•●◦▪*-]\s*/;
const SKILL_CATEGORY_PREFIXES = [
  'Databases & Cloud',
  'Backend & APIs',
  'Mobile & Tools',
  'Engineering Tools',
  'DevOps & Cloud',
  'AI Integration',
  'AI & Security',
  'Databases',
  'Frontend',
  'Backend',
] as const;

export class LocalDeterministicResumeParser implements ResumeParser {
  readonly name = 'local-deterministic-resume-parser';
  readonly version = '3';

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
      url: {
        ...detectionClaim(candidate.value, input.sourceExtractionId, candidate, 0.99),
        normalizedValue: normalizeUrl(candidate.value),
      },
    }));

    const preamble = findPreambleSection(input.preprocessedDocument);
    const identity = deriveIdentityClaims(preamble, input.sourceExtractionId);
    const summary = deriveSummaryClaim(input.preprocessedDocument, input.sourceExtractionId);
    const skills = deriveSkillClaims(input.preprocessedDocument, input.sourceExtractionId);
    const experiences = deriveExperienceClaims(
      input.preprocessedDocument,
      input.sourceExtractionId,
    );
    const education = deriveEducationClaims(input.preprocessedDocument, input.sourceExtractionId);

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
      ...experiences.flatMap(experienceConfidences),
      ...education.flatMap(educationConfidences),
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
      experiences,
      education,
      skills,
      projects: [],
      certifications: [],
      languages: [],
      links: linkClaims,
      locations: [],
      warnings: [
        'Deterministic parser v3 promotes only source-grounded identity, summary, contact, link, skill, experience, and education claims. Ambiguous record layouts and remaining resume sections stay unpromoted for candidate review.',
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

  const nameFragment = contentFragments.find((fragment) => looksLikePersonName(fragment.text));
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
            0.9,
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

  const fragments = section.fragments.filter((fragment) => fragment !== section.headingFragment);
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
          name: fragmentRangeClaim(
            token.value,
            sourceExtractionId,
            fragment,
            token.start,
            token.end,
            token.confidence,
            'DIRECT_TEXT',
          ),
          ...(token.category
            ? {
                category: fragmentRangeClaim(
                  token.category.value,
                  sourceExtractionId,
                  fragment,
                  token.category.start,
                  token.category.end,
                  0.9,
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

function deriveExperienceClaims(
  document: PreprocessedResumeDocument,
  sourceExtractionId: string,
): ParsedExperience[] {
  const output: ParsedExperience[] = [];

  for (const section of document.sections.filter((candidate) => candidate.kind === 'EXPERIENCE')) {
    const fragments = section.fragments.filter((fragment) => fragment !== section.headingFragment);
    let index = 0;

    while (index < fragments.length) {
      const fragment = fragments[index];
      if (!fragment || isBullet(fragment.text)) {
        index += 1;
        continue;
      }

      const inline = parseInlineExperience(fragment, sourceExtractionId);
      if (inline) {
        const { highlights, nextIndex } = collectHighlights(
          fragments,
          index + 1,
          sourceExtractionId,
        );
        output.push({ ...inline, highlights });
        index = nextIndex;
        continue;
      }

      const next = fragments[index + 1];
      const paired = next ? parsePairedExperience(fragment, next, sourceExtractionId) : undefined;
      if (paired) {
        const { highlights, nextIndex } = collectHighlights(
          fragments,
          index + 2,
          sourceExtractionId,
        );
        output.push({ ...paired, highlights });
        index = nextIndex;
        continue;
      }

      index += 1;
    }
  }

  return output;
}

function deriveEducationClaims(
  document: PreprocessedResumeDocument,
  sourceExtractionId: string,
): ParsedEducation[] {
  const output: ParsedEducation[] = [];

  for (const section of document.sections.filter((candidate) => candidate.kind === 'EDUCATION')) {
    const fragments = section.fragments.filter((fragment) => fragment !== section.headingFragment);
    if (fragments.length === 0) continue;

    const first = fragments[0];
    if (!first) continue;

    const inline = parseInlineEducation(first, sourceExtractionId);
    if (inline) {
      output.push({
        ...inline,
        details: fragments
          .slice(1)
          .map((fragment) =>
            fragmentClaim(
              cleanBullet(fragment.text),
              sourceExtractionId,
              fragment,
              0.86,
              'SECTION_CONTEXT',
            ),
          ),
      });
      continue;
    }

    const second = fragments[1];
    const paired = second ? parsePairedEducation(first, second, sourceExtractionId) : undefined;
    if (paired) {
      output.push({
        ...paired,
        details: fragments
          .slice(2)
          .map((fragment) =>
            fragmentClaim(
              cleanBullet(fragment.text),
              sourceExtractionId,
              fragment,
              0.86,
              'SECTION_CONTEXT',
            ),
          ),
      });
    }
  }

  return output;
}

function parseInlineExperience(
  fragment: ResumeSourceFragment,
  sourceExtractionId: string,
): Omit<ParsedExperience, 'highlights'> | undefined {
  const segments = splitPipeSegments(fragment.text);
  if (segments.length < 2) return undefined;

  const dateMatch = findDateRange(fragment.text);
  if (!dateMatch) return undefined;

  const roleSegment = segments[0];
  const companySegment = segments[1];
  if (!roleSegment || !companySegment || !looksLikeRoleTitle(roleSegment.value)) return undefined;

  const companyValue = removeDateText(companySegment.value, dateMatch.raw).trim();
  const locationSegment = segments[2];
  const locationValue = locationSegment
    ? removeDateText(locationSegment.value, dateMatch.raw).trim()
    : '';
  const companyEnd = companySegment.start + companyValue.length;

  return {
    role: fragmentRangeClaim(
      roleSegment.value,
      sourceExtractionId,
      fragment,
      roleSegment.start,
      roleSegment.end,
      0.94,
      'DIRECT_TEXT',
    ),
    company: fragmentRangeClaim(
      companyValue,
      sourceExtractionId,
      fragment,
      companySegment.start,
      companyEnd,
      0.93,
      'DIRECT_TEXT',
    ),
    ...(locationSegment && locationValue
      ? {
          location: fragmentRangeClaim(
            locationValue,
            sourceExtractionId,
            fragment,
            locationSegment.start,
            locationSegment.start + locationValue.length,
            0.9,
            'DIRECT_TEXT',
          ),
        }
      : {}),
    dates: dateRangeClaim(dateMatch, sourceExtractionId, fragment, 0.96),
  };
}

function parsePairedExperience(
  roleFragment: ResumeSourceFragment,
  organizationFragment: ResumeSourceFragment,
  sourceExtractionId: string,
): Omit<ParsedExperience, 'highlights'> | undefined {
  if (isBullet(roleFragment.text) || isBullet(organizationFragment.text)) return undefined;

  const dateMatch = findDateRange(roleFragment.text);
  const roleValue = dateMatch
    ? removeDateText(roleFragment.text, dateMatch.raw).trim()
    : roleFragment.text.trim();
  if (!looksLikeRoleTitle(roleValue)) return undefined;

  const organizationSegments = splitPipeSegments(organizationFragment.text);
  const companySegment = organizationSegments[0];
  if (!companySegment || !looksLikeOrganization(companySegment.value)) return undefined;
  const locationSegment = organizationSegments[1];

  return {
    role: fragmentRangeClaim(
      roleValue,
      sourceExtractionId,
      roleFragment,
      roleFragment.text.indexOf(roleValue),
      roleFragment.text.indexOf(roleValue) + roleValue.length,
      dateMatch ? 0.94 : 0.84,
      'DIRECT_TEXT',
    ),
    company: fragmentRangeClaim(
      companySegment.value,
      sourceExtractionId,
      organizationFragment,
      companySegment.start,
      companySegment.end,
      dateMatch ? 0.93 : 0.84,
      'DIRECT_TEXT',
    ),
    ...(locationSegment
      ? {
          location: fragmentRangeClaim(
            locationSegment.value,
            sourceExtractionId,
            organizationFragment,
            locationSegment.start,
            locationSegment.end,
            0.9,
            'DIRECT_TEXT',
          ),
        }
      : {}),
    ...(dateMatch
      ? { dates: dateRangeClaim(dateMatch, sourceExtractionId, roleFragment, 0.96) }
      : {}),
  };
}

function collectHighlights(
  fragments: ResumeSourceFragment[],
  startIndex: number,
  sourceExtractionId: string,
): { highlights: ParsedClaim<string>[]; nextIndex: number } {
  const highlights: ParsedClaim<string>[] = [];
  let index = startIndex;

  while (index < fragments.length) {
    const fragment = fragments[index];
    if (!fragment || !isBullet(fragment.text)) break;

    const raw = fragment.text;
    const prefix = raw.match(BULLET_PATTERN)?.[0] ?? '';
    const value = raw.slice(prefix.length).trim();
    const valueStart = raw.indexOf(value, prefix.length);
    highlights.push(
      fragmentRangeClaim(
        value,
        sourceExtractionId,
        fragment,
        valueStart,
        valueStart + value.length,
        0.94,
        'DIRECT_TEXT',
      ),
    );
    index += 1;
  }

  return { highlights, nextIndex: index };
}

function parseInlineEducation(
  fragment: ResumeSourceFragment,
  sourceExtractionId: string,
): Omit<ParsedEducation, 'details'> | undefined {
  const segments = splitPipeSegments(fragment.text);
  if (segments.length < 2) return undefined;

  const qualification = segments[0];
  const institution = segments[1];
  if (!qualification || !institution) return undefined;

  const yearMatch = findSingleYear(fragment.text);
  const institutionValue = yearMatch
    ? removeDateText(institution.value, yearMatch.raw).trim()
    : institution.value;

  return {
    qualification: fragmentRangeClaim(
      qualification.value,
      sourceExtractionId,
      fragment,
      qualification.start,
      qualification.end,
      0.94,
      'DIRECT_TEXT',
    ),
    institution: fragmentRangeClaim(
      institutionValue,
      sourceExtractionId,
      fragment,
      institution.start,
      institution.start + institutionValue.length,
      0.93,
      'DIRECT_TEXT',
    ),
    ...(yearMatch
      ? {
          dates: singleYearClaim(yearMatch, sourceExtractionId, fragment, 0.94),
        }
      : {}),
  };
}

function parsePairedEducation(
  qualificationFragment: ResumeSourceFragment,
  institutionFragment: ResumeSourceFragment,
  sourceExtractionId: string,
): Omit<ParsedEducation, 'details'> | undefined {
  const yearMatch = findSingleYear(qualificationFragment.text);
  const qualificationValue = yearMatch
    ? removeDateText(qualificationFragment.text, yearMatch.raw).trim()
    : qualificationFragment.text.trim();
  const institutionValue = institutionFragment.text.trim();

  if (!looksLikeQualification(qualificationValue) || !looksLikeOrganization(institutionValue)) {
    return undefined;
  }

  return {
    qualification: fragmentRangeClaim(
      qualificationValue,
      sourceExtractionId,
      qualificationFragment,
      qualificationFragment.text.indexOf(qualificationValue),
      qualificationFragment.text.indexOf(qualificationValue) + qualificationValue.length,
      0.94,
      'DIRECT_TEXT',
    ),
    institution: fragmentClaim(
      institutionValue,
      sourceExtractionId,
      institutionFragment,
      0.93,
      'DIRECT_TEXT',
    ),
    ...(yearMatch
      ? { dates: singleYearClaim(yearMatch, sourceExtractionId, qualificationFragment, 0.94) }
      : {}),
  };
}

function splitSkillFragment(text: string): Array<{
  value: string;
  start: number;
  end: number;
  confidence: number;
  category?: { value: string; start: number; end: number };
}> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const categoryMatch = findSkillCategory(text);
  const contentStart = categoryMatch?.contentStart ?? 0;
  const content = text.slice(contentStart);
  const results: Array<{
    value: string;
    start: number;
    end: number;
    confidence: number;
    category?: { value: string; start: number; end: number };
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
      confidence: categoryMatch ? 0.96 : 0.9,
      ...(categoryMatch
        ? {
            category: {
              value: categoryMatch.value,
              start: categoryMatch.start,
              end: categoryMatch.end,
            },
          }
        : {}),
    });
  }

  return results;
}

function findSkillCategory(
  text: string,
): { value: string; start: number; end: number; contentStart: number } | undefined {
  const colonIndex = text.indexOf(':');
  if (colonIndex >= 0) {
    const raw = text.slice(0, colonIndex);
    const value = raw.trim();
    const start = raw.indexOf(value);
    return { value, start, end: start + value.length, contentStart: colonIndex + 1 };
  }

  const leadingWhitespace = text.length - text.trimStart().length;
  const trimmed = text.trimStart();
  for (const category of SKILL_CATEGORY_PREFIXES) {
    if (!trimmed.toLowerCase().startsWith(category.toLowerCase())) continue;
    const boundary = trimmed[category.length];
    if (boundary && !/\s/.test(boundary)) continue;
    const start = leadingWhitespace;
    return {
      value: trimmed.slice(0, category.length),
      start,
      end: start + category.length,
      contentStart: start + category.length,
    };
  }

  return undefined;
}

function findDateRange(text: string): ParsedDateMatch | undefined {
  const match = DATE_RANGE_PATTERN.exec(text);
  if (!match || match.index === undefined) return undefined;

  const startYear = match[2];
  const endToken = match[4];
  if (!startYear || !endToken) return undefined;

  const startMonth = match[1] ? MONTHS[match[1].toLowerCase()] : undefined;
  const endMonth = match[3] ? MONTHS[match[3].toLowerCase()] : undefined;
  const isCurrent = /^(present|current)$/i.test(endToken);

  return {
    raw: match[0],
    start: match.index,
    end: match.index + match[0].length,
    value: {
      start: startMonth ? `${startYear}-${startMonth}` : startYear,
      ...(isCurrent
        ? { isCurrent: true }
        : { end: endMonth ? `${endToken}-${endMonth}` : endToken }),
    },
  };
}

function findSingleYear(text: string): SingleYearMatch | undefined {
  const match = SINGLE_YEAR_PATTERN.exec(text.trim());
  if (!match || !match[1]) return undefined;
  const rawIndex = text.lastIndexOf(match[0]);
  return {
    raw: match[0],
    year: match[1],
    start: rawIndex,
    end: rawIndex + match[0].length,
  };
}

function dateRangeClaim(
  match: ParsedDateMatch,
  sourceExtractionId: string,
  fragment: ResumeSourceFragment,
  confidence: number,
): ParsedClaim<ParsedDateRange> {
  return {
    value: match.value,
    confidence,
    evidence: [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: fragment.pageNumber,
        blockIndex: fragment.blockIndex,
        sourceRange: {
          start: fragment.sourceRange.start + match.start,
          end: fragment.sourceRange.start + match.end,
        },
        evidenceKind: 'DERIVED_DATE',
      },
    ],
    warnings: [],
  };
}

function singleYearClaim(
  match: SingleYearMatch,
  sourceExtractionId: string,
  fragment: ResumeSourceFragment,
  confidence: number,
): ParsedClaim<ParsedDateRange> {
  return {
    value: { end: match.year },
    confidence,
    evidence: [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: fragment.pageNumber,
        blockIndex: fragment.blockIndex,
        sourceRange: {
          start: fragment.sourceRange.start + match.start,
          end: fragment.sourceRange.start + match.end,
        },
        evidenceKind: 'DERIVED_DATE',
      },
    ],
    warnings: [],
  };
}

function splitPipeSegments(text: string): TextSegment[] {
  const output: TextSegment[] = [];
  const pattern = /[^|]+/g;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (!value) continue;
    const start = match.index + leading;
    output.push({ value, start, end: start + value.length });
  }
  return output;
}

function looksLikePersonName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 70) return false;
  if (/\d|@|https?:\/\//i.test(trimmed)) return false;
  if (/[|•]/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  if (!words.every((word) => /^[A-Za-z][A-Za-z'.-]*$/.test(word))) return false;

  return words.every((word) => word === word.toUpperCase() || /^[A-Z][a-z'.-]+$/.test(word));
}

function looksLikeHeadline(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 160) return false;
  if (/\d{4}|@|https?:\/\//i.test(trimmed)) return false;
  if (/^\+?[\d ()-]{7,}$/.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 20;
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

function looksLikeRoleTitle(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && trimmed.length <= 120 && ROLE_KEYWORD_PATTERN.test(trimmed);
}

function looksLikeOrganization(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return false;
  if (isBullet(trimmed) || /@|https?:\/\//i.test(trimmed)) return false;
  return /[A-Za-z]/.test(trimmed);
}

function looksLikeQualification(value: string): boolean {
  return /\b(bachelor|master|phd|doctor|diploma|degree|bsc|bs|msc|ms|mba)\b/i.test(value);
}

function isBullet(value: string): boolean {
  return BULLET_PATTERN.test(value);
}

function cleanBullet(value: string): string {
  return value.replace(BULLET_PATTERN, '').trim();
}

function removeDateText(value: string, rawDate: string): string {
  return value.replace(rawDate, '').trim();
}

function normalizeUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
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

function fragmentRangeClaim(
  value: string,
  sourceExtractionId: string,
  fragment: ResumeSourceFragment,
  localStart: number,
  localEnd: number,
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
        sourceRange: {
          start: fragment.sourceRange.start + localStart,
          end: fragment.sourceRange.start + localEnd,
        },
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

function experienceConfidences(item: ParsedExperience): number[] {
  return [
    ...(item.company ? [item.company.confidence] : []),
    ...(item.role ? [item.role.confidence] : []),
    ...(item.location ? [item.location.confidence] : []),
    ...(item.dates ? [item.dates.confidence] : []),
    ...(item.summary ? [item.summary.confidence] : []),
    ...item.highlights.map((claim) => claim.confidence),
  ];
}

function educationConfidences(item: ParsedEducation): number[] {
  return [
    ...(item.institution ? [item.institution.confidence] : []),
    ...(item.qualification ? [item.qualification.confidence] : []),
    ...(item.fieldOfStudy ? [item.fieldOfStudy.confidence] : []),
    ...(item.location ? [item.location.confidence] : []),
    ...(item.dates ? [item.dates.confidence] : []),
    ...item.details.map((claim) => claim.confidence),
  ];
}

interface TextSegment {
  value: string;
  start: number;
  end: number;
}

interface ParsedDateMatch {
  raw: string;
  start: number;
  end: number;
  value: ParsedDateRange;
}

interface SingleYearMatch {
  raw: string;
  year: string;
  start: number;
  end: number;
}
