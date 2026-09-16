import type {
  ParsedCertification,
  ParsedClaim,
  ParsedDateRange,
  ParsedEducation,
  ParsedEvidence,
  ParsedExperience,
  ParsedIdentityCandidate,
  ParsedLanguage,
  ParsedLink,
  ParsedLocation,
  ParsedProject,
  ParsedResume,
  ParsedResumeCoverageSection,
  ParsedResumeCoverageSummary,
  ParsedSkill,
  ResumeCoverageSectionKey,
} from './contracts.js';
import {
  PARSED_RESUME_SCHEMA_VERSION,
  RESUME_EVIDENCE_POLICY_VERSION,
  RESUME_PARSER_POLICY_VERSION,
} from './versions.js';

const COVERAGE_KEYS: readonly ResumeCoverageSectionKey[] = [
  'IDENTITY',
  'SUMMARY',
  'EXPERIENCE',
  'EDUCATION',
  'SKILLS',
  'PROJECTS',
  'CERTIFICATIONS',
  'LANGUAGES',
  'LINKS',
];

export class ResumeStructuredOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumeStructuredOutputError';
  }
}

export interface ParsedResumeValidationContext {
  resumeVersionId: string;
  sourceExtractionId: string;
}

export function validateParsedResume(
  value: unknown,
  context: ParsedResumeValidationContext,
): ParsedResume {
  const root = record(value, 'ParsedResume');
  if (root.schemaVersion !== PARSED_RESUME_SCHEMA_VERSION) {
    fail('ParsedResume.schemaVersion is unsupported.');
  }
  if (root.resumeVersionId !== context.resumeVersionId) {
    fail('ParsedResume.resumeVersionId does not match the parse input.');
  }
  if (root.sourceExtractionId !== context.sourceExtractionId) {
    fail('ParsedResume.sourceExtractionId does not match the parse input.');
  }

  return {
    schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
    resumeVersionId: stringValue(root.resumeVersionId, 'ParsedResume.resumeVersionId'),
    sourceExtractionId: stringValue(root.sourceExtractionId, 'ParsedResume.sourceExtractionId'),
    parser: parseParserMetadata(root.parser),
    ...(root.identityCandidate === undefined
      ? {}
      : { identityCandidate: parseIdentity(root.identityCandidate) }),
    ...(root.headline === undefined
      ? {}
      : { headline: parseStringClaim(root.headline, 'headline') }),
    ...(root.summary === undefined ? {} : { summary: parseStringClaim(root.summary, 'summary') }),
    experiences: array(root.experiences, 'experiences').map(parseExperience),
    education: array(root.education, 'education').map(parseEducation),
    skills: array(root.skills, 'skills').map(parseSkill),
    projects: array(root.projects, 'projects').map(parseProject),
    certifications: array(root.certifications, 'certifications').map(parseCertification),
    languages: array(root.languages, 'languages').map(parseLanguage),
    links: array(root.links, 'links').map(parseLink),
    locations: array(root.locations, 'locations').map(parseLocation),
    warnings: stringArray(root.warnings, 'warnings'),
    confidenceSummary: parseConfidenceSummary(root.confidenceSummary),
    ...(root.coverageSummary === undefined
      ? {}
      : { coverageSummary: parseCoverageSummary(root.coverageSummary) }),
  };
}

function parseParserMetadata(value: unknown): ParsedResume['parser'] {
  const data = record(value, 'parser');
  if (data.parserPolicyVersion !== RESUME_PARSER_POLICY_VERSION) {
    fail('parser.parserPolicyVersion is unsupported.');
  }
  if (data.evidencePolicyVersion !== RESUME_EVIDENCE_POLICY_VERSION) {
    fail('parser.evidencePolicyVersion is unsupported.');
  }
  return {
    name: stringValue(data.name, 'parser.name'),
    version: stringValue(data.version, 'parser.version'),
    parserPolicyVersion: RESUME_PARSER_POLICY_VERSION,
    evidencePolicyVersion: RESUME_EVIDENCE_POLICY_VERSION,
    ...(data.promptVersion === undefined
      ? {}
      : { promptVersion: stringValue(data.promptVersion, 'parser.promptVersion') }),
    ...(data.provider === undefined
      ? {}
      : { provider: stringValue(data.provider, 'parser.provider') }),
    ...(data.model === undefined ? {} : { model: stringValue(data.model, 'parser.model') }),
  };
}

