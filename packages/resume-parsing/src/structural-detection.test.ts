import assert from 'node:assert/strict';
import test from 'node:test';

import type { DocumentGraphNode, ResumeDocumentGraphV1 } from '@talent-network/contracts';

import { detectResumeStructure } from './structural-detection.js';

void test('detects known and unknown section boundaries without turning the preamble into a section', () => {
  const graph = graphWithNodes([
    paragraph('name', 'ALEX MORGAN', 1),
    paragraph('headline', 'Principal Platform Engineer', 2),
    paragraph('summary-heading', 'Professional Summary', 3),
    paragraph('summary-body', 'Engineering leader focused on resilient systems.', 4),
    paragraph('custom-heading', 'INDUSTRY ACTIVITIES', 5),
    paragraph('custom-body', 'Mentored founders on secure SaaS architecture.', 6),
  ]);

  const result = detectResumeStructure(graph);

  assert.deepEqual(
    result.sections.map((section) => section.headingText),
    ['Professional Summary', 'INDUSTRY ACTIVITIES'],
  );
  assert.deepEqual(result.unsectionedNodeIds, ['name', 'headline']);
  assert.equal(result.sections[0]?.sectionBoundaryConfidence, 0.98);
  assert.equal(result.sections[1]?.sectionBoundaryConfidence, 0.74);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'SECTION_BOUNDARY_UNCERTAIN' &&
        diagnostic.sectionId === result.sections[1]?.id,
    ),
  );
});

void test('groups repeated role and date blocks into distinct structural records', () => {
  const graph = graphWithNodes([
    paragraph('experience-heading', 'Professional Experience', 1),
    paragraph('role-1', 'Senior Platform Engineer — ExampleSoft', 2),
    paragraph('date-1', 'Jan 2022 – Present', 3),
    paragraph('location-1', 'Lahore, PK', 4),
    list('bullets-1', ['bullet-1', 'bullet-2'], 5),
    paragraph('role-2', 'Software Engineer — AnotherCo', 8),
    paragraph('date-2', 'Aug 2019 – Dec 2021', 9),
    paragraph('location-2', 'Karachi, PK', 10),
    list('bullets-2', ['bullet-3'], 11),
  ]);

  const result = detectResumeStructure(graph);
  const section = result.sections[0];
  assert.ok(section);

  const records = result.records.filter((record) => record.sectionId === section.id);
  assert.equal(records.length, 2);
  assert.ok(records[0]?.nodeIds.includes('role-1'));
  assert.ok(records[0]?.nodeIds.includes('bullets-1'));
  assert.ok(records[1]?.nodeIds.includes('role-2'));
  assert.ok(records[1]?.nodeIds.includes('bullet-3'));
  assert.ok(records.every((record) => record.recordBoundaryConfidence === 0.86));
});

void test('treats preserved table rows as deterministic structural records', () => {
  const graph = graphWithNodes([
    heading('cert-heading', 'Certifications', 1),
    table('cert-table', ['row-1', 'row-2', 'row-3'], 2),
  ]);

  const result = detectResumeStructure(graph);
  assert.equal(result.sections.length, 1);
  assert.equal(result.records.length, 3);
  assert.deepEqual(
    result.records.map((record) => record.nodeIds[0]),
    ['row-1', 'row-2', 'row-3'],
  );
  assert.ok(result.records.every((record) => record.recordBoundaryConfidence === 1));
});

