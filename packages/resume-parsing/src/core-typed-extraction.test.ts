import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  DocumentGraphNode,
  ResumeDocumentGraphV1,
  ResumeStructuralDocumentV1,
} from '@talent-network/contracts';

import { extractCoreResumeFieldsV2 } from './core-typed-extraction.js';

void test('core typed extractor maps structural records into evidence-grounded core entities', () => {
  const graph = graphWithNodes([
    paragraph('name', 'Alexandra Meriwether Okonkwo', 1),
    paragraph('headline', 'Senior Platform Engineering Manager', 2),
    paragraph('email', 'alexandra@example.com', 3),
    paragraph('phone', '+1 415 555 0199', 4),
    paragraph(
      'summary-body',
      'Engineering leader focused on resilient distributed systems and data platforms.',
      10,
    ),
    paragraph('exp-role-1', 'Senior Director of Platform Engineering — NimbusForge', 20),
    paragraph('exp-date-1', 'Mar 2021 – Present', 21),
    paragraph('exp-location-1', 'Seattle, WA', 22),
    paragraph('exp-bullet-1', '• Led platform reliability modernization.', 23),
    paragraph('exp-role-2', 'Principal Software Engineer — Solstice', 30),
    paragraph('exp-date-2', 'Jul 2017 – Feb 2021', 31),
    paragraph('edu-degree-1', 'M.S. Computer Science', 40),
    paragraph('edu-school-1', 'Stanford University', 41),
    paragraph('edu-year-1', '2011', 42),
    paragraph('skills-1', 'Distributed Systems, Kubernetes, PostgreSQL', 50),
    tableCell('cert-name-1', 'AWS Certified Solutions Architect', 60),
    tableCell('cert-issuer-1', 'Amazon Web Services', 61),
    tableCell('cert-year-1', '2024', 62),
    paragraph('award-name-1', 'Engineering Excellence Award', 70),
    paragraph('award-issuer-1', 'NimbusForge', 71),
    paragraph('award-year-1', '2023', 72),
  ]);
  const structure = structuralDocument();

  const result = extractCoreResumeFieldsV2(graph, structure);

  assert.equal(result.identityCandidate?.fullName?.value, 'Alexandra Meriwether Okonkwo');
  assert.equal(result.identityCandidate?.email?.value, 'alexandra@example.com');
  assert.equal(result.identityCandidate?.phone?.value, '+1 415 555 0199');
  assert.equal(result.headline?.value, 'Senior Platform Engineering Manager');
  assert.equal(result.summary?.value.includes('distributed systems'), true);
  assert.equal(result.experiences.length, 2);
  assert.equal(result.experiences[0]?.role?.value, 'Senior Director of Platform Engineering');
  assert.equal(result.experiences[0]?.company?.value, 'NimbusForge');
  assert.equal(result.experiences[0]?.dates?.value.isCurrent, true);
  assert.equal(result.experiences[1]?.company?.value, 'Solstice');
  assert.equal(result.education.length, 1);
  assert.equal(result.education[0]?.institution?.value, 'Stanford University');
  assert.equal(result.education[0]?.qualification?.value, 'M.S. Computer Science');
  assert.deepEqual(
    result.skills.map((skill) => skill.name.value),
    ['Distributed Systems', 'Kubernetes', 'PostgreSQL'],
  );
  assert.equal(result.certifications[0]?.name.value, 'AWS Certified Solutions Architect');
  assert.equal(result.certifications[0]?.issuer?.value, 'Amazon Web Services');
  assert.equal(result.awards[0]?.name.value, 'Engineering Excellence Award');
  assert.ok(
    result.decisions.some(
      (decision) => decision.sourceId === 'experience-1' && decision.status === 'MAPPED',
    ),
  );
  assert.ok(
    result.decisions.every(
      (decision) => decision.status === 'UNMAPPED' || (decision.mappedClaimIds?.length ?? 0) > 0,
    ),
  );
});

void test('ambiguous core records stay partial or unmapped instead of inventing missing fields', () => {
  const graph = graphWithNodes([
    paragraph('exp-role-only', 'Platform Engineer', 20),
    paragraph('award-empty', '2024', 30),
  ]);
  const structure: ResumeStructuralDocumentV1 = {
    schemaVersion: 'resume-structural-document-v1',
    documentGraphSchemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'resume-core-v2-test',
    sourceExtractionId: 'extraction-core-v2-test',
    sections: [
      section('section-exp', 'Professional Experience', ['exp-role-only'], 0),
      section('section-awards', 'Awards', ['award-empty'], 1),
    ],
    records: [
      record('experience-1', 'section-exp', ['exp-role-only'], 0),
      record('award-1', 'section-awards', ['award-empty'], 0),
    ],
    unsectionedNodeIds: [],
    diagnostics: [],
  };

  const result = extractCoreResumeFieldsV2(graph, structure);
  assert.equal(result.experiences.length, 1);
  assert.equal(result.experiences[0]?.role?.value, 'Platform Engineer');
  assert.equal(result.experiences[0]?.company, undefined);
  assert.equal(
    result.decisions.find((decision) => decision.sourceId === 'experience-1')?.status,
    'PARTIALLY_MAPPED',
  );
  assert.equal(result.awards.length, 0);
  assert.equal(
    result.decisions.find((decision) => decision.sourceId === 'award-1')?.status,
    'UNMAPPED',
  );
});