function parseIdentity(value: unknown): ParsedIdentityCandidate {
  const data = record(value, 'identityCandidate');
  return {
    ...(data.fullName === undefined
      ? {}
      : { fullName: parseStringClaim(data.fullName, 'fullName') }),
    ...(data.email === undefined ? {} : { email: parseStringClaim(data.email, 'email') }),
    ...(data.phone === undefined ? {} : { phone: parseStringClaim(data.phone, 'phone') }),
  };
}

function parseExperience(value: unknown, index: number): ParsedExperience {
  const data = record(value, `experiences[${index}]`);
  return {
    ...(data.company === undefined ? {} : { company: parseStringClaim(data.company, 'company') }),
    ...(data.role === undefined ? {} : { role: parseStringClaim(data.role, 'role') }),
    ...(data.location === undefined
      ? {}
      : { location: parseStringClaim(data.location, 'location') }),
    ...(data.dates === undefined ? {} : { dates: parseDateRangeClaim(data.dates, 'dates') }),
    ...(data.summary === undefined ? {} : { summary: parseStringClaim(data.summary, 'summary') }),
    highlights: array(data.highlights, 'highlights').map((item) =>
      parseStringClaim(item, 'highlight'),
    ),
  };
}

function parseEducation(value: unknown, index: number): ParsedEducation {
  const data = record(value, `education[${index}]`);
  return {
    ...(data.institution === undefined
      ? {}
      : { institution: parseStringClaim(data.institution, 'institution') }),
    ...(data.qualification === undefined
      ? {}
      : { qualification: parseStringClaim(data.qualification, 'qualification') }),
    ...(data.fieldOfStudy === undefined
      ? {}
      : { fieldOfStudy: parseStringClaim(data.fieldOfStudy, 'fieldOfStudy') }),
    ...(data.location === undefined
      ? {}
      : { location: parseStringClaim(data.location, 'location') }),
    ...(data.dates === undefined ? {} : { dates: parseDateRangeClaim(data.dates, 'dates') }),
    details: array(data.details, 'details').map((item) => parseStringClaim(item, 'detail')),
  };
}

function parseSkill(value: unknown, index: number): ParsedSkill {
  const data = record(value, `skills[${index}]`);
  return {
    name: parseStringClaim(data.name, 'skill.name'),
    ...(data.category === undefined
      ? {}
      : { category: parseStringClaim(data.category, 'skill.category') }),
  };
}

function parseProject(value: unknown, index: number): ParsedProject {
  const data = record(value, `projects[${index}]`);
  return {
    ...(data.name === undefined ? {} : { name: parseStringClaim(data.name, 'project.name') }),
    ...(data.description === undefined
      ? {}
      : { description: parseStringClaim(data.description, 'project.description') }),
    ...(data.url === undefined ? {} : { url: parseStringClaim(data.url, 'project.url') }),
    technologies: array(data.technologies, 'project.technologies').map((item) =>
      parseStringClaim(item, 'project.technology'),
    ),
  };
}

function parseCertification(value: unknown, index: number): ParsedCertification {
  const data = record(value, `certifications[${index}]`);
  return {
    name: parseStringClaim(data.name, 'certification.name'),
    ...(data.issuer === undefined ? {} : { issuer: parseStringClaim(data.issuer, 'issuer') }),
    ...(data.issuedAt === undefined
      ? {}
      : { issuedAt: parseStringClaim(data.issuedAt, 'issuedAt') }),
    ...(data.expiresAt === undefined
      ? {}
      : { expiresAt: parseStringClaim(data.expiresAt, 'expiresAt') }),
    ...(data.credentialId === undefined
      ? {}
      : { credentialId: parseStringClaim(data.credentialId, 'credentialId') }),
    ...(data.credentialUrl === undefined
      ? {}
      : { credentialUrl: parseStringClaim(data.credentialUrl, 'credentialUrl') }),
  };
}

function parseLanguage(value: unknown, index: number): ParsedLanguage {
  const data = record(value, `languages[${index}]`);
  return {
    name: parseStringClaim(data.name, 'language.name'),
    ...(data.proficiency === undefined
      ? {}
      : { proficiency: parseStringClaim(data.proficiency, 'language.proficiency') }),
  };
}

