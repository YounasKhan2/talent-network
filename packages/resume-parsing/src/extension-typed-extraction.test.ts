import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DocumentGraphNode,
  ResumeDocumentGraphV1,
  ResumeStructuralDocumentV1,
} from '@talent-network/contracts';

import { extractExtensionResumeFieldsV2 } from './extension-typed-extraction.js';

void test('typed extension extractors map projects languages links and preferred locations', () => {
  const graph = graphWithNodes([
    paragraph('project-name', 'Atlas Control Plane', 10),
    paragraph('project-description', 'Built a multi-region observability control plane.', 11),
    paragraph('project-tech', 'Technologies: TypeScript, Kubernetes, PostgreSQL', 12),
    paragraph('language-1', 'English — Native', 20),
    paragraph('language-2', 'Urdu — Fluent', 21),
    paragraph('link-1', 'GitHub: https://github.com/example', 30),
    paragraph('locations-1', 'Preferred locations: Dubai, Karachi, Remote', 40),
  ]);
  const structure = structureWith([
    section(
      'projects',
      'Selected Projects',
      ['project-name', 'project-description', 'project-tech'],
      0,
    ),
    section('languages', 'Languages', ['language-1', 'language-2'], 1),
    section('links', 'Professional Links', ['link-1'], 2),
    section('locations', 'Location Preferences', ['locations-1'], 3),
  ]);

  const result = extractExtensionResumeFieldsV2(graph, structure);

  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0]?.name?.value, 'Atlas Control Plane');
  assert.deepEqual(
    result.projects[0]?.technologies.map((technology) => technology.value),
    ['TypeScript', 'Kubernetes', 'PostgreSQL'],
  );
  assert.deepEqual(
    result.languages.map((language) => [language.name.value, language.proficiency?.value]),
    [
      ['English', 'Native'],
      ['Urdu', 'Fluent'],
    ],
  );
  assert.equal(result.links[0]?.url.value, 'https://github.com/example');
  assert.deepEqual(
    result.locations.map((location) => location.value.value),
    ['Dubai', 'Karachi', 'Remote'],
  );
  assert.ok(result.decisions.every((decision) => decision.status === 'MAPPED'));
});

void test('known custom-storage extensions are preserved losslessly with taxonomy metadata', () => {
  const graph = graphWithNodes([
    paragraph('publication-1', 'Meriwether, A. Reliable Event Streams. ACM Queue, 2025.', 10),
    paragraph('patent-1', 'US 12,345,678 — Adaptive workload routing', 20),
    paragraph('membership-1', 'ACM Senior Member', 30),
  ]);
  const structure = structureWith([
    section('publication', 'Publications', ['publication-1'], 0),
    section('patent', 'Patents', ['patent-1'], 1),
    section('membership', 'Professional Affiliations', ['membership-1'], 2),
  ]);

  const result = extractExtensionResumeFieldsV2(graph, structure);

  assert.deepEqual(
    result.additionalSections.map((item) => item.sectionTypeKey),
    ['PUBLICATIONS', 'PATENTS', 'PROFESSIONAL_MEMBERSHIPS'],
  );
  assert.deepEqual(
    result.additionalSections.map((item) => item.entries[0]?.value),
    [
      'Meriwether, A. Reliable Event Streams. ACM Queue, 2025.',
      'US 12,345,678 — Adaptive workload routing',
      'ACM Senior Member',
    ],
  );
  assert.ok(
    result.additionalSections.every(
      (item) =>
        item.classificationStatus === 'AUTO_CLASSIFIED' && item.classificationConfidence === 1,
    ),
  );
  assert.ok(result.decisions.every((decision) => decision.status === 'MAPPED'));
});

void test('unknown sections remain CUSTOM and reviewable instead of disappearing', () => {
  const graph = graphWithNodes([
    paragraph('industry-1', 'Advises early-stage founders on platform architecture.', 10),
  ]);
  const structure = structureWith([section('industry', 'INDUSTRY ACTIVITIES', ['industry-1'], 0)]);

  const result = extractExtensionResumeFieldsV2(graph, structure);

  assert.equal(result.additionalSections.length, 1);
  assert.equal(result.additionalSections[0]?.sectionTypeKey, 'CUSTOM');
  assert.equal(result.additionalSections[0]?.sourceHeading, 'INDUSTRY ACTIVITIES');
  assert.equal(result.additionalSections[0]?.classificationStatus, 'NEEDS_REVIEW');
  assert.equal(
    result.additionalSections[0]?.entries[0]?.value,
    'Advises early-stage founders on platform architecture.',
  );
  const decision = result.decisions[0];
  assert.equal(decision?.status, 'MAPPED');
  assert.equal(decision?.semanticTypeKey, 'CUSTOM');
  assert.equal(decision?.reviewRequired, true);
});

void test('references are preserved privately and never mapped as ordinary passport content', () => {
  const graph = graphWithNodes([
    paragraph('reference-1', 'Jordan Lee | jordan@example.com | +1 555 0100', 10),
  ]);
  const structure = structureWith([section('references', 'References', ['reference-1'], 0)]);

  const result = extractExtensionResumeFieldsV2(graph, structure);

  assert.equal(result.additionalSections.length, 0);
  assert.equal(result.privateSections.length, 1);
  assert.equal(result.privateSections[0]?.sectionTypeKey, 'REFERENCES');
  assert.equal(result.privateSections[0]?.privacyReasonCode, 'THIRD_PARTY_REFERENCE_DATA');
  assert.equal(result.privateSections[0]?.entries[0]?.value.includes('jordan@example.com'), true);
  assert.deepEqual(result.decisions[0], {
    sourceId: 'references-record',
    status: 'PRIVATE_ONLY',
    semanticTypeKey: 'REFERENCES',
    reasonCode: 'THIRD_PARTY_REFERENCE_DATA',
    reviewRequired: false,
  });
});

void test('extension extractor fails closed when graph and structure belong to different artifacts', () => {
  const graph = graphWithNodes([]);
  const structure = structureWith([]);
  assert.throws(
    () =>
      extractExtensionResumeFieldsV2(graph, {
        ...structure,
        sourceExtractionId: 'different-extraction',
      }),
    /RESUME_EXTENSION_TYPED_EXTRACTION_SOURCE_MISMATCH/,
  );
});

function graphWithNodes(nodes: readonly DocumentGraphNode[]): ResumeDocumentGraphV1 {
  return {
    schemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'resume-extension-v2-test',
    sourceExtractionId: 'extraction-extension-v2-test',
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

function structureWith(
  sections: readonly ReturnType<typeof section>[],
): ResumeStructuralDocumentV1 {
  return {
    schemaVersion: 'resume-structural-document-v1',
    documentGraphSchemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'resume-extension-v2-test',
    sourceExtractionId: 'extraction-extension-v2-test',
    sections: sections.map((item) => item.section),
    records: sections.map((item) => item.record),
    unsectionedNodeIds: [],
    diagnostics: [],
  };
}

function section(
  suffix: string,
  headingText: string,
  nodeIds: string[],
  sourceOrder: number,
): {
  section: ResumeStructuralDocumentV1['sections'][number];
  record: ResumeStructuralDocumentV1['records'][number];
} {
  return {
    section: {
      id: `${suffix}-section`,
      headingNodeId: null,
      headingText,
      nodeIds,
      sourceOrder,
      sectionBoundaryConfidence: 0.98,
    },
    record: {
      id: `${suffix}-record`,
      sectionId: `${suffix}-section`,
      nodeIds,
      sourceOrder: 0,
      recordBoundaryConfidence: 0.9,
    },
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
