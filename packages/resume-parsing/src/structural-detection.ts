import {
  classifyCareerSectionHeading,
  type CareerPassportSectionTypeKey,
  type DocumentGraphNode,
  type ResumeDocumentGraphV1,
  type ResumeIntelligenceDiagnostic,
  type ResumeStructuralDocumentV1,
  type ResumeStructuralRecord,
  type ResumeStructuralSection,
} from '@talent-network/contracts';

interface StructuralUnit {
  node: DocumentGraphNode;
  descendantIds: string[];
}

interface DetectedHeading {
  unitIndex: number;
  confidence: number;
}

const DATE_RANGE_PATTERN =
  /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(?:19|20)\d{2}\b\s*(?:[-–—]|to)\s*(?:(?:present|current|now)|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(?:19|20)\d{2})\b/i;
const SINGLE_YEAR_PATTERN = /\b(?:19|20)\d{2}\b/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

const BULLET_RECORD_TYPES = new Set<CareerPassportSectionTypeKey>([
  'AWARDS',
  'PUBLICATIONS',
  'PATENTS',
  'PROFESSIONAL_MEMBERSHIPS',
  'SPEAKING_ENGAGEMENTS',
  'TEACHING',
]);

export function detectResumeStructure(graph: ResumeDocumentGraphV1): ResumeStructuralDocumentV1 {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const units = topLevelStructuralUnits(graph, nodeById);
  const headings = detectHeadingBoundaries(units);
  const sections: ResumeStructuralSection[] = [];
  const records: ResumeStructuralRecord[] = [];
  const diagnostics: ResumeIntelligenceDiagnostic[] = [];
  const unsectionedNodeIds: string[] = [];

  if (headings.length === 0) {
    for (const unit of units) unsectionedNodeIds.push(...unit.descendantIds);
    if (unsectionedNodeIds.length > 0) {
      diagnostics.push({
        code: 'SECTION_BOUNDARY_UNCERTAIN',
        severity: 'WARNING',
        nodeIds: [...unsectionedNodeIds],
        reviewRequired: true,
      });
    }

    return {
      schemaVersion: 'resume-structural-document-v1',
      documentGraphSchemaVersion: graph.schemaVersion,
      resumeVersionId: graph.resumeVersionId,
      sourceExtractionId: graph.sourceExtractionId,
      sections,
      records,
      unsectionedNodeIds,
      diagnostics,
    };
  }

  const firstHeading = headings[0];
  if (!firstHeading) throw new Error('RESUME_STRUCTURE_HEADING_STATE_INVALID');

  for (let index = 0; index < firstHeading.unitIndex; index += 1) {
    const unit = units[index];
    if (unit) unsectionedNodeIds.push(...unit.descendantIds);
  }

  for (const [headingIndex, heading] of headings.entries()) {
    const nextHeadingIndex = headings[headingIndex + 1]?.unitIndex ?? units.length;
    const headingUnit = units[heading.unitIndex];
    if (!headingUnit) throw new Error('RESUME_STRUCTURE_HEADING_UNIT_MISSING');
    const contentUnits = units.slice(heading.unitIndex + 1, nextHeadingIndex);
    const sectionId = `section-${headingIndex + 1}`;
    const sectionNodeIds = contentUnits.flatMap((unit) => unit.descendantIds);

    const section: ResumeStructuralSection = {
      id: sectionId,
      headingNodeId: headingUnit.node.id,
      headingText: headingUnit.node.text?.trim() || null,
      nodeIds: sectionNodeIds,
      sourceOrder: headingIndex,
      sectionBoundaryConfidence: heading.confidence,
    };
    sections.push(section);

    if (heading.confidence < 0.9 && !isDocumentNavigationHeading(section.headingText)) {
      diagnostics.push({
        code: 'SECTION_BOUNDARY_UNCERTAIN',
        severity: 'WARNING',
        sectionId,
        nodeIds: [headingUnit.node.id],
        reviewRequired: true,
      });
    }

    const recordResult = detectSectionRecords(section, contentUnits, nodeById);
    records.push(...recordResult.records);
    diagnostics.push(...recordResult.diagnostics);
  }

  return {
    schemaVersion: 'resume-structural-document-v1',
    documentGraphSchemaVersion: graph.schemaVersion,
    resumeVersionId: graph.resumeVersionId,
    sourceExtractionId: graph.sourceExtractionId,
    sections,
    records,
    unsectionedNodeIds,
    diagnostics,
  };
}