function parseLink(value: unknown, index: number): ParsedLink {
  const data = record(value, `links[${index}]`);
  return {
    ...(data.label === undefined ? {} : { label: parseStringClaim(data.label, 'link.label') }),
    url: parseStringClaim(data.url, 'link.url'),
  };
}

function parseLocation(value: unknown, index: number): ParsedLocation {
  const data = record(value, `locations[${index}]`);
  const kind = data.kind;
  if (kind !== undefined && kind !== 'CURRENT' && kind !== 'PREFERRED' && kind !== 'OTHER') {
    fail(`locations[${index}].kind is invalid.`);
  }
  return {
    value: parseStringClaim(data.value, 'location.value'),
    ...(kind === undefined ? {} : { kind }),
  };
}

function parseStringClaim(value: unknown, path: string): ParsedClaim<string> {
  return parseClaim(value, path, (claimValue) => stringValue(claimValue, `${path}.value`));
}

function parseDateRangeClaim(value: unknown, path: string): ParsedClaim<ParsedDateRange> {
  return parseClaim(value, path, (claimValue) => {
    const data = record(claimValue, `${path}.value`);
    return {
      ...(data.start === undefined
        ? {}
        : { start: stringValue(data.start, `${path}.value.start`) }),
      ...(data.end === undefined ? {} : { end: stringValue(data.end, `${path}.value.end`) }),
      ...(data.isCurrent === undefined
        ? {}
        : { isCurrent: booleanValue(data.isCurrent, `${path}.value.isCurrent`) }),
    };
  });
}

function parseClaim<T>(
  value: unknown,
  path: string,
  parseValue: (value: unknown) => T,
): ParsedClaim<T> {
  const data = record(value, path);
  const confidence = numberValue(data.confidence, `${path}.confidence`);
  if (confidence < 0 || confidence > 1) fail(`${path}.confidence must be between 0 and 1.`);

  return {
    value: parseValue(data.value),
    ...(data.normalizedValue === undefined
      ? {}
      : {
          normalizedValue:
            typeof data.normalizedValue === 'string'
              ? data.normalizedValue
              : parseValue(data.normalizedValue),
        }),
    confidence,
    evidence: array(data.evidence, `${path}.evidence`).map(parseEvidence),
    warnings: stringArray(data.warnings, `${path}.warnings`),
  };
}

function parseEvidence(value: unknown, index: number): ParsedEvidence {
  const data = record(value, `evidence[${index}]`);
  const kind = stringValue(data.evidenceKind, 'evidence.evidenceKind');
  if (
    ![
      'DIRECT_TEXT',
      'SECTION_CONTEXT',
      'NORMALIZED_VALUE',
      'DERIVED_DATE',
      'DERIVED_LINK',
    ].includes(kind)
  ) {
    fail('evidence.evidenceKind is invalid.');
  }
  const sourceRange = record(data.sourceRange, 'evidence.sourceRange');
  const start = integerValue(sourceRange.start, 'evidence.sourceRange.start');
  const end = integerValue(sourceRange.end, 'evidence.sourceRange.end');
  if (start < 0 || end < start) fail('evidence.sourceRange is invalid.');

  return {
    resumeExtractionId: stringValue(data.resumeExtractionId, 'evidence.resumeExtractionId'),
    pageNumber:
      data.pageNumber === null ? null : integerValue(data.pageNumber, 'evidence.pageNumber'),
    ...(data.blockIndex === undefined
      ? {}
      : { blockIndex: integerValue(data.blockIndex, 'evidence.blockIndex') }),
    sourceRange: { start, end },
    evidenceKind: kind as ParsedEvidence['evidenceKind'],
  };
}

function parseConfidenceSummary(value: unknown): ParsedResume['confidenceSummary'] {
  const data = record(value, 'confidenceSummary');
  const overall = numberValue(data.overall, 'confidenceSummary.overall');
  if (overall < 0 || overall > 1) fail('confidenceSummary.overall must be between 0 and 1.');
  return {
    overall,
    lowConfidenceClaimCount: nonNegativeInteger(
      data.lowConfidenceClaimCount,
      'confidenceSummary.lowConfidenceClaimCount',
    ),
    totalClaimCount: nonNegativeInteger(data.totalClaimCount, 'confidenceSummary.totalClaimCount'),
  };
}

