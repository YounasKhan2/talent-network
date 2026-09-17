import {
  classifyCareerSectionHeading,
  type CareerPassportSectionTypeKey,
  type DocumentGraphNode,
  type ResumeDocumentGraphV1,
  type ResumeStructuralDocumentV1,
  type ResumeStructuralRecord,
  type ResumeStructuralSection,
} from '@talent-network/contracts';

import type {
  ParsedCertification,
  ParsedClaim,
  ParsedDateRange,
  ParsedEducation,
  ParsedExperience,
  ParsedIdentityCandidate,
  ParsedSkill,
} from './contracts.js';
import type { ResumeSourceLedgerDecision } from './source-ledger.js';

export interface ParsedAwardV2 {
  name: ParsedClaim<string>;
  issuer?: ParsedClaim<string>;
  issuedAt?: ParsedClaim<string>;
  details?: ParsedClaim<string>;
}

export interface ResumeCoreTypedExtractionResult {
  identityCandidate?: ParsedIdentityCandidate;
  headline?: ParsedClaim<string>;
  summary?: ParsedClaim<string>;
  experiences: ParsedExperience[];
  education: ParsedEducation[];
  skills: ParsedSkill[];
  certifications: ParsedCertification[];
  awards: ParsedAwardV2[];
  decisions: readonly ResumeSourceLedgerDecision[];
}

type EvidenceLine = { node: DocumentGraphNode; text: string };
type RecordContext = {
  record: ResumeStructuralRecord;
  section: ResumeStructuralSection;
  typeKey: CareerPassportSectionTypeKey;
  lines: EvidenceLine[];
};

type DateMatch = { start: number; end: number; value: ParsedDateRange };