function topLevelStructuralUnits(
  graph: ResumeDocumentGraphV1,
  nodeById: ReadonlyMap<string, DocumentGraphNode>,
): StructuralUnit[] {
  const topLevelKinds = new Set(['HEADING', 'PARAGRAPH', 'LIST', 'TABLE', 'KEY_VALUE', 'OTHER']);

  return graph.nodes
    .filter((node) => {
      if (!topLevelKinds.has(node.kind)) return false;
      const parent = node.parentId ? nodeById.get(node.parentId) : null;
      return parent?.kind === 'PAGE' || parent?.kind === 'DOCUMENT';
    })
    .sort((left, right) => left.readingOrder - right.readingOrder)
    .map((node) => ({
      node,
      descendantIds: collectNodeAndDescendantIds(node.id, nodeById),
    }));
}

function collectNodeAndDescendantIds(
  nodeId: string,
  nodeById: ReadonlyMap<string, DocumentGraphNode>,
): string[] {
  const output: string[] = [];
  const visit = (currentId: string): void => {
    const current = nodeById.get(currentId);
    if (!current) return;
    output.push(current.id);
    for (const childId of current.childIds) visit(childId);
  };
  visit(nodeId);
  return output;
}

function detectHeadingBoundaries(units: readonly StructuralUnit[]): DetectedHeading[] {
  const headings: DetectedHeading[] = [];
  let hasTrustedSection = false;

  for (const [unitIndex, unit] of units.entries()) {
    const text = unit.node.text?.trim() ?? '';
    if (!text) continue;

    if (unit.node.kind === 'HEADING') {
      headings.push({ unitIndex, confidence: 1 });
      hasTrustedSection = true;
      continue;
    }

    if (unit.node.kind !== 'PARAGRAPH') continue;

    const classification = classifyCareerSectionHeading(text);
    if (classification.typeKey !== 'CUSTOM') {
      headings.push({ unitIndex, confidence: 0.98 });
      hasTrustedSection = true;
      continue;
    }

    if (isDocumentNavigationHeading(text)) {
      headings.push({ unitIndex, confidence: 1 });
      hasTrustedSection = true;
      continue;
    }

    if (hasTrustedSection && looksLikeUnknownHeading(text)) {
      headings.push({ unitIndex, confidence: 0.74 });
    }
  }

  return headings;
}

function isDocumentNavigationHeading(text: string | null): boolean {
  if (!text) return false;
  const normalized = text
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized === 'table of contents' || normalized === 'contents';
}

function looksLikeUnknownHeading(text: string): boolean {
  if (text.length < 3 || text.length > 72) return false;
  if (/\d/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8) return false;
  const letters = [...text].filter((character) => /[A-Za-z]/.test(character));
  if (letters.length < 3) return false;
  const uppercaseLetters = letters.filter((character) => character === character.toUpperCase());
  return uppercaseLetters.length / letters.length >= 0.92;
}

function detectSectionRecords(
  section: ResumeStructuralSection,
  units: readonly StructuralUnit[],
  nodeById: ReadonlyMap<string, DocumentGraphNode>,
): { records: ResumeStructuralRecord[]; diagnostics: ResumeIntelligenceDiagnostic[] } {
  if (isDocumentNavigationHeading(section.headingText)) {
    return { records: [], diagnostics: [] };
  }

  const typeKey = classifyCareerSectionHeading(section.headingText ?? '').typeKey;
  const tableRecords = recordsFromTables(section, units, nodeById);
  if (tableRecords.length > 0) return { records: tableRecords, diagnostics: [] };

  const hasParagraph = units.some((unit) => unit.node.kind === 'PARAGRAPH');
  const lists = units.filter((unit) => unit.node.kind === 'LIST');
  if (!hasParagraph && lists.length > 0) {
    const listRecords = recordsFromLists(section, lists, nodeById);
    if (listRecords.length > 0) return { records: listRecords, diagnostics: [] };
  }

  const referenceAnchors = typeKey === 'REFERENCES' ? referenceAnchorIndexes(units) : [];
  if (referenceAnchors.length > 1) {
    return { records: recordsFromAnchors(section, units, referenceAnchors, 0.92), diagnostics: [] };
  }

  const bulletAnchors = BULLET_RECORD_TYPES.has(typeKey) ? bulletAnchorIndexes(units) : [];
  if (bulletAnchors.length > 1) {
    return { records: recordsFromAnchors(section, units, bulletAnchors, 0.9), diagnostics: [] };
  }

  if (typeKey === 'LANGUAGES') {
    const languageRecords = recordsFromSimpleLines(section, units);
    if (languageRecords.length > 1) return { records: languageRecords, diagnostics: [] };
  }

  const anchorIndexes = dateAnchorIndexes(units, typeKey);
  if (anchorIndexes.length > 0) {
    return { records: recordsFromAnchors(section, units, anchorIndexes, 0.86), diagnostics: [] };
  }

  const meaningfulUnits = units.filter((unit) => isMeaningfulRecordUnit(unit.node));
  if (meaningfulUnits.length === 0) return { records: [], diagnostics: [] };

  const record: ResumeStructuralRecord = {
    id: `${section.id}-record-1`,
    sectionId: section.id,
    nodeIds: meaningfulUnits.flatMap((unit) => unit.descendantIds),
    sourceOrder: 0,
    recordBoundaryConfidence: 0.35,
  };

  return {
    records: [record],
    diagnostics: [
      {
        code: 'RECORD_BOUNDARY_UNCERTAIN',
        severity: 'WARNING',
        sectionId: section.id,
        recordId: record.id,
        nodeIds: record.nodeIds,
        reviewRequired: true,
      },
    ],
  };
}

