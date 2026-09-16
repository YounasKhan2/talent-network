import {
  classifyCareerSectionHeading,
  type CareerPassportSectionClassification,
  type CareerPassportSectionTypeKey,
  type DocumentGraphNode,
  type ResumeDocumentGraphV1,
  type ResumeStructuralDocumentV1,
  type ResumeStructuralRecord,
  type ResumeStructuralSection,
} from '@talent-network/contracts';

import type {
  ParsedClaim,
  ParsedLanguage,
  ParsedLink,
  ParsedLocation,
  ParsedProject,
} from './contracts.js';
import type { ResumeSourceLedgerDecision } from './source-ledger.js';

export interface ParsedOpenWorldRecordV2 {
  recordId: string;
  sectionTypeKey: CareerPassportSectionTypeKey;
  sourceHeading: string;
  classificationConfidence: number;
  classificationStatus: CareerPassportSectionClassification['reviewStatus'];
  sourceOrder: number;
  entries: ParsedClaim<string>[];
}

export interface ParsedPrivateSectionRecordV2 extends ParsedOpenWorldRecordV2 {
  privacyReasonCode: 'THIRD_PARTY_REFERENCE_DATA';
}

export interface ResumeExtensionTypedExtractionResult {
  projects: ParsedProject[];
  languages: ParsedLanguage[];
  links: ParsedLink[];
  locations: ParsedLocation[];
  additionalSections: ParsedOpenWorldRecordV2[];
  privateSections: ParsedPrivateSectionRecordV2[];
  decisions: readonly ResumeSourceLedgerDecision[];
}

type EvidenceLine = { node: DocumentGraphNode; text: string };
type RecordContext = {
  record: ResumeStructuralRecord;
  section: ResumeStructuralSection;
  classification: CareerPassportSectionClassification;
  lines: EvidenceLine[];
};

const HTTP_URL_PATTERN = /https?:\/\/[^\s)>\]}]+/i;
const LANGUAGE_PROFICIENCY_PATTERN =
  /\b(native|bilingual|fluent|professional|professional working|full professional|limited working|conversational|intermediate|basic|elementary|advanced|beginner)\b/i;

const OPEN_WORLD_PRESERVED_TYPES = new Set<CareerPassportSectionTypeKey>([
  'PORTFOLIO',
  'INTERESTS',
  'PUBLICATIONS',
  'VOLUNTEERING',
  'PATENTS',
  'RESEARCH',
  'COURSES',
  'PROFESSIONAL_MEMBERSHIPS',
  'OPEN_SOURCE',
  'SPEAKING_ENGAGEMENTS',
  'TRAINING',
  'HACKATHONS',
  'TEACHING',
  'COMMUNITY_LEADERSHIP',
  'MILITARY_SERVICE',
  'CASE_STUDIES',
  'CLIENTS',
  'MEDIA_COVERAGE',
  'CUSTOM',
]);