const DATE_RANGE_PATTERN =
  /\b(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?((?:19|20)\d{2})\s*(?:[-–—]|to)\s*(?:(present|current|now)|(?:(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)?((?:19|20)\d{2}))\b/i;
const SINGLE_YEAR_PATTERN = /\b((?:19|20)\d{2})\b/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/;
const ROLE_PATTERN =
  /\b(engineer|developer|architect|manager|director|lead|consultant|specialist|analyst|scientist|designer|administrator|officer|intern|researcher|professor|teacher)\b/i;
const DEGREE_PATTERN =
  /\b(b\.?s\.?|b\.?sc\.?|bachelor|m\.?s\.?|m\.?sc\.?|master|mba|ph\.?d\.?|doctorate|associate|diploma|certificate)\b/i;
const INSTITUTION_PATTERN = /\b(university|college|institute|school|academy)\b/i;
const LOCATION_PATTERN = /^[A-Za-z .'-]+,\s*[A-Za-z .'-]{2,}$/;
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

export function extractCoreResumeFieldsV2(
  graph: ResumeDocumentGraphV1,
  structuralDocument: ResumeStructuralDocumentV1,
): ResumeCoreTypedExtractionResult {
  if (
    graph.resumeVersionId !== structuralDocument.resumeVersionId ||
    graph.sourceExtractionId !== structuralDocument.sourceExtractionId
  ) {
    throw new Error('RESUME_CORE_TYPED_EXTRACTION_SOURCE_MISMATCH');
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const sectionById = new Map(structuralDocument.sections.map((section) => [section.id, section]));
  const contexts: RecordContext[] = structuralDocument.records.flatMap((record) => {
    const section = sectionById.get(record.sectionId);
    if (!section) return [];
    return [
      {
        record,
        section,
        typeKey: classifyCareerSectionHeading(section.headingText ?? '').typeKey,
        lines: evidenceLines(record.nodeIds, nodeById),
      },
    ];
  });

  const experiences: ParsedExperience[] = [];
  const education: ParsedEducation[] = [];
  const skills: ParsedSkill[] = [];
  const certifications: ParsedCertification[] = [];
  const awards: ParsedAwardV2[] = [];
  const decisions: ResumeSourceLedgerDecision[] = [];
  let summary: ParsedClaim<string> | undefined;

  for (const context of contexts) {
    const parsed = extractRecord(context, graph.sourceExtractionId, {
      experienceIndex: experiences.length,
      educationIndex: education.length,
      skillIndex: skills.length,
      certificationIndex: certifications.length,
      awardIndex: awards.length,
    });
    if (!parsed) continue;
    decisions.push(parsed.decision);
    if (parsed.experience) experiences.push(parsed.experience);
    if (parsed.education) education.push(parsed.education);
    if (parsed.skills) skills.push(...parsed.skills);
    if (parsed.certification) certifications.push(parsed.certification);
    if (parsed.award) awards.push(parsed.award);
    if (parsed.summary && !summary) summary = parsed.summary;
  }

  const identity = extractPreambleIdentity(
    structuralDocument.unsectionedNodeIds,
    nodeById,
    graph.sourceExtractionId,
  );
  decisions.push(...identity.decisions);

  return {
    ...(identity.identityCandidate ? { identityCandidate: identity.identityCandidate } : {}),
    ...(identity.headline ? { headline: identity.headline } : {}),
    ...(summary ? { summary } : {}),
    experiences,
    education,
    skills,
    certifications,
    awards,
    decisions,
  };
}

function extractRecord(
  context: RecordContext,
  sourceExtractionId: string,
  indexes: {
    experienceIndex: number;
    educationIndex: number;
    skillIndex: number;
    certificationIndex: number;
    awardIndex: number;
  },
):
  | {
      decision: ResumeSourceLedgerDecision;
      experience?: ParsedExperience;
      education?: ParsedEducation;
      skills?: ParsedSkill[];
      certification?: ParsedCertification;
      award?: ParsedAwardV2;
      summary?: ParsedClaim<string>;
    }
  | undefined {
  if (context.typeKey === 'WORK_EXPERIENCE') {
    const result = parseExperience(context, sourceExtractionId);
    return result
      ? {
          experience: result.value,
          decision: mappedDecision(
            context.record.id,
            result.paths(indexes.experienceIndex),
            result.complete,
          ),
        }
      : { decision: unmappedDecision(context.record.id) };
  }

  if (context.typeKey === 'EDUCATION') {
    const result = parseEducation(context, sourceExtractionId);
    return result
      ? {
          education: result.value,
          decision: mappedDecision(
            context.record.id,
            result.paths(indexes.educationIndex),
            result.complete,
          ),
        }
      : { decision: unmappedDecision(context.record.id) };
  }

  if (context.typeKey === 'SKILLS') {
    const values = parseSkills(context, sourceExtractionId);
    const paths = values.map((_, offset) => `skills[${indexes.skillIndex + offset}].name`);
    return {
      skills: values,
      decision:
        values.length > 0
          ? mappedDecision(context.record.id, paths, true)
          : unmappedDecision(context.record.id),
    };
  }

  if (context.typeKey === 'CERTIFICATIONS') {
    const result = parseCertification(context, sourceExtractionId);
    return result
      ? {
          certification: result.value,
          decision: mappedDecision(
            context.record.id,
            result.paths(indexes.certificationIndex),
            result.complete,
          ),
        }
      : { decision: unmappedDecision(context.record.id) };
  }

  if (context.typeKey === 'AWARDS') {
    const value = parseAward(context, sourceExtractionId);
    return value
      ? {
          award: value,
          decision: mappedDecision(context.record.id, [`awards[${indexes.awardIndex}].name`], true),
        }
      : { decision: unmappedDecision(context.record.id) };
  }

  if (context.typeKey === 'PROFESSIONAL_SUMMARY') {
    const value = parseSummary(context, sourceExtractionId);
    return {
      ...(value ? { summary: value } : {}),
      decision: value
        ? mappedDecision(context.record.id, ['summary'], true)
        : unmappedDecision(context.record.id),
    };
  }

  return undefined;
}

function parseExperience(
  context: RecordContext,
  sourceExtractionId: string,
): { value: ParsedExperience; complete: boolean; paths: (index: number) => string[] } | undefined {
  const dateLine = context.lines.find((line) => findDateRange(line.text));
  const dateMatch = dateLine ? findDateRange(dateLine.text) : undefined;
  const roleLine = context.lines.find((line) => ROLE_PATTERN.test(stripDate(line.text)));
  if (!roleLine && !dateLine) return undefined;

  const split = roleLine ? splitRoleCompany(stripDate(roleLine.text)) : undefined;
  const roleText = split?.role ?? (roleLine ? stripDate(roleLine.text) : undefined);
  let companyLine: EvidenceLine | undefined;
  let companyText = split?.company;
  if (!companyText && roleLine) {
    const roleIndex = context.lines.indexOf(roleLine);
    companyLine = context.lines
      .slice(roleIndex + 1)
      .find(
        (line) => line !== dateLine && !LOCATION_PATTERN.test(line.text) && !isBullet(line.text),
      );
    companyText = companyLine?.text.trim();
  }
  const locationLine = context.lines.find((line) => LOCATION_PATTERN.test(line.text));
  const role =
    roleLine && roleText ? claim(roleText, roleLine, sourceExtractionId, 0.93) : undefined;
  const company =
    split && roleLine
      ? claim(split.company, roleLine, sourceExtractionId, 0.91)
      : companyLine && companyText
        ? claim(companyText, companyLine, sourceExtractionId, 0.91)
        : undefined;
  const location = locationLine
    ? claim(locationLine.text, locationLine, sourceExtractionId, 0.88)
    : undefined;
  const dates =
    dateLine && dateMatch
      ? dateClaim(dateMatch, dateLine, sourceExtractionId, context.record.recordBoundaryConfidence)
      : undefined;
  const highlights = context.lines
    .filter((line) => isBullet(line.text))
    .map((line) => claim(cleanBullet(line.text), line, sourceExtractionId, 0.9))
    .filter((value): value is ParsedClaim<string> => value !== undefined);

  if (!role && !company && !dates) return undefined;
  const value: ParsedExperience = {
    ...(role ? { role } : {}),
    ...(company ? { company } : {}),
    ...(location ? { location } : {}),
    ...(dates ? { dates } : {}),
    highlights,
  };
  return {
    value,
    complete: Boolean(role && company && dates),
    paths: (index) => [
      ...(role ? [`experiences[${index}].role`] : []),
      ...(company ? [`experiences[${index}].company`] : []),
      ...(location ? [`experiences[${index}].location`] : []),
      ...(dates ? [`experiences[${index}].dates`] : []),
      ...highlights.map((_, i) => `experiences[${index}].highlights[${i}]`),
    ],
  };
}

function parseEducation(
  context: RecordContext,
  sourceExtractionId: string,
): { value: ParsedEducation; complete: boolean; paths: (index: number) => string[] } | undefined {
  const degreeLine = context.lines.find((line) => DEGREE_PATTERN.test(line.text));
  const degreeInstitution = degreeLine
    ? splitDegreeInstitution(stripDate(degreeLine.text))
    : undefined;
  const separateInstitutionLine = context.lines.find(
    (line) => line !== degreeLine && INSTITUTION_PATTERN.test(line.text),
  );
  const institutionLine = degreeInstitution ? degreeLine : separateInstitutionLine;
  const locationLine = context.lines.find(
    (line) =>
      line !== degreeLine && line !== separateInstitutionLine && LOCATION_PATTERN.test(line.text),
  );
  const dateLine = context.lines.find(
    (line) => findDateRange(line.text) || SINGLE_YEAR_PATTERN.test(line.text),
  );
  const qualificationText =
    degreeInstitution?.qualification ?? (degreeLine ? stripDate(degreeLine.text) : null);
  const institutionText = degreeInstitution?.institution ?? separateInstitutionLine?.text.trim();
  const qualification =
    degreeLine && qualificationText
      ? claim(qualificationText, degreeLine, sourceExtractionId, 0.93)
      : undefined;
  const institution =
    institutionLine && institutionText
      ? claim(institutionText, institutionLine, sourceExtractionId, 0.93)
      : undefined;
  const location = locationLine
    ? claim(locationLine.text, locationLine, sourceExtractionId, 0.88)
    : undefined;
  const dates = dateLine ? educationDateClaim(dateLine, sourceExtractionId) : undefined;
  if (!qualification && !institution && !dates) return undefined;
  const details = context.lines
    .filter(
      (line) =>
        line !== degreeLine &&
        line !== separateInstitutionLine &&
        line !== locationLine &&
        line !== dateLine,
    )
    .map((line) => claim(cleanBullet(line.text), line, sourceExtractionId, 0.84))
    .filter((value): value is ParsedClaim<string> => value !== undefined);
  const value: ParsedEducation = {
    ...(institution ? { institution } : {}),
    ...(qualification ? { qualification } : {}),
    ...(location ? { location } : {}),
    ...(dates ? { dates } : {}),
    details,
  };
  return {
    value,
    complete: Boolean(institution && qualification),
    paths: (index) => [
      ...(institution ? [`education[${index}].institution`] : []),
      ...(qualification ? [`education[${index}].qualification`] : []),
      ...(location ? [`education[${index}].location`] : []),
      ...(dates ? [`education[${index}].dates`] : []),
      ...details.map((_, i) => `education[${index}].details[${i}]`),
    ],
  };
}

function splitDegreeInstitution(
  value: string,
): { qualification: string; institution: string } | undefined {
  const parts = value
    .split(/\s+[—–-]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return undefined;
  const qualification = parts[0];
  const institution = parts.slice(1).join(' — ');
  return qualification &&
    institution &&
    DEGREE_PATTERN.test(qualification) &&
    INSTITUTION_PATTERN.test(institution)
    ? { qualification, institution }
    : undefined;
}

function parseSkills(context: RecordContext, sourceExtractionId: string): ParsedSkill[] {
  const output: ParsedSkill[] = [];
  const seen = new Set<string>();
  for (const line of context.lines) {
    const text = line.text.includes(':') ? line.text.slice(line.text.indexOf(':') + 1) : line.text;
    for (const token of text
      .split(/[,;•·|]/)
      .map((value) => cleanBullet(value).trim())
      .filter(Boolean)) {
      if (token.length < 2 || token.length > 80) continue;
      const key = token.toLocaleLowerCase('en-US');
      if (seen.has(key)) continue;
      const name = claim(token, line, sourceExtractionId, 0.9);
      if (!name) continue;
      seen.add(key);
      output.push({ name });
    }
  }
  return output;
}

function parseCertification(
  context: RecordContext,
  sourceExtractionId: string,
):
  | {
      value: ParsedCertification;
      complete: boolean;
      paths: (index: number) => string[];
    }
  | undefined {
  const lines = preferredTableCells(context.lines);
  const nameLine = lines.find((line) => !isDateOnly(line.text));
  if (!nameLine) return undefined;
  const name = claim(nameLine.text, nameLine, sourceExtractionId, 0.94);
  if (!name) return undefined;

  const issuedLine = lines.find((line) => isDateOnly(line.text));
  const nonDateLines = lines.filter((line) => line !== nameLine && line !== issuedLine);
  const issuerLine = nonDateLines.find((line) => !looksLikeCredential(line.text));
  const credentialLine = nonDateLines.find(
    (line) => line !== issuerLine && looksLikeCredential(line.text),
  );
  const fallbackCredentialLine = credentialLine ?? nonDateLines.find((line) => line !== issuerLine);

  const issuer = issuerLine
    ? claim(issuerLine.text, issuerLine, sourceExtractionId, 0.88)
    : undefined;
  const issuedAt = issuedLine
    ? claim(issuedLine.text, issuedLine, sourceExtractionId, 0.86)
    : undefined;
  const credentialIdText = fallbackCredentialLine
    ? extractCredentialId(fallbackCredentialLine.text)
    : null;
  const credentialId =
    fallbackCredentialLine && credentialIdText
      ? claim(credentialIdText, fallbackCredentialLine, sourceExtractionId, 0.94)
      : undefined;
  const expiryText = fallbackCredentialLine ? extractExpiryYear(fallbackCredentialLine.text) : null;
  const expiresAt =
    fallbackCredentialLine && expiryText
      ? claim(expiryText, fallbackCredentialLine, sourceExtractionId, 0.86)
      : undefined;

  const value: ParsedCertification = {
    name,
    ...(issuer ? { issuer } : {}),
    ...(issuedAt ? { issuedAt } : {}),
    ...(credentialId ? { credentialId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };

  return {
    value,
    complete: Boolean(name && issuer),
    paths: (index) => [
      `certifications[${index}].name`,
      ...(issuer ? [`certifications[${index}].issuer`] : []),
      ...(issuedAt ? [`certifications[${index}].issuedAt`] : []),
      ...(credentialId ? [`certifications[${index}].credentialId`] : []),
      ...(expiresAt ? [`certifications[${index}].expiresAt`] : []),
    ],
  };
}

function looksLikeCredential(value: string): boolean {
  return /credential|\b(?:fake|id)[-_:\s]|[-_][A-Z0-9]{3,}/i.test(value.trim());
}

function extractCredentialId(value: string): string | null {
  const withoutExpiry = value.replace(/\(?\s*expires?\s+(?:19|20)\d{2}\s*\)?/gi, ' ').trim();
  const normalized = withoutExpiry
    .replace(/^credential(?:\s+id)?\s*:?\s*/i, '')
    .replace(/^id\s*:?\s*/i, '')
    .trim();
  return normalized || null;
}

function extractExpiryYear(value: string): string | null {
  return value.match(/expires?\s+((?:19|20)\d{2})/i)?.[1] ?? null;
}

function parseAward(context: RecordContext, sourceExtractionId: string): ParsedAwardV2 | undefined {
  const nameLine = context.lines.find((line) => !isDateOnly(line.text));
  if (!nameLine) return undefined;
  const name = claim(cleanBullet(nameLine.text), nameLine, sourceExtractionId, 0.93);
  if (!name) return undefined;
  const issuedLine = context.lines.find((line) => line !== nameLine && isDateOnly(line.text));
  const issuerLine = context.lines.find(
    (line) => line !== nameLine && line !== issuedLine && !isBullet(line.text),
  );
  const detailsLine = context.lines.find((line) => line !== nameLine && isBullet(line.text));
  const issuer = issuerLine
    ? claim(issuerLine.text, issuerLine, sourceExtractionId, 0.86)
    : undefined;
  const issuedAt = issuedLine
    ? claim(issuedLine.text, issuedLine, sourceExtractionId, 0.86)
    : undefined;
  const details = detailsLine
    ? claim(cleanBullet(detailsLine.text), detailsLine, sourceExtractionId, 0.84)
    : undefined;
  return {
    name,
    ...(issuer ? { issuer } : {}),
    ...(issuedAt ? { issuedAt } : {}),
    ...(details ? { details } : {}),
  };
}

function parseSummary(
  context: RecordContext,
  sourceExtractionId: string,
): ParsedClaim<string> | undefined {
  const lines = context.lines.filter((line) => line.text.length >= 20);
  const value = lines
    .map((line) => line.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length < 20) return undefined;
  const evidence = lines.flatMap((line) =>
    evidenceFor(line, sourceExtractionId, 'SECTION_CONTEXT'),
  );
  return evidence.length > 0 ? { value, confidence: 0.94, evidence, warnings: [] } : undefined;
}

function extractPreambleIdentity(
  nodeIds: readonly string[],
  nodeById: ReadonlyMap<string, DocumentGraphNode>,
  sourceExtractionId: string,
): {
  identityCandidate?: ParsedIdentityCandidate;
  headline?: ParsedClaim<string>;
  decisions: ResumeSourceLedgerDecision[];
} {
  const lines = evidenceLines(nodeIds, nodeById);
  let fullName: ParsedClaim<string> | undefined;
  let email: ParsedClaim<string> | undefined;
  let phone: ParsedClaim<string> | undefined;
  let headline: ParsedClaim<string> | undefined;
  const pathsByNode = new Map<string, string[]>();

  for (const line of lines) {
    const emailMatch = line.text.match(EMAIL_PATTERN);
    if (emailMatch && !email) {
      email = claim(emailMatch[0], line, sourceExtractionId, 0.99);
      if (email) addPath(pathsByNode, line.node.id, 'identityCandidate.email');
    }
    const phoneMatch = line.text.match(PHONE_PATTERN);
    if (phoneMatch && !phone) {
      phone = claim(phoneMatch[0], line, sourceExtractionId, 0.97);
      if (phone) addPath(pathsByNode, line.node.id, 'identityCandidate.phone');
    }
  }

  const textLines = lines.filter(
    (line) =>
      !EMAIL_PATTERN.test(line.text) &&
      !PHONE_PATTERN.test(line.text) &&
      !/https?:\/\//i.test(line.text),
  );
  const nameLine = textLines.find((line) => looksLikeName(line.text));
  if (nameLine) {
    fullName = claim(nameLine.text, nameLine, sourceExtractionId, 0.92);
    if (fullName) addPath(pathsByNode, nameLine.node.id, 'identityCandidate.fullName');
    const nameIndex = textLines.indexOf(nameLine);
    const headlineLine = textLines
      .slice(nameIndex + 1)
      .find((line) => ROLE_PATTERN.test(line.text));
    if (headlineLine) {
      headline = claim(headlineLine.text, headlineLine, sourceExtractionId, 0.9);
      if (headline) addPath(pathsByNode, headlineLine.node.id, 'headline');
    }
  }

  const decisions = nodeIds.map((sourceId): ResumeSourceLedgerDecision => {
    const paths = pathsByNode.get(sourceId) ?? [];
    return paths.length > 0
      ? {
          sourceId,
          status: 'MAPPED',
          semanticTypeKey: 'CONTACT_INFORMATION',
          mappedClaimIds: paths,
          reviewRequired: false,
        }
      : {
          sourceId,
          status: 'UNMAPPED',
          semanticTypeKey: 'CONTACT_INFORMATION',
          reasonCode: 'PREAMBLE_CONTENT_NOT_CORE_CONTACT',
          reviewRequired: true,
        };
  });
  const identityCandidate =
    fullName || email || phone
      ? {
          ...(fullName ? { fullName } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
        }
      : undefined;
  return {
    ...(identityCandidate ? { identityCandidate } : {}),
    ...(headline ? { headline } : {}),
    decisions,
  };
}

function evidenceLines(
  nodeIds: readonly string[],
  nodeById: ReadonlyMap<string, DocumentGraphNode>,
): EvidenceLine[] {
  return nodeIds
    .map((id) => nodeById.get(id))
    .filter((node): node is DocumentGraphNode => Boolean(node?.text?.trim()))
    .filter((node) => node.kind !== 'TABLE' && node.kind !== 'LIST' && node.kind !== 'LINK')
    .filter(
      (node) =>
        !(
          node.kind === 'TABLE_ROW' &&
          node.childIds.some((id) => nodeById.get(id)?.kind === 'TABLE_CELL')
        ),
    )
    .sort((a, b) => a.readingOrder - b.readingOrder)
    .map((node) => ({ node, text: node.text?.trim() ?? '' }));
}

function preferredTableCells(lines: readonly EvidenceLine[]): readonly EvidenceLine[] {
  const cells = lines.filter((line) => line.node.kind === 'TABLE_CELL');
  return cells.length > 0 ? cells : lines;
}

function claim(
  value: string,
  line: EvidenceLine,
  sourceExtractionId: string,
  confidence: number,
): ParsedClaim<string> | undefined {
  const text = value.trim();
  const evidence = evidenceFor(line, sourceExtractionId, 'DIRECT_TEXT');
  return text && evidence.length > 0
    ? { value: text, confidence, evidence, warnings: [] }
    : undefined;
}

function evidenceFor(
  line: EvidenceLine,
  sourceExtractionId: string,
  evidenceKind: 'DIRECT_TEXT' | 'SECTION_CONTEXT',
): ParsedClaim<string>['evidence'] {
  const range = line.node.sourceRange;
  if (!range) return [];
  const blockIndex = line.node.metadata?.blockIndex;
  return [
    {
      resumeExtractionId: sourceExtractionId,
      pageNumber: line.node.pageNumber,
      ...(typeof blockIndex === 'number' ? { blockIndex } : {}),
      sourceRange: { start: range.start, end: range.end },
      evidenceKind,
    },
  ];
}

function dateClaim(
  match: DateMatch,
  line: EvidenceLine,
  sourceExtractionId: string,
  boundaryConfidence: number,
): ParsedClaim<ParsedDateRange> | undefined {
  const range = line.node.sourceRange;
  if (!range) return undefined;
  const blockIndex = line.node.metadata?.blockIndex;
  return {
    value: match.value,
    confidence: Math.min(0.96, Math.max(0.8, boundaryConfidence)),
    evidence: [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: line.node.pageNumber,
        ...(typeof blockIndex === 'number' ? { blockIndex } : {}),
        sourceRange: { start: range.start + match.start, end: range.start + match.end },
        evidenceKind: 'DERIVED_DATE',
      },
    ],
    warnings: [],
  };
}

function educationDateClaim(
  line: EvidenceLine,
  sourceExtractionId: string,
): ParsedClaim<ParsedDateRange> | undefined {
  const range = findDateRange(line.text);
  if (range) return dateClaim(range, line, sourceExtractionId, 0.9);
  const yearMatch = line.text.match(SINGLE_YEAR_PATTERN);
  if (!yearMatch?.[1]) return undefined;
  const evidence = evidenceFor(line, sourceExtractionId, 'DIRECT_TEXT');
  return evidence.length > 0
    ? { value: { end: yearMatch[1] }, confidence: 0.88, evidence, warnings: [] }
    : undefined;
}

function findDateRange(text: string): DateMatch | undefined {
  const match = DATE_RANGE_PATTERN.exec(text);
  if (!match || match.index === undefined || !match[2]) return undefined;
  const startMonth = normalizeMonth(match[1]);
  const endMonth = normalizeMonth(match[4]);
  const endYear = match[5];
  return {
    start: match.index,
    end: match.index + match[0].length,
    value: {
      start: startMonth ? `${match[2]}-${startMonth}` : match[2],
      ...(match[3]
        ? { isCurrent: true }
        : endYear
          ? { end: endMonth ? `${endYear}-${endMonth}` : endYear }
          : {}),
    },
  };
}

function normalizeMonth(value: string | undefined): string | undefined {
  return value ? MONTHS[value.toLocaleLowerCase('en-US')] : undefined;
}

function splitRoleCompany(text: string): { role: string; company: string } | undefined {
  const parts = text
    .split(/\s+[—–-]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const role = parts[0];
  const company = parts[1];
  return role && company && ROLE_PATTERN.test(role) ? { role, company } : undefined;
}

function stripDate(text: string): string {
  const match = findDateRange(text);
  if (match) {
    return `${text.slice(0, match.start)} ${text.slice(match.end)}`.replace(/\s+/g, ' ').trim();
  }
  return text.replace(SINGLE_YEAR_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

function mappedDecision(
  sourceId: string,
  claimIds: readonly string[],
  complete: boolean,
): ResumeSourceLedgerDecision {
  return {
    sourceId,
    status: complete ? 'MAPPED' : 'PARTIALLY_MAPPED',
    mappedClaimIds: [...claimIds],
    reviewRequired: !complete,
  };
}

function unmappedDecision(sourceId: string): ResumeSourceLedgerDecision {
  return {
    sourceId,
    status: 'UNMAPPED',
    reasonCode: 'CORE_EXTRACTOR_NO_CONFIDENT_MATCH',
    reviewRequired: true,
  };
}

function isBullet(text: string): boolean {
  return /^\s*[•●◦▪*-]\s+/.test(text);
}

function cleanBullet(text: string): string {
  return text.replace(/^\s*[•●◦▪*-]\s*/, '').trim();
}

function isDateOnly(text: string): boolean {
  return /^(?:issued\s+)?(?:19|20)\d{2}$/i.test(text.trim()) || Boolean(findDateRange(text));
}

function looksLikeName(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return (
    words.length >= 2 &&
    words.length <= 6 &&
    !/\d|@|https?:\/\//i.test(text) &&
    words.every((word) => /^[A-Za-z][A-Za-z.'’-]*$/.test(word))
  );
}

function addPath(map: Map<string, string[]>, nodeId: string, path: string): void {
  const paths = map.get(nodeId) ?? [];
  paths.push(path);
  map.set(nodeId, paths);
}