function recordsFromTables(
  section: ResumeStructuralSection,
  units: readonly StructuralUnit[],
  nodeById: ReadonlyMap<string, DocumentGraphNode>,
): ResumeStructuralRecord[] {
  const records: ResumeStructuralRecord[] = [];

  for (const unit of units) {
    if (unit.node.kind !== 'TABLE') continue;
    for (const childId of unit.node.childIds) {
      const row = nodeById.get(childId);
      if (!row || row.kind !== 'TABLE_ROW') continue;
      const nodeIds = collectNodeAndDescendantIds(row.id, nodeById);
      if (records.length === 0 && isLikelyTableHeader(nodeIds, nodeById)) continue;
      records.push({
        id: `${section.id}-record-${records.length + 1}`,
        sectionId: section.id,
        nodeIds,
        sourceOrder: records.length,
        recordBoundaryConfidence: 1,
      });
    }
  }

  return records;
}

function isLikelyTableHeader(
  nodeIds: readonly string[],
  nodeById: ReadonlyMap<string, DocumentGraphNode>,
): boolean {
  const text = nodeIds
    .map((id) => nodeById.get(id)?.text?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('en-US');
  if (!text) return false;
  const headerTokens = [
    'name',
    'title',
    'company',
    'email',
    'phone',
    'certification',
    'issuer',
    'credential',
    'year',
    'language',
    'proficiency',
    'category',
    'details',
  ];
  return headerTokens.filter((token) => text.includes(token)).length >= 2;
}

function recordsFromLists(
  section: ResumeStructuralSection,
  lists: readonly StructuralUnit[],
  nodeById: ReadonlyMap<string, DocumentGraphNode>,
): ResumeStructuralRecord[] {
  const records: ResumeStructuralRecord[] = [];

  for (const list of lists) {
    for (const childId of list.node.childIds) {
      const item = nodeById.get(childId);
      if (!item || item.kind !== 'LIST_ITEM') continue;
      records.push({
        id: `${section.id}-record-${records.length + 1}`,
        sectionId: section.id,
        nodeIds: collectNodeAndDescendantIds(item.id, nodeById),
        sourceOrder: records.length,
        recordBoundaryConfidence: 0.82,
      });
    }
  }

  return records;
}

function dateAnchorIndexes(
  units: readonly StructuralUnit[],
  typeKey: CareerPassportSectionTypeKey,
): number[] {
  const anchors: number[] = [];
  const singleYearSections = new Set<CareerPassportSectionTypeKey>([
    'EDUCATION',
    'PROJECTS',
    'CERTIFICATIONS',
  ]);

  for (const [index, unit] of units.entries()) {
    if (unit.node.kind !== 'PARAGRAPH') continue;
    const text = unit.node.text?.trim() ?? '';
    const hasDateRange = DATE_RANGE_PATTERN.test(text);
    const hasEligibleSingleYear =
      singleYearSections.has(typeKey) &&
      SINGLE_YEAR_PATTERN.test(text) &&
      !isBulletText(text) &&
      text.length <= 220;
    if (
      !hasDateRange &&
      !hasEligibleSingleYear &&
      !(/\|/.test(text) && SINGLE_YEAR_PATTERN.test(text))
    ) {
      continue;
    }

    const previous = units[index - 1];
    const previousText = previous?.node.text?.trim() ?? '';
    const previousMayBeRecordTitle =
      isMostlyDateLine(text) &&
      previous?.node.kind === 'PARAGRAPH' &&
      previousText &&
      !looksLikeDateBearingRecordLine(previousText) &&
      !SINGLE_YEAR_PATTERN.test(previousText) &&
      !looksLikeLocationLine(previousText) &&
      !isBulletText(previousText) &&
      !isLikelyInlineHeader(previousText);
    const anchorIndex = previousMayBeRecordTitle ? index - 1 : index;

    if (!anchors.includes(anchorIndex)) anchors.push(anchorIndex);
  }

  anchors.sort((left, right) => left - right);
  const firstAnchor = anchors[0];
  if (firstAnchor !== undefined && firstAnchor > 0) {
    const firstDataIndex = units.findIndex((unit, index) => {
      if (index >= firstAnchor) return false;
      const text = unit.node.text?.trim() ?? '';
      return isMeaningfulRecordUnit(unit.node) && text.length > 0 && !isLikelyInlineHeader(text);
    });
    if (firstDataIndex >= 0) anchors[0] = firstDataIndex;
  }

  return [...new Set(anchors)].sort((left, right) => left - right);
}

function referenceAnchorIndexes(units: readonly StructuralUnit[]): number[] {
  const emailIndexes = units.flatMap((unit, index) =>
    unit.node.kind === 'PARAGRAPH' && EMAIL_PATTERN.test(unit.node.text?.trim() ?? '') ? [index] : [],
  );
  if (emailIndexes.length <= 1) return [];
  const firstContentIndex = units.findIndex((unit) => {
    const text = unit.node.text?.trim() ?? '';
    return text.length > 0 && !isLikelyInlineHeader(text);
  });
  return [firstContentIndex >= 0 ? firstContentIndex : 0, ...emailIndexes.slice(1)];
}

function bulletAnchorIndexes(units: readonly StructuralUnit[]): number[] {
  return units.flatMap((unit, index) =>
    unit.node.kind === 'PARAGRAPH' && isBulletText(unit.node.text?.trim() ?? '') ? [index] : [],
  );
}

function recordsFromSimpleLines(
  section: ResumeStructuralSection,
  units: readonly StructuralUnit[],
): ResumeStructuralRecord[] {
  const meaningful = units.filter(
    (unit) =>
      unit.node.kind === 'PARAGRAPH' &&
      (unit.node.text?.trim().length ?? 0) > 0 &&
      !isLikelyInlineHeader(unit.node.text?.trim() ?? ''),
  );
  if (meaningful.length <= 1) return [];
  return meaningful.map((unit, index) => ({
    id: `${section.id}-record-${index + 1}`,
    sectionId: section.id,
    nodeIds: unit.descendantIds,
    sourceOrder: index,
    recordBoundaryConfidence: 0.88,
  }));
}

function recordsFromAnchors(
  section: ResumeStructuralSection,
  units: readonly StructuralUnit[],
  anchorIndexes: readonly number[],
  confidence: number,
): ResumeStructuralRecord[] {
  return anchorIndexes.map((anchorIndex, recordIndex) => {
    const nextAnchor = anchorIndexes[recordIndex + 1] ?? units.length;
    const recordUnits = units.slice(anchorIndex, nextAnchor);
    return {
      id: `${section.id}-record-${recordIndex + 1}`,
      sectionId: section.id,
      nodeIds: recordUnits.flatMap((unit) => unit.descendantIds),
      sourceOrder: recordIndex,
      recordBoundaryConfidence: confidence,
    };
  });
}

function looksLikeDateBearingRecordLine(text: string): boolean {
  if (DATE_RANGE_PATTERN.test(text)) return true;
  if (/\|/.test(text) && SINGLE_YEAR_PATTERN.test(text)) return true;
  return false;
}

function isMostlyDateLine(text: string): boolean {
  const withoutRange = text.replace(DATE_RANGE_PATTERN, ' ');
  const withoutYears = withoutRange.replace(/\b(?:19|20)\d{2}\b/g, ' ');
  return withoutYears.replace(/[\s()[\],.;:/|+-]/g, '').length === 0;
}

function isLikelyInlineHeader(text: string): boolean {
  const normalized = text.trim().toLocaleLowerCase('en-US');
  if (!normalized) return false;
  const tokens = [
    'certification',
    'issuer',
    'credential',
    'year',
    'language',
    'proficiency',
    'name',
    'title',
    'company',
    'email',
    'phone',
    'category',
    'details',
  ];
  return tokens.filter((token) => normalized.includes(token)).length >= 2;
}

function isBulletText(text: string): boolean {
  return /^\s*[•●◦▪*-]\s+/.test(text);
}

function looksLikeLocationLine(text: string): boolean {
  return /^[A-Za-z .'-]+,\s*[A-Z]{2}(?:,\s*[A-Za-z .'-]+)?$/.test(text);
}

function isMeaningfulRecordUnit(node: DocumentGraphNode): boolean {
  return (
    node.kind === 'PARAGRAPH' ||
    node.kind === 'LIST' ||
    node.kind === 'TABLE' ||
    node.kind === 'KEY_VALUE'
  );
}