function parseCoverageSummary(value: unknown): ParsedResumeCoverageSummary {
  const data = record(value, 'coverageSummary');
  const ratio = numberValue(data.ratio, 'coverageSummary.ratio');
  if (ratio < 0 || ratio > 1) fail('coverageSummary.ratio must be between 0 and 1.');

  const coveredSectionCount = nonNegativeInteger(
    data.coveredSectionCount,
    'coverageSummary.coveredSectionCount',
  );
  const sourceSectionCount = nonNegativeInteger(
    data.sourceSectionCount,
    'coverageSummary.sourceSectionCount',
  );
  if (coveredSectionCount > sourceSectionCount) {
    fail('coverageSummary.coveredSectionCount cannot exceed sourceSectionCount.');
  }

  const seen = new Set<string>();
  const sections = array(data.sections, 'coverageSummary.sections').map((item, index) => {
    const section = parseCoverageSection(item, index);
    if (seen.has(section.key)) fail(`coverageSummary.sections contains duplicate ${section.key}.`);
    seen.add(section.key);
    return section;
  });

  const derivedSourceCount = sections.filter((section) => section.sourcePresent).length;
  const derivedCoveredCount = sections.filter(
    (section) => section.sourcePresent && section.status === 'DETECTED',
  ).length;
  if (sourceSectionCount !== derivedSourceCount || coveredSectionCount !== derivedCoveredCount) {
    fail('coverageSummary counts do not match coverageSummary.sections.');
  }

  const derivedRatio = sourceSectionCount === 0 ? 0 : coveredSectionCount / sourceSectionCount;
  if (Math.abs(ratio - derivedRatio) > 1e-9) {
    fail('coverageSummary.ratio does not match coverageSummary counts.');
  }

  const status = stringValue(data.status, 'coverageSummary.status');
  const derivedStatus =
    ratio === 1 && sourceSectionCount > 0 ? 'COMPLETE' : ratio > 0 ? 'PARTIAL' : 'NONE';
  if (status !== derivedStatus) fail('coverageSummary.status does not match coverageSummary.ratio.');

  return {
    ratio,
    coveredSectionCount,
    sourceSectionCount,
    status: derivedStatus,
    sections,
  };
}

function parseCoverageSection(value: unknown, index: number): ParsedResumeCoverageSection {
  const data = record(value, `coverageSummary.sections[${index}]`);
  const key = stringValue(data.key, `coverageSummary.sections[${index}].key`);
  if (!isCoverageSectionKey(key)) {
    fail(`coverageSummary.sections[${index}].key is invalid.`);
  }
  const sourcePresent = booleanValue(
    data.sourcePresent,
    `coverageSummary.sections[${index}].sourcePresent`,
  );
  const detectedCount = nonNegativeInteger(
    data.detectedCount,
    `coverageSummary.sections[${index}].detectedCount`,
  );
  const status = stringValue(data.status, `coverageSummary.sections[${index}].status`);
  const expectedStatus = !sourcePresent ? 'NOT_PRESENT' : detectedCount > 0 ? 'DETECTED' : 'MISSED';
  if (status !== expectedStatus) {
    fail(`coverageSummary.sections[${index}].status is inconsistent.`);
  }

  return {
    key,
    sourcePresent,
    detectedCount,
    status: expectedStatus,
  };
}

function isCoverageSectionKey(value: string): value is ResumeCoverageSectionKey {
  return COVERAGE_KEYS.some((key) => key === value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    fail(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} must be an array.`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => stringValue(item, `${path}[${index}]`));
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${path} must be a non-empty string.`);
  return value;
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(`${path} must be a finite number.`);
  return value;
}

function integerValue(value: unknown, path: string): number {
  const result = numberValue(value, path);
  if (!Number.isInteger(result)) fail(`${path} must be an integer.`);
  return result;
}

function nonNegativeInteger(value: unknown, path: string): number {
  const result = integerValue(value, path);
  if (result < 0) fail(`${path} must be non-negative.`);
  return result;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path} must be a boolean.`);
  return value;
}

function fail(message: string): never {
  throw new ResumeStructuredOutputError(message);
}