export function extractExtensionResumeFieldsV2(
  graph: ResumeDocumentGraphV1,
  structuralDocument: ResumeStructuralDocumentV1,
): ResumeExtensionTypedExtractionResult {
  if (
    graph.resumeVersionId !== structuralDocument.resumeVersionId ||
    graph.sourceExtractionId !== structuralDocument.sourceExtractionId
  ) {
    throw new Error('RESUME_EXTENSION_TYPED_EXTRACTION_SOURCE_MISMATCH');
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
        classification: classifyCareerSectionHeading(section.headingText ?? ''),
        lines: evidenceLines(record.nodeIds, nodeById),
      },
    ];
  });

  const projects: ParsedProject[] = [];
  const languages: ParsedLanguage[] = [];
  const links: ParsedLink[] = [];
  const locations: ParsedLocation[] = [];
  const additionalSections: ParsedOpenWorldRecordV2[] = [];
  const privateSections: ParsedPrivateSectionRecordV2[] = [];
  const decisions: ResumeSourceLedgerDecision[] = [];

  for (const context of contexts) {
    const typeKey = context.classification.typeKey;

    if (typeKey === 'PROJECTS') {
      const project = parseProject(context, graph.sourceExtractionId);
      if (project) {
        projects.push(project.value);
        decisions.push(
          mappedDecision(
            context.record.id,
            project.paths(projects.length - 1),
            typeKey,
            project.complete,
          ),
        );
      } else {
        decisions.push(unmappedDecision(context.record.id, typeKey));
      }
      continue;
    }

    if (typeKey === 'LANGUAGES') {
      const parsedLanguages = parseLanguages(context, graph.sourceExtractionId);
      if (parsedLanguages.length > 0) {
        const startIndex = languages.length;
        languages.push(...parsedLanguages);
        decisions.push(
          mappedDecision(
            context.record.id,
            parsedLanguages.map((_, offset) => `languages[${startIndex + offset}].name`),
            typeKey,
            true,
          ),
        );
      } else {
        decisions.push(unmappedDecision(context.record.id, typeKey));
      }
      continue;
    }

    if (typeKey === 'PROFESSIONAL_LINKS') {
      const parsedLinks = parseLinks(context, graph.sourceExtractionId);
      if (parsedLinks.length > 0) {
        const startIndex = links.length;
        links.push(...parsedLinks);
        decisions.push(
          mappedDecision(
            context.record.id,
            parsedLinks.map((_, offset) => `links[${startIndex + offset}].url`),
            typeKey,
            true,
          ),
        );
      } else {
        decisions.push(unmappedDecision(context.record.id, typeKey));
      }
      continue;
    }

    if (typeKey === 'LOCATION_PREFERENCES') {
      const parsedLocations = parseLocations(context, graph.sourceExtractionId);
      if (parsedLocations.length > 0) {
        const startIndex = locations.length;
        locations.push(...parsedLocations);
        decisions.push(
          mappedDecision(
            context.record.id,
            parsedLocations.map((_, offset) => `locations[${startIndex + offset}].value`),
            typeKey,
            true,
          ),
        );
      } else {
        decisions.push(unmappedDecision(context.record.id, typeKey));
      }
      continue;
    }

    if (typeKey === 'REFERENCES') {
      const preserved = preserveOpenWorldRecord(context, graph.sourceExtractionId);
      if (preserved) {
        privateSections.push({
          ...preserved,
          privacyReasonCode: 'THIRD_PARTY_REFERENCE_DATA',
        });
      }
      decisions.push({
        sourceId: context.record.id,
        status: 'PRIVATE_ONLY',
        semanticTypeKey: 'REFERENCES',
        reasonCode: 'THIRD_PARTY_REFERENCE_DATA',
        reviewRequired: false,
      });
      continue;
    }

    if (OPEN_WORLD_PRESERVED_TYPES.has(typeKey)) {
      const preserved = preserveOpenWorldRecord(context, graph.sourceExtractionId);
      if (preserved) {
        const index = additionalSections.length;
        additionalSections.push(preserved);
        decisions.push({
          sourceId: context.record.id,
          status: 'MAPPED',
          semanticTypeKey: typeKey,
          mappedClaimIds: preserved.entries.map(
            (_, entryIndex) => `additionalSections[${index}].entries[${entryIndex}]`,
          ),
          reviewRequired: typeKey === 'CUSTOM',
        });
      } else {
        decisions.push(unmappedDecision(context.record.id, typeKey));
      }
    }
  }

  return {
    projects,
    languages,
    links,
    locations,
    additionalSections,
    privateSections,
    decisions,
  };
}

function parseProject(
  context: RecordContext,
  sourceExtractionId: string,
): { value: ParsedProject; complete: boolean; paths: (index: number) => string[] } | undefined {
  const contentLines = context.lines.filter((line) => line.text.trim().length > 0);
  const nameLine = contentLines[0];
  if (!nameLine) return undefined;

  const nameText = cleanBullet(stripInlineUrl(nameLine.text)).trim();
  const name = nameText ? claim(nameText, nameLine, sourceExtractionId, 0.9) : undefined;
  const urlCandidate = contentLines
    .map((line) => ({ line, url: extractUrl(line) }))
    .find((candidate) => candidate.url !== undefined);
  const url = urlCandidate?.url
    ? claim(urlCandidate.url, urlCandidate.line, sourceExtractionId, 0.98)
    : undefined;
  const descriptionLines = contentLines.filter(
    (line) => line !== nameLine && line !== urlCandidate?.line && !looksTechnologyList(line.text),
  );
  const descriptionText = descriptionLines
    .map((line) => cleanBullet(line.text))
    .join(' ')
    .trim();
  const description =
    descriptionText && descriptionLines[0]
      ? multiLineClaim(descriptionText, descriptionLines, sourceExtractionId, 0.86)
      : undefined;
  const technologyLines = contentLines.filter((line) => looksTechnologyList(line.text));
  const technologies = technologyLines.flatMap((line) =>
    splitListValues(stripTechnologyLabel(line.text)).flatMap((value) => {
      const parsed = claim(value, line, sourceExtractionId, 0.86);
      return parsed ? [parsed] : [];
    }),
  );

  if (!name && !description && !url) return undefined;
  const value: ParsedProject = {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
    technologies,
  };

  return {
    value,
    complete: Boolean(name && (description || url || technologies.length > 0)),
    paths: (index) => [
      ...(name ? [`projects[${index}].name`] : []),
      ...(description ? [`projects[${index}].description`] : []),
      ...(url ? [`projects[${index}].url`] : []),
      ...technologies.map(
        (_, technologyIndex) => `projects[${index}].technologies[${technologyIndex}]`,
      ),
    ],
  };
}