void test('list-only sections preserve each item as a record while ambiguous prose stays explicit', () => {
  const listGraph = graphWithNodes([
    paragraph('memberships-heading', 'Professional Memberships', 1),
    list('memberships', ['member-1', 'member-2', 'member-3'], 2),
  ]);

  const listResult = detectResumeStructure(listGraph);
  assert.equal(listResult.records.length, 3);
  assert.ok(listResult.records.every((record) => record.recordBoundaryConfidence === 0.82));

  const proseGraph = graphWithNodes([
    paragraph('projects-heading', 'Projects', 1),
    paragraph('projects-body-1', 'Built an observability control plane.', 2),
    paragraph('projects-body-2', 'Reduced incident response toil.', 3),
  ]);

  const proseResult = detectResumeStructure(proseGraph);
  assert.equal(proseResult.records.length, 1);
  assert.equal(proseResult.records[0]?.recordBoundaryConfidence, 0.35);
  assert.ok(
    proseResult.diagnostics.some((diagnostic) => diagnostic.code === 'RECORD_BOUNDARY_UNCERTAIN'),
  );
});

function graphWithNodes(topLevelNodes: readonly DocumentGraphNode[]): ResumeDocumentGraphV1 {
  const page: DocumentGraphNode = {
    id: 'page-1',
    kind: 'PAGE',
    pageNumber: 1,
    parentId: 'document',
    childIds: topLevelNodes.map((node) => node.id),
    readingOrder: 0,
  };

  return {
    schemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'resume-structure-test',
    sourceExtractionId: 'extraction-structure-test',
    nodes: [
      {
        id: 'document',
        kind: 'DOCUMENT',
        pageNumber: null,
        childIds: ['page-1'],
        readingOrder: -1,
      },
      page,
      ...topLevelNodes.flatMap((node) => [node, ...syntheticChildren(node)]),
    ],
    pageIds: ['page-1'],
    extractionMethod: 'NATIVE_PDF',
    extractionVersion: 'fixture@1',
    warnings: [],
  };
}

function paragraph(id: string, text: string, readingOrder: number): DocumentGraphNode {
  return {
    id,
    kind: 'PARAGRAPH',
    text,
    pageNumber: 1,
    parentId: 'page-1',
    childIds: [],
    readingOrder,
  };
}

function heading(id: string, text: string, readingOrder: number): DocumentGraphNode {
  return {
    id,
    kind: 'HEADING',
    text,
    pageNumber: 1,
    parentId: 'page-1',
    childIds: [],
    readingOrder,
  };
}

function list(id: string, childIds: string[], readingOrder: number): DocumentGraphNode {
  return {
    id,
    kind: 'LIST',
    pageNumber: 1,
    parentId: 'page-1',
    childIds,
    readingOrder,
  };
}

function table(id: string, rowIds: string[], readingOrder: number): DocumentGraphNode {
  return {
    id,
    kind: 'TABLE',
    pageNumber: 1,
    parentId: 'page-1',
    childIds: rowIds,
    readingOrder,
  };
}

function syntheticChildren(parent: DocumentGraphNode): DocumentGraphNode[] {
  if (parent.kind === 'LIST') {
    return parent.childIds.map((id, index) => ({
      id,
      kind: 'LIST_ITEM',
      text: `Item ${index + 1}`,
      pageNumber: 1,
      parentId: parent.id,
      childIds: [],
      readingOrder: parent.readingOrder + (index + 1) / 10,
    }));
  }

  if (parent.kind === 'TABLE') {
    return parent.childIds.flatMap((rowId, rowIndex) => {
      const cellIds = [`${rowId}-cell-1`, `${rowId}-cell-2`];
      const row: DocumentGraphNode = {
        id: rowId,
        kind: 'TABLE_ROW',
        pageNumber: 1,
        parentId: parent.id,
        childIds: cellIds,
        readingOrder: parent.readingOrder + (rowIndex + 1) / 10,
      };
      const cells = cellIds.map((cellId, cellIndex): DocumentGraphNode => ({
        id: cellId,
        kind: 'TABLE_CELL',
        text: `Cell ${rowIndex + 1}.${cellIndex + 1}`,
        pageNumber: 1,
        parentId: rowId,
        childIds: [],
        readingOrder: row.readingOrder + (cellIndex + 1) / 100,
      }));
      return [row, ...cells];
    });
  }

  return [];
}
