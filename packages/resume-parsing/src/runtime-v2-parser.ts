import {
  classifyCareerSectionHeading,
  type CareerPassportSectionTypeKey,
  type DocumentGraphNode,
  type ResumeDocumentGraphV1,
  type ResumeRecordReconciliation,
  type ResumeSourceCoverageSummary,
  type ResumeStructuralDocumentV1,
} from '@talent-network/contracts';

import {
  extractCoreResumeFieldsV2,
  type ResumeCoreTypedExtractionResult,
} from './core-typed-extraction.js';
import { buildResumeDocumentGraph, type ResumeDocumentGraphSource } from './document-graph.js';
import {
  extractExtensionResumeFieldsV2,
  type ParsedOpenWorldRecordV2,
} from './extension-typed-extraction.js';
import type {
  ParsedAdditionalSection,
  ParsedAward,
  ParsedClaim,
  ParsedIdentityCandidate,
  ParsedLink,
  ParsedResume,
  ParsedResumeConfidenceSummary,
  ParsedResumeCoverageSection,
  ParsedResumeCoverageSummary,
  ParsedResumeDraft,
  ResumeCoverageSectionKey,
  ResumeParseInput,
  ResumeParser,
} from './contracts.js';
import { ResumeProposalValidationError } from './proposal-validation.js';
import { buildResumeSourceLedger, type ResumeSourceLedgerDecision } from './source-ledger.js';
import { detectResumeStructure } from './structural-detection.js';
import {
  PARSED_RESUME_SCHEMA_VERSION,
  RESUME_EVIDENCE_POLICY_VERSION,
  RESUME_PARSER_POLICY_VERSION,
} from './versions.js';

const RUNTIME_V2_SCHEMA_VERSION = 'resume-intelligence-runtime-v2' as const;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/;
const HTTP_URL_PATTERN = /https?:\/\/[^\s)>\]}]+/i;

const LEGACY_COVERAGE_MAP: ReadonlyArray<
  readonly [ResumeCoverageSectionKey, CareerPassportSectionTypeKey]
> = [
  ['SUMMARY', 'PROFESSIONAL_SUMMARY'],
  ['EXPERIENCE', 'WORK_EXPERIENCE'],
  ['EDUCATION', 'EDUCATION'],
  ['SKILLS', 'SKILLS'],
  ['PROJECTS', 'PROJECTS'],
  ['CERTIFICATIONS', 'CERTIFICATIONS'],
  ['LANGUAGES', 'LANGUAGES'],
  ['LINKS', 'PROFESSIONAL_LINKS'],
];

/**
 * Phase 3G runtime parser.
 *
 * The V2 structural pipeline owns extraction. This adapter only translates its grounded output into
 * the existing ParsedResume proposal shape so Phase 3F candidate review remains backward-compatible.
 * It never falls back to the legacy flattened-text parser for unresolved V2 fields.
 */
export class ResumeIntelligenceV2Parser implements ResumeParser {
  readonly name = 'resume-intelligence-v2-parser';
  readonly version = '1';