function parseLanguages(context: RecordContext, sourceExtractionId: string): ParsedLanguage[] {
  const output: ParsedLanguage[] = [];
  for (const line of context.lines) {
    for (const value of splitListValues(line.text)) {
      const split = value.split(/\s*[-–—:|]\s*/).filter(Boolean);
      const nameText = split[0]?.trim();
      if (!nameText) continue;
      const proficiencyText = split.slice(1).join(' ').trim();
      const proficiencyMatch = proficiencyText.match(LANGUAGE_PROFICIENCY_PATTERN);
      const name = claim(nameText, line, sourceExtractionId, 0.9);
      if (!name) continue;
      const proficiency = proficiencyMatch?.[0]
        ? claim(proficiencyMatch[0], line, sourceExtractionId, 0.84)
        : undefined;
      output.push({ name, ...(proficiency ? { proficiency } : {}) });
    }
  }
  return dedupeLanguages(output);
}

function parseLinks(context: RecordContext, sourceExtractionId: string): ParsedLink[] {
  const output: ParsedLink[] = [];
  const seen = new Set<string>();
  for (const line of context.lines) {
    const url = extractUrl(line);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const labelText = line.text
      .replace(url, '')
      .replace(/[:|—-]+$/g, '')
      .trim();
    const urlClaim = claim(url, line, sourceExtractionId, 0.99);
    if (!urlClaim) continue;
    const label = labelText ? claim(labelText, line, sourceExtractionId, 0.86) : undefined;
    output.push({ ...(label ? { label } : {}), url: urlClaim });
  }
  return output;
}

function parseLocations(context: RecordContext, sourceExtractionId: string): ParsedLocation[] {
  const output: ParsedLocation[] = [];
  const seen = new Set<string>();
  for (const line of context.lines) {
    for (const value of splitListValues(
      line.text.replace(/^preferred\s+(locations?|markets?)\s*:?/i, ''),
    )) {
      const cleaned = value.trim();
      if (!cleaned || cleaned.length > 100) continue;
      const key = cleaned.toLocaleLowerCase('en-US');
      if (seen.has(key)) continue;
      const parsed = claim(cleaned, line, sourceExtractionId, 0.86);
      if (!parsed) continue;
      seen.add(key);
      output.push({ value: parsed, kind: 'PREFERRED' });
    }
  }
  return output;
}

function preserveOpenWorldRecord(
  context: RecordContext,
  sourceExtractionId: string,
): ParsedOpenWorldRecordV2 | undefined {
  const entries = context.lines
    .map((line) => claim(cleanBullet(line.text), line, sourceExtractionId, 0.82))
    .filter((value): value is ParsedClaim<string> => value !== undefined);
  if (entries.length === 0) return undefined;

  return {
    recordId: context.record.id,
    sectionTypeKey: context.classification.typeKey,
    sourceHeading: context.section.headingText ?? '',
    classificationConfidence: context.classification.confidence,
    classificationStatus: context.classification.reviewStatus,
    sourceOrder: context.record.sourceOrder,
    entries,
  };
}

