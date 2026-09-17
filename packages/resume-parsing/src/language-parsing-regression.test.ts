import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DocumentGraphNode,
  ResumeDocumentGraphV1,
  ResumeStructuralDocumentV1,
} from '@talent-network/contracts';

import { extractExtensionResumeFieldsV2 } from './extension-typed-extraction.js';

void test('language extraction prefers explicit delimiters before whitespace fallback', () => {
  const graph = graphWithNodes([
    paragraph('language-1', 'English — Native', 10),
    paragraph('language-2', 'Urdu - Fluent', 11),
    paragraph('language-3', 'French: Conversational', 12),
    paragraph('language-4', 'German | Intermediate', 13),
    paragraph('language-5', 'Portuguese Professional Working Proficiency', 14),
  ]);
  const structure = structureWithRecord([
    'language-1',
    'language-2',
    'language-3',
    'language-4',
    'language-5',
  ]);

  const result = extractExtensionResumeFieldsV2(graph, structure);

  assert.deepEqual(
    result.languages.map((language) => [language.name.value, language.proficiency?.value]),
    [
      ['English', 'Native'],
      ['Urdu', 'Fluent'],
      ['French', 'Conversational'],
      ['German', 'Intermediate'],
      ['Portuguese', 'Professional Working Proficiency'],
    ],
  );
  assert.equal(result.decisions[0]?.status, 'MAPPED');
});

void test('language extraction supports structurally separated name and proficiency rows', () => {
  const graph = graphWithNodes([
    paragraph('language-name', 'Mandarin Chinese', 10),
    paragraph('language-proficiency', 'Limited Working Proficiency', 11),
  ]);
  const structure = structureWithRecord(['language-name', 'language-proficiency']);

  const result = extractExtensionResumeFieldsV2(graph, structure);

  assert.deepEqual(
    result.languages.map((language) => [language.name.value, language.proficiency?.value]),
    [['Mandarin Chinese', 'Limited Working Proficiency']],
  );
});

void test('language extraction does not invent a mapping from a bare language name', () => {
  const graph = graphWithNodes([paragraph('language-name', 'English', 10)]);
  const structure = structureWithRecord(['language-name']);

  const result = extractExtensionResumeFieldsV2(graph, structure);

  assert.deepEqual(result.languages, []);
  assert.equal(result.decisions[0]?.status, 'UNMAPPED');
});

function graphWithNodes(nodes: readonly DocumentGraphNode[]): ResumeDocumentGraphV1 {
  return {
    schemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'language-regression-test',
    sourceExtractionId: 'language-regression-extraction',
    nodes: [
      {
        id: 'document',
        kind: 'DOCUMENT',
        pageNumber: null,
        childIds: nodes.map((node) => node.id),
        readingOrder: 0,
      },
      ...nodes,
    ],
    pageIds: [],
    extractionMethod: 'NATIVE_DOCX',
    extractionVersion: 'fixture@1',
    warnings: [],
  };
}

function structureWithRecord(nodeIds: readonly string[]): ResumeStructuralDocumentV1 {
  return {
    schemaVersion: 'resume-structural-document-v1',
    documentGraphSchemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'language-regression-test',
    sourceExtractionId: 'language-regression-extraction',
    sections: [
      {
        id: 'languages-section',
        headingNodeId: null,
        headingText: 'Languages',
        nodeIds,
        sourceOrder: 0,
        sectionBoundaryConfidence: 0.98,
      },
    ],
    records: [
      {
        id: 'languages-record',
        sectionId: 'languages-section',
        nodeIds,
        sourceOrder: 0,
        recordBoundaryConfidence: 0.9,
      },
    ],
    unsectionedNodeIds: [],
    diagnostics: [],
  };
}

function paragraph(id: string, text: string, readingOrder: number): DocumentGraphNode {
  const start = readingOrder * 100;
  return {
    id,
    kind: 'PARAGRAPH',
    text,
    pageNumber: null,
    parentId: 'document',
    childIds: [],
    readingOrder,
    sourceRange: { start, end: start + text.length },
    metadata: { blockIndex: readingOrder },
  };
}