  parse(input: ResumeParseInput): Promise<ParsedResumeDraft> {
    const sourceDocument = input.sourceDocument;
    if (!sourceDocument) {
      throw new ResumeProposalValidationError(
        'Resume Intelligence V2 requires the verified source ResumeDocument.',
      );
    }

    assertSourceIdentity(sourceDocument, input.resumeVersionId);

    const graph = buildResumeDocumentGraph({
      sourceExtractionId: input.sourceExtractionId,
      document: sourceDocument,
    });
    const structuralDocument = detectResumeStructure(graph);
    const core = extractCoreResumeFieldsV2(graph, structuralDocument);
    const extensions = extractExtensionResumeFieldsV2(graph, structuralDocument);
    const contact = extractHeadedContactFields(
      graph,
      structuralDocument,
      input.sourceExtractionId,
      extensions.links.length,
    );
    const sourceLedger = buildResumeSourceLedger({
      structuralDocument,
      decisions: [...core.decisions, ...extensions.decisions, ...contact.decisions],
    });

    const awards = core.awards.map(toParsedAward);
    const identityCandidate = mergeIdentityCandidates(
      core.identityCandidate,
      contact.identityCandidate,
    );
    const links = [...extensions.links, ...contact.links];
    const additionalSections = [
      ...buildAdditionalSections(
        graph,
        structuralDocument,
        extensions.additionalSections,
        input.sourceExtractionId,
      ),
      ...buildAwardCompatibilitySections(graph, structuralDocument, core, input.sourceExtractionId),
    ].sort((left, right) => left.sourceOrder - right.sourceOrder);

    const base: Omit<ParsedResume, 'confidenceSummary' | 'coverageSummary'> = {
      schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
      resumeVersionId: input.resumeVersionId,
      sourceExtractionId: input.sourceExtractionId,
      parser: {
        name: this.name,
        version: this.version,
        parserPolicyVersion: RESUME_PARSER_POLICY_VERSION,
        evidencePolicyVersion: RESUME_EVIDENCE_POLICY_VERSION,
      },
      ...(identityCandidate ? { identityCandidate } : {}),
      ...(core.headline ? { headline: core.headline } : {}),
      ...(core.summary ? { summary: core.summary } : {}),
      experiences: core.experiences,
      education: core.education,
      skills: core.skills,
      projects: extensions.projects,
      certifications: core.certifications,
      awards,
      languages: extensions.languages,
      links,
      locations: extensions.locations,
      ...(additionalSections.length > 0 ? { additionalSections } : {}),
      warnings: buildRuntimeWarnings(sourceLedger.sourceCoverage, sourceLedger.diagnostics.length),
      runtimeV2: {
        schemaVersion: RUNTIME_V2_SCHEMA_VERSION,
        documentQuality: deriveDocumentQuality(sourceDocument),
        structuralConfidence: deriveStructuralConfidence(structuralDocument),
        sourceCoverage: sourceLedger.sourceCoverage,
        reconciliations: [...sourceLedger.reconciliations],
        diagnostics: sourceLedger.diagnostics.map((diagnostic) => ({
          code: diagnostic.code,
          severity: diagnostic.severity,
          reviewRequired: diagnostic.reviewRequired,
        })),
        privateSourceCount: sourceLedger.entries.filter((entry) => entry.status === 'PRIVATE_ONLY')
          .length,
        privateContentPersisted: false,
      },
    };

    // ParsedResume v1 confidence arithmetic predates typed Awards. Awards are mirrored into
    // additionalSections for evidence validation and Phase 3F import compatibility, while the typed
    // awards collection remains available to V2-aware consumers.
    const confidenceSummary = deriveConfidenceSummary({ ...base, awards: [] });
    const coverageSummary = deriveLegacyCoverageSummary(base, structuralDocument);
    const parsedResume: ParsedResume = { ...base, confidenceSummary, coverageSummary };

    return Promise.resolve({ parsedResume });
  }
}

function assertSourceIdentity(document: ResumeDocumentGraphSource, resumeVersionId: string): void {
  if (document.resumeVersionId !== resumeVersionId) {
    throw new ResumeProposalValidationError('V2 source document identity mismatch.');
  }
}

function toParsedAward(award: ResumeCoreTypedExtractionResult['awards'][number]): ParsedAward {
  return {
    name: award.name,
    ...(award.issuer ? { issuer: award.issuer } : {}),
    ...(award.issuedAt ? { issuedAt: award.issuedAt } : {}),
    ...(award.details ? { details: award.details } : {}),
  };
}

