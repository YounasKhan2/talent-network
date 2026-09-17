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

void test('splits single-year education entries instead of collapsing the whole section', () => {
  const graph = graphWithNodes([
    heading('education-heading', 'Education', 1),
    paragraph('degree-1', 'Ph.D. in Computer Science (Machine Learning)', 2),
    paragraph('year-1', '2009', 3),
    paragraph('school-1', 'Fictional Institute of Technology (FIT), Boston, MA', 4),
    paragraph('degree-2', 'M.S. in Statistics', 5),
    paragraph('year-2', '2005', 6),
    paragraph('school-2', 'Old Meridian State University, Meridian, OH', 7),
    paragraph('degree-3', 'B.S. in Applied Mathematics, Summa Cum Laude', 8),
    paragraph('year-3', '2003', 9),
    paragraph('school-3', 'Old Meridian State University, Meridian, OH', 10),
  ]);

  const result = detectResumeStructure(graph);
  assert.equal(result.records.length, 3);
  assert.ok(result.records[0]?.nodeIds.includes('degree-1'));
  assert.ok(result.records[1]?.nodeIds.includes('degree-2'));
  assert.ok(result.records[2]?.nodeIds.includes('degree-3'));
});

void test('splits references by independently identifiable email-bearing rows', () => {
  const graph = graphWithNodes([
    heading('references-heading', 'References', 1),
    paragraph('reference-header', 'Name Title / Company Email Phone', 2),
    paragraph(
      'reference-1',
      'Dr. Priya Nakamura-Singh VP Engineering priya@example-mail.com +1 (555) 111-2222',
      3,
    ),
    paragraph(
      'reference-2',
      'Marcus Alderidge CTO marcus@example-mail.com +1 (555) 222-3333',
      4,
    ),
    paragraph(
      'reference-3',
      'Fatima El-Rashid Director fatima@example-mail.com +1 (555) 333-4444',
      5,
    ),
  ]);

  const result = detectResumeStructure(graph);
  assert.equal(result.records.length, 3);
  assert.ok(result.records[0]?.nodeIds.includes('reference-1'));
  assert.ok(result.records[1]?.nodeIds.includes('reference-2'));
  assert.ok(result.records[2]?.nodeIds.includes('reference-3'));
});

void test('splits language rows without treating a table-like header as a language', () => {
  const graph = graphWithNodes([
    heading('languages-heading', 'Languages', 1),
    paragraph('language-header', 'Language Proficiency', 2),
    paragraph('language-1', 'English Native', 3),
    paragraph('language-2', 'Portuguese Professional Working Proficiency', 4),
    paragraph('language-3', 'Mandarin Chinese Limited Working Proficiency', 5),
  ]);

  const result = detectResumeStructure(graph);
  assert.equal(result.records.length, 3);
  assert.deepEqual(
    result.records.map((record) => record.nodeIds[0]),
    ['language-1', 'language-2', 'language-3'],
  );
});

void test('treats preserved table rows as deterministic structural records and ignores the header row', () => {
  const graph = graphWithNodes([
    heading('cert-heading', 'Certifications', 1),
    tableWithRows(
      'cert-table',
      [
        ['Certification', 'Issuer', 'Year', 'Credential'],
        ['AWS Certified Solutions Architect', 'Amazon Web Services', '2023', 'FAKE-1'],
        ['Certified Kubernetes Administrator', 'CNCF', '2022', 'FAKE-2'],
      ],
      2,
    ),
  ]);

  const result = detectResumeStructure(graph);
  assert.equal(result.sections.length, 1);
  assert.equal(result.records.length, 2);
  assert.deepEqual(
    result.records.map((record) => record.nodeIds[0]),
    ['cert-table-row-2', 'cert-table-row-3'],
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

function tableWithRows(
  id: string,
  rows: readonly (readonly string[])[],
  readingOrder: number,
): DocumentGraphNode {
  return {
    id,
    kind: 'TABLE',
    pageNumber: 1,
    parentId: 'page-1',
    childIds: rows.map((_, index) => `${id}-row-${index + 1}`),
    readingOrder,
    metadata: { fixtureRows: rows },
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
    const fixtureRows = Array.isArray(parent.metadata?.fixtureRows)
      ? (parent.metadata.fixtureRows as string[][])
      : parent.childIds.map((_, rowIndex) => [`Cell ${rowIndex + 1}.1`, `Cell ${rowIndex + 1}.2`]);
    return parent.childIds.flatMap((rowId, rowIndex) => {
      const rowValues = fixtureRows[rowIndex] ?? [];
      const cellIds = rowValues.map((_, cellIndex) => `${rowId}-cell-${cellIndex + 1}`);
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
        text: rowValues[cellIndex] ?? '',
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