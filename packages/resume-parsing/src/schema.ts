import type {
  ParsedCertification,
  ParsedClaim,
  ParsedEducation,
  ParsedEvidence,
  ParsedExperience,
  ParsedIdentityCandidate,
  ParsedLanguage,
  ParsedLink,
  ParsedLocation,
  ParsedProject,
  ParsedResume,
  ParsedSkill,
} from './contracts.js';
import { PARSED_RESUME_SCHEMA_VERSION } from './versions.js';

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

  const parsed: ParsedResume = {
    schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
    resumeVersionId: stringValue(root.resumeVersionId, 'ParsedResume.resumeVersionId'),
    sourceExtractionId: stringValue(root.sourceExtractionId, 'ParsedResume.sourceExtractionId'),
    parser: parseParserMetadata(root.parser),
    ...(root.identityCandidate === undefined
      ? {}
      : { identityCandidate: parseIdentity(root.identityCandidate) }),
    ...(root.headline === undefined ? {} : { headline: parseStringClaim(root.headline, 'headline') }),
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
  };

  return parsed;
}

function parseParserMetadata(value: unknown): ParsedResume['parser'] {
  const data = record(value, 'parser');
  return {
    name: stringValue(data.name, 'parser.name'),
    version: stringValue(data.version, 'parser.version'),
    parserPolicyVersion: literalString(data.parserPolicyVersion, 'parser.parserPolicyVersion'),
    evidencePolicyVersion: literalString(data.evidencePolicyVersion, 'parser.evidencePolicyVersion'),
    ...(data.promptVersion === undefined
      ? {}
      : { promptVersion: stringValue(data.promptVersion, 'parser.promptVersion') }),
    ...(data.provider === undefined ? {} : { provider: stringValue(data.provider, 'parser.provider') }),
    ...(data.model === undefined ? {} : { model: stringValue(data.model, 'parser.model') }),
  };
}

function parseIdentity(value: unknown): ParsedIdentityCandidate {
  const data = record(value, 'identityCandidate');
  return {
    ...(data.fullName === undefined ? {} : { fullName: parseStringClaim(data.fullName, 'fullName') }),
    ...(data.email === undefined ? {} : { email: parseStringClaim(data.email, 'email') }),
    ...(data.phone === undefined ? {} : { phone: parseStringClaim(data.phone, 'phone') }),
  };
}

function parseExperience(value: unknown, index: number): ParsedExperience {
  const data = record(value, `experiences[${index}]`);
  return {
    ...(data.company === undefined ? {} : { company: parseStringClaim(data.company, 'company') }),
    ...(data.role === undefined ? {} : { role: parseStringClaim(data.role, 'role') }),
    ...(data.location === undefined ? {} : { location: parseStringClaim(data.location, 'location') }),
    ...(data.dates === undefined ? {} : { dates: parseDateRangeClaim(data.dates, 'dates') }),
    ...(data.summary === undefined ? {} : { summary: parseStringClaim(data.summary, 'summary') }),
    highlights: array(data.highlights, 'highlights').map((item) => parseStringClaim(item, 'highlight')),
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
    ...(data.location === undefined ? {} : { location: parseStringClaim(data.location, 'location') }),
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
    ...(data.issuedAt === undefined ? {} : { issuedAt: parseStringClaim(data.issuedAt, 'issuedAt') }),
    ...(data.expiresAt === undefined ? {} : { expiresAt: parseStringClaim(data.expiresAt, 'expiresAt') }),
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

function parseDateRangeClaim(value: unknown, path: string): ParsedClaim<ParsedExperience['dates'] extends ParsedClaim<infer T> ? T : never> {
  return parseClaim(value, path, (claimValue) => {
    const data = record(claimValue, `${path}.value`);
    return {
      ...(data.start === undefined ? {} : { start: stringValue(data.start, `${path}.value.start`) }),
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
      : { normalizedValue: parseNormalizedValue(data.normalizedValue, `${path}.normalizedValue`) }),
    confidence,
    evidence: array(data.evidence, `${path}.evidence`).map(parseEvidence),
    warnings: stringArray(data.warnings, `${path}.warnings`),
  };
}

function parseEvidence(value: unknown, index: number): ParsedEvidence {
  const data = record(value, `evidence[${index}]`);
  const kind = stringValue(data.evidenceKind, 'evidence.evidenceKind');
  if (!['DIRECT_TEXT', 'SECTION_CONTEXT', 'NORMALIZED_VALUE', 'DERIVED_DATE', 'DERIVED_LINK'].includes(kind)) {
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

function parseNormalizedValue(value: unknown, path: string): string | object {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value;
  fail(`${path} must be a string or object.`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object.`);
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

function literalString<T extends string>(value: unknown, path: string): T {
  return stringValue(value, path) as T;
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path} must be a finite number.`);
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