function extractHeadedContactFields(
  graph: ResumeDocumentGraphV1,
  structuralDocument: ResumeStructuralDocumentV1,
  sourceExtractionId: string,
  linkOffset: number,
): {
  identityCandidate?: ParsedIdentityCandidate;
  links: ParsedLink[];
  decisions: ResumeSourceLedgerDecision[];
} {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const sectionById = new Map(structuralDocument.sections.map((section) => [section.id, section]));
  let email: ParsedClaim<string> | undefined;
  let phone: ParsedClaim<string> | undefined;
  const links: ParsedLink[] = [];
  const decisions: ResumeSourceLedgerDecision[] = [];

  for (const record of structuralDocument.records) {
    const section = sectionById.get(record.sectionId);
    if (
      classifyCareerSectionHeading(section?.headingText ?? '').typeKey !== 'CONTACT_INFORMATION'
    ) {
      continue;
    }

    const mappedClaimIds: string[] = [];
    let hasUnaccountedText = false;
    const seenLinks = new Set<string>();

    for (const nodeId of record.nodeIds) {
      const node = nodeById.get(nodeId);
      const text = node?.text?.trim();
      if (!node || !text || !node.sourceRange) continue;

      let residual = text;
      const emailMatch = text.match(EMAIL_PATTERN)?.[0];
      if (emailMatch) {
        residual = residual.replace(emailMatch, ' ');
        if (!email) {
          email = nodeClaim(emailMatch, node, sourceExtractionId, 0.99);
          if (email) mappedClaimIds.push('identityCandidate.email');
        }
      }

      const phoneMatch = text.match(PHONE_PATTERN)?.[0];
      if (phoneMatch) {
        residual = residual.replace(phoneMatch, ' ');
        if (!phone) {
          phone = nodeClaim(phoneMatch, node, sourceExtractionId, 0.97);
          if (phone) mappedClaimIds.push('identityCandidate.phone');
        }
      }

      const urlMatch = text.match(HTTP_URL_PATTERN)?.[0];
      if (urlMatch) {
        residual = residual.replace(urlMatch, ' ');
        const normalizedUrl = normalizeHttpUrl(urlMatch);
        if (normalizedUrl && !seenLinks.has(normalizedUrl)) {
          const url = nodeClaim(normalizedUrl, node, sourceExtractionId, 0.99);
          if (url) {
            seenLinks.add(normalizedUrl);
            const index = linkOffset + links.length;
            links.push({ url });
            mappedClaimIds.push(`links[${index}].url`);
          }
        }
      }

      if (residual.replace(/[\s|,;:/·•()\[\]{}-]+/g, '').length > 0) {
        hasUnaccountedText = true;
      }
    }

    if (mappedClaimIds.length === 0) {
      decisions.push({
        sourceId: record.id,
        status: 'UNMAPPED',
        semanticTypeKey: 'CONTACT_INFORMATION',
        reasonCode: 'CONTACT_RECORD_NOT_TYPED',
        reviewRequired: true,
      });
      continue;
    }

    decisions.push({
      sourceId: record.id,
      status: hasUnaccountedText ? 'PARTIALLY_MAPPED' : 'MAPPED',
      semanticTypeKey: 'CONTACT_INFORMATION',
      mappedClaimIds,
      reviewRequired: hasUnaccountedText,
    });
  }

  const identityCandidate =
    email || phone
      ? {
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
        }
      : undefined;

  return {
    ...(identityCandidate ? { identityCandidate } : {}),
    links,
    decisions,
  };
}

