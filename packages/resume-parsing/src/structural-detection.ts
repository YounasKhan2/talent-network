import {
  classifyCareerSectionHeading,
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

    if (heading.confidence < 0.9) {
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

    if (hasTrustedSection && looksLikeUnknownHeading(text)) {
      headings.push({ unitIndex, confidence: 0.74 });
    }
  }

  return headings;
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
  const tableRecords = recordsFromTables(section, units, nodeById);
  if (tableRecords.length > 0) return { records: tableRecords, diagnostics: [] };

  const hasParagraph = units.some((unit) => unit.node.kind === 'PARAGRAPH');
  const lists = units.filter((unit) => unit.node.kind === 'LIST');
  if (!hasParagraph && lists.length > 0) {
    const listRecords = recordsFromLists(section, lists, nodeById);
    if (listRecords.length > 0) return { records: listRecords, diagnostics: [] };
  }

  const anchorIndexes = dateAnchorIndexes(units);
  if (anchorIndexes.length > 0) {
    return { records: recordsFromAnchors(section, units, anchorIndexes), diagnostics: [] };
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
      records.push({
        id: `${section.id}-record-${records.length + 1}`,
        sectionId: section.id,
        nodeIds: collectNodeAndDescendantIds(row.id, nodeById),
        sourceOrder: records.length,
        recordBoundaryConfidence: 1,
      });
    }
  }

  return records;
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

function dateAnchorIndexes(units: readonly StructuralUnit[]): number[] {
  const anchors: number[] = [];

  for (const [index, unit] of units.entries()) {
    if (unit.node.kind !== 'PARAGRAPH') continue;
    const text = unit.node.text?.trim() ?? '';
    if (!looksLikeDateBearingRecordLine(text)) continue;

    const previous = units[index - 1];
    const previousText = previous?.node.text?.trim() ?? '';
    const anchorIndex =
      previous?.node.kind === 'PARAGRAPH' &&
      previousText &&
      !looksLikeDateBearingRecordLine(previousText) &&
      !looksLikeLocationLine(previousText)
        ? index - 1
        : index;

    if (anchors.at(-1) !== anchorIndex) anchors.push(anchorIndex);
  }

  return anchors;
}

function recordsFromAnchors(
  section: ResumeStructuralSection,
  units: readonly StructuralUnit[],
  anchorIndexes: readonly number[],
): ResumeStructuralRecord[] {
  return anchorIndexes.map((anchorIndex, recordIndex) => {
    const nextAnchor = anchorIndexes[recordIndex + 1] ?? units.length;
    const recordUnits = units.slice(anchorIndex, nextAnchor);
    return {
      id: `${section.id}-record-${recordIndex + 1}`,
      sectionId: section.id,
      nodeIds: recordUnits.flatMap((unit) => unit.descendantIds),
      sourceOrder: recordIndex,
      recordBoundaryConfidence: 0.86,
    };
  });
}

function looksLikeDateBearingRecordLine(text: string): boolean {
  if (DATE_RANGE_PATTERN.test(text)) return true;
  if (/\|/.test(text) && SINGLE_YEAR_PATTERN.test(text)) return true;
  return false;
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