function evidenceLines(
  nodeIds: readonly string[],
  nodeById: ReadonlyMap<string, DocumentGraphNode>,
): EvidenceLine[] {
  const visited = new Set<string>();
  const nodes: DocumentGraphNode[] = [];

  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeById.get(nodeId);
    if (!node) return;
    nodes.push(node);
    for (const childId of node.childIds) visit(childId);
  };

  for (const nodeId of nodeIds) visit(nodeId);

  return nodes
    .filter((node) => typeof node.text === 'string' && node.text.trim().length > 0)
    .sort((left, right) => left.readingOrder - right.readingOrder)
    .map((node) => ({ node, text: node.text?.trim() ?? '' }));
}

function claim(
  value: string,
  line: EvidenceLine,
  sourceExtractionId: string,
  confidence: number,
): ParsedClaim<string> | undefined {
  const text = value.trim();
  if (!text || !line.node.sourceRange) return undefined;
  return {
    value: text,
    confidence,
    evidence: [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: line.node.pageNumber,
        ...(typeof line.node.metadata?.blockIndex === 'number'
          ? { blockIndex: line.node.metadata.blockIndex }
          : {}),
        sourceRange: line.node.sourceRange,
        evidenceKind: 'DIRECT_TEXT',
      },
    ],
    warnings: [],
  };
}

function multiLineClaim(
  value: string,
  lines: readonly EvidenceLine[],
  sourceExtractionId: string,
  confidence: number,
): ParsedClaim<string> | undefined {
  if (!value.trim()) return undefined;
  const evidence = lines.flatMap((line) => {
    if (!line.node.sourceRange) return [];
    return [
      {
        resumeExtractionId: sourceExtractionId,
        pageNumber: line.node.pageNumber,
        ...(typeof line.node.metadata?.blockIndex === 'number'
          ? { blockIndex: line.node.metadata.blockIndex }
          : {}),
        sourceRange: line.node.sourceRange,
        evidenceKind: 'SECTION_CONTEXT' as const,
      },
    ];
  });
  if (evidence.length === 0) return undefined;
  return { value: value.trim(), confidence, evidence, warnings: [] };
}

function extractUrl(line: EvidenceLine): string | undefined {
  const metadataUrl =
    typeof line.node.metadata?.url === 'string' ? line.node.metadata.url : undefined;
  if (metadataUrl && safeHttpUrl(metadataUrl)) return safeHttpUrl(metadataUrl) ?? undefined;
  const match = line.text.match(HTTP_URL_PATTERN)?.[0];
  return match ? (safeHttpUrl(match) ?? undefined) : undefined;
}

function safeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function splitListValues(value: string): string[] {
  return value
    .split(/[,;•·]/)
    .map((item) => cleanBullet(item).trim())
    .filter(Boolean);
}

function stripTechnologyLabel(value: string): string {
  return value.replace(/^(tech(?:nologies)?|stack|tools?)\s*:\s*/i, '').trim();
}

function stripInlineUrl(value: string): string {
  return value.replace(HTTP_URL_PATTERN, '').replace(/\s+/g, ' ').trim();
}

function looksTechnologyList(value: string): boolean {
  return /^(tech(?:nologies)?|stack|tools?)\s*:/i.test(value.trim());
}

function cleanBullet(value: string): string {
  return value.replace(/^\s*[•●◦▪*-]\s*/, '').trim();
}

function dedupeLanguages(values: readonly ParsedLanguage[]): ParsedLanguage[] {
  const seen = new Set<string>();
  const output: ParsedLanguage[] = [];
  for (const value of values) {
    const key = value.name.value.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function mappedDecision(
  sourceId: string,
  mappedClaimIds: readonly string[],
  semanticTypeKey: CareerPassportSectionTypeKey,
  complete: boolean,
): ResumeSourceLedgerDecision {
  if (mappedClaimIds.length === 0) return unmappedDecision(sourceId, semanticTypeKey);
  return {
    sourceId,
    status: complete ? 'MAPPED' : 'PARTIALLY_MAPPED',
    semanticTypeKey,
    mappedClaimIds,
    reviewRequired: !complete,
  };
}

function unmappedDecision(
  sourceId: string,
  semanticTypeKey: CareerPassportSectionTypeKey,
): ResumeSourceLedgerDecision {
  return {
    sourceId,
    status: 'UNMAPPED',
    semanticTypeKey,
    reasonCode: 'NO_CONFIDENT_EXTENSION_MAPPING',
    reviewRequired: true,
  };
}