function mergeIdentityCandidates(
  primary: ParsedIdentityCandidate | undefined,
  fallback: ParsedIdentityCandidate | undefined,
): ParsedIdentityCandidate | undefined {
  const fullName = primary?.fullName ?? fallback?.fullName;
  const email = primary?.email ?? fallback?.email;
  const phone = primary?.phone ?? fallback?.phone;
  return fullName || email || phone
    ? {
        ...(fullName ? { fullName } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      }
    : undefined;
}

function nodeClaim(
  value: string,
  node: DocumentGraphNode,
  sourceExtractionId: string,
  confidence: number,
): ParsedClaim<string> | undefined {
  if (!node.sourceRange) return undefined;
  return {
    value: value.trim(),
    confidence,
    evidence: [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: node.pageNumber,
        ...(typeof node.metadata?.blockIndex === 'number'
          ? { blockIndex: node.metadata.blockIndex }
          : {}),
        sourceRange: node.sourceRange,
        evidenceKind: 'DIRECT_TEXT',
      },
    ],
    warnings: [],
  };
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function buildAdditionalSections(
  graph: ResumeDocumentGraphV1,
  structuralDocument: ResumeStructuralDocumentV1,
  records: readonly ParsedOpenWorldRecordV2[],
  sourceExtractionId: string,
): ParsedAdditionalSection[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const recordById = new Map(structuralDocument.records.map((record) => [record.id, record]));
  const sectionById = new Map(structuralDocument.sections.map((section) => [section.id, section]));
  const grouped = new Map<
    string,
    { sourceOrder: number; heading: ParsedClaim<string>; entries: ParsedClaim<string>[] }
  >();

  for (const record of records) {
    const structuralRecord = recordById.get(record.recordId);
    const section = structuralRecord ? sectionById.get(structuralRecord.sectionId) : undefined;
    if (!section || !section.headingText) continue;

    const headingNode = section.headingNodeId ? nodeById.get(section.headingNodeId) : undefined;
    const heading = headingNode
      ? headingClaim(section.headingText, headingNode, sourceExtractionId)
      : undefined;
    if (!heading) continue;

    const existing = grouped.get(section.id);
    if (existing) {
      existing.entries.push(...record.entries);
      continue;
    }

    grouped.set(section.id, {
      sourceOrder: section.sourceOrder,
      heading,
      entries: [...record.entries],
    });
  }

  return [...grouped.values()].map(({ sourceOrder, heading, entries }) => ({
    sourceOrder,
    heading,
    entries,
  }));
}

function buildAwardCompatibilitySections(
  graph: ResumeDocumentGraphV1,
  structuralDocument: ResumeStructuralDocumentV1,
  core: ResumeCoreTypedExtractionResult,
  sourceExtractionId: string,
): ParsedAdditionalSection[] {
  if (core.awards.length === 0) return [];

  const section = structuralDocument.sections.find(
    (candidate) => classifyCareerSectionHeading(candidate.headingText ?? '').typeKey === 'AWARDS',
  );
  if (!section?.headingText || !section.headingNodeId) return [];

  const headingNode = graph.nodes.find((node) => node.id === section.headingNodeId);
  const heading = headingNode
    ? headingClaim(section.headingText, headingNode, sourceExtractionId)
    : undefined;
  if (!heading) return [];

  return [
    {
      sourceOrder: section.sourceOrder,
      heading,
      entries: core.awards.map((award) => award.name),
    },
  ];
}

function headingClaim(
  value: string,
  node: DocumentGraphNode,
  sourceExtractionId: string,
): ParsedClaim<string> | undefined {
  if (!node.sourceRange) return undefined;
  return {
    value,
    confidence: 1,
    evidence: [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: node.pageNumber,
        ...(typeof node.metadata?.blockIndex === 'number'
          ? { blockIndex: node.metadata.blockIndex }
          : {}),
        sourceRange: node.sourceRange,
        evidenceKind: 'DIRECT_TEXT',
      },
    ],
    warnings: [],
  };
}

function deriveDocumentQuality(document: ResumeDocumentGraphSource): number | null {
  const quality = document.quality;
  if (!quality) return null;

  const pageCoverage = quality.pageCount === 0 ? 1 : quality.pagesWithText / quality.pageCount;
  const characterNoise = Math.min(
    0.6,
    quality.replacementCharacterRatio * 8 + quality.controlCharacterRatio * 12,
  );
  const warningPenalty = Math.min(0.25, quality.warnings.length * 0.05);
  return clamp01(pageCoverage - characterNoise - warningPenalty);
}