void test('core typed extractor rejects graph and structure from different source artifacts', () => {
  const graph = graphWithNodes([]);
  const structure = structuralDocument();
  assert.throws(
    () =>
      extractCoreResumeFieldsV2(graph, {
        ...structure,
        sourceExtractionId: 'different-extraction',
      }),
    /RESUME_CORE_TYPED_EXTRACTION_SOURCE_MISMATCH/,
  );
});

function structuralDocument(): ResumeStructuralDocumentV1 {
  return {
    schemaVersion: 'resume-structural-document-v1',
    documentGraphSchemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'resume-core-v2-test',
    sourceExtractionId: 'extraction-core-v2-test',
    sections: [
      section('section-summary', 'Professional Summary', ['summary-body'], 0),
      section(
        'section-experience',
        'Professional Experience',
        ['exp-role-1', 'exp-date-1', 'exp-location-1', 'exp-bullet-1', 'exp-role-2', 'exp-date-2'],
        1,
      ),
      section('section-education', 'Education', ['edu-degree-1', 'edu-school-1', 'edu-year-1'], 2),
      section('section-skills', 'Skills', ['skills-1'], 3),
      section(
        'section-certifications',
        'Certifications',
        ['cert-name-1', 'cert-issuer-1', 'cert-year-1'],
        4,
      ),
      section('section-awards', 'Awards', ['award-name-1', 'award-issuer-1', 'award-year-1'], 5),
    ],
    records: [
      record('summary-1', 'section-summary', ['summary-body'], 0),
      record(
        'experience-1',
        'section-experience',
        ['exp-role-1', 'exp-date-1', 'exp-location-1', 'exp-bullet-1'],
        0,
      ),
      record('experience-2', 'section-experience', ['exp-role-2', 'exp-date-2'], 1),
      record('education-1', 'section-education', ['edu-degree-1', 'edu-school-1', 'edu-year-1'], 0),
      record('skills-1-record', 'section-skills', ['skills-1'], 0),
      record(
        'certification-1',
        'section-certifications',
        ['cert-name-1', 'cert-issuer-1', 'cert-year-1'],
        0,
      ),
      record('award-1', 'section-awards', ['award-name-1', 'award-issuer-1', 'award-year-1'], 0),
    ],
    unsectionedNodeIds: ['name', 'headline', 'email', 'phone'],
    diagnostics: [],
  };
}

function graphWithNodes(nodes: readonly DocumentGraphNode[]): ResumeDocumentGraphV1 {
  return {
    schemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'resume-core-v2-test',
    sourceExtractionId: 'extraction-core-v2-test',
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

function paragraph(id: string, text: string, readingOrder: number): DocumentGraphNode {
  return node(id, 'PARAGRAPH', text, readingOrder);
}

function tableCell(id: string, text: string, readingOrder: number): DocumentGraphNode {
  return node(id, 'TABLE_CELL', text, readingOrder);
}

function node(
  id: string,
  kind: DocumentGraphNode['kind'],
  text: string,
  readingOrder: number,
): DocumentGraphNode {
  const start = readingOrder * 100;
  return {
    id,
    kind,
    text,
    pageNumber: null,
    parentId: 'document',
    childIds: [],
    readingOrder,
    sourceRange: { start, end: start + text.length },
    metadata: { blockIndex: readingOrder },
  };
}

function section(
  id: string,
  headingText: string,
  nodeIds: string[],
  sourceOrder: number,
): ResumeStructuralDocumentV1['sections'][number] {
  return {
    id,
    headingNodeId: null,
    headingText,
    nodeIds,
    sourceOrder,
    sectionBoundaryConfidence: 0.98,
  };
}

function record(
  id: string,
  sectionId: string,
  nodeIds: string[],
  sourceOrder: number,
): ResumeStructuralDocumentV1['records'][number] {
  return {
    id,
    sectionId,
    nodeIds,
    sourceOrder,
    recordBoundaryConfidence: 0.9,
  };
}