function deriveStructuralConfidence(document: ResumeStructuralDocumentV1): number | null {
  const values = [
    ...document.sections.map((section) => section.sectionBoundaryConfidence),
    ...document.records.map((record) => record.recordBoundaryConfidence),
  ];
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deriveConfidenceSummary(
  parsedResume: Omit<ParsedResume, 'confidenceSummary' | 'coverageSummary'>,
): ParsedResumeConfidenceSummary {
  const claims: ParsedClaim<unknown>[] = [];
  const push = (claim: ParsedClaim<unknown> | undefined): void => {
    if (claim) claims.push(claim);
  };

  push(parsedResume.identityCandidate?.fullName);
  push(parsedResume.identityCandidate?.email);
  push(parsedResume.identityCandidate?.phone);
  push(parsedResume.headline);
  push(parsedResume.summary);
  parsedResume.experiences.forEach((item) => {
    push(item.company);
    push(item.role);
    push(item.location);
    push(item.dates);
    push(item.summary);
    item.highlights.forEach(push);
  });
  parsedResume.education.forEach((item) => {
    push(item.institution);
    push(item.qualification);
    push(item.fieldOfStudy);
    push(item.location);
    push(item.dates);
    item.details.forEach(push);
  });
  parsedResume.skills.forEach((item) => {
    push(item.name);
    push(item.category);
  });
  parsedResume.projects.forEach((item) => {
    push(item.name);
    push(item.description);
    push(item.url);
    item.technologies.forEach(push);
  });
  parsedResume.certifications.forEach((item) => {
    push(item.name);
    push(item.issuer);
    push(item.issuedAt);
    push(item.expiresAt);
    push(item.credentialId);
    push(item.credentialUrl);
  });
  parsedResume.awards?.forEach((item) => {
    push(item.name);
    push(item.issuer);
    push(item.issuedAt);
    push(item.details);
  });
  parsedResume.languages.forEach((item) => {
    push(item.name);
    push(item.proficiency);
  });
  parsedResume.links.forEach((item) => {
    push(item.label);
    push(item.url);
  });
  parsedResume.locations.forEach((item) => push(item.value));

  if (claims.length === 0) return { overall: 0, lowConfidenceClaimCount: 0, totalClaimCount: 0 };
  return {
    overall: claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length,
    lowConfidenceClaimCount: claims.filter((claim) => claim.confidence < 0.65).length,
    totalClaimCount: claims.length,
  };
}

function deriveLegacyCoverageSummary(
  parsedResume: Omit<ParsedResume, 'confidenceSummary' | 'coverageSummary'>,
  structuralDocument: ResumeStructuralDocumentV1,
): ParsedResumeCoverageSummary {
  const presentTypes = new Set(
    structuralDocument.sections.map(
      (section) => classifyCareerSectionHeading(section.headingText ?? '').typeKey,
    ),
  );
  const sections: ParsedResumeCoverageSection[] = [];

  const identitySourcePresent =
    structuralDocument.unsectionedNodeIds.length > 0 || presentTypes.has('CONTACT_INFORMATION');
  const identityCount = [
    parsedResume.identityCandidate?.fullName,
    parsedResume.identityCandidate?.email,
    parsedResume.identityCandidate?.phone,
    parsedResume.headline,
  ].filter(Boolean).length;
  sections.push(coverageSection('IDENTITY', identitySourcePresent, identityCount));

  for (const [legacyKey, typeKey] of LEGACY_COVERAGE_MAP) {
    const sourcePresent = presentTypes.has(typeKey);
    sections.push(
      coverageSection(legacyKey, sourcePresent, detectedCount(parsedResume, legacyKey)),
    );
  }

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
  detectedCountValue: number,
): ParsedResumeCoverageSection {
  return {
    key,
    sourcePresent,
    detectedCount: detectedCountValue,
    status: !sourcePresent ? 'NOT_PRESENT' : detectedCountValue > 0 ? 'DETECTED' : 'MISSED',
  };
}

function detectedCount(
  parsedResume: Omit<ParsedResume, 'confidenceSummary' | 'coverageSummary'>,
  key: ResumeCoverageSectionKey,
): number {
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

function buildRuntimeWarnings(
  sourceCoverage: ResumeSourceCoverageSummary,
  diagnosticCount: number,
): string[] {
  return [
    'Resume Intelligence V2 uses layout-aware structural extraction and does not silently fall back to the legacy flattened-text parser.',
    sourceCoverage.status === 'COMPLETE'
      ? 'Every meaningful source record was explicitly accounted for by the V2 Source Ledger.'
      : `${sourceCoverage.unprocessedSourceCount} meaningful source item(s) remain unprocessed and require review.`,
    diagnosticCount > 0
      ? `${diagnosticCount} V2 diagnostic signal(s) were preserved for candidate review.`
      : 'No V2 structural or reconciliation diagnostics were emitted.',
  ];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export type ResumeIntelligenceRuntimeV2SchemaVersion = typeof RUNTIME_V2_SCHEMA_VERSION;
export type ResumeIntelligenceRuntimeReconciliation = ResumeRecordReconciliation;
