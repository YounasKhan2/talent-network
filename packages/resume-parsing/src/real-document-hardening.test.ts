import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCareerSectionHeading,
  type DocumentGraphNode,
  type ResumeDocumentGraphV1,
} from '@talent-network/contracts';

import { extractExtensionResumeFieldsV2 } from './extension-typed-extraction.js';
import { detectResumeStructure } from './structural-detection.js';

void test('real-world aliases route competencies certifications and project research to typed sections', () => {
  assert.equal(classifyCareerSectionHeading('CORE COMPETENCIES').typeKey, 'SKILLS');
  assert.equal(classifyCareerSectionHeading('CERTIFICATIONS & LICENSES').typeKey, 'CERTIFICATIONS');
  assert.equal(classifyCareerSectionHeading('SELECTED PROJECTS & RESEARCH').typeKey, 'PROJECTS');
  assert.equal(
    classifyCareerSectionHeading('TEACHING & SPEAKING ENGAGEMENTS').typeKey,
    'SPEAKING_ENGAGEMENTS',
  );
});

void test('education records with inline years remain distinct instead of collapsing into one record', () => {
  const graph = graphWithParagraphs([
    ['education-heading', 'EDUCATION'],
    ['edu-1', 'Ph.D. in Computer Science (Machine Learning) 2009'],
    ['edu-1-school', 'Fictional Institute of Technology (FIT), Boston, MA'],
    ['edu-2', 'M.S. in Statistics 2005'],
    ['edu-2-school', 'Old Meridian State University, Meridian, OH'],
    ['edu-3', 'B.S. in Applied Mathematics, Summa Cum Laude 2003'],
    ['edu-3-school', 'Old Meridian State University, Meridian, OH'],
  ]);

  const structure = detectResumeStructure(graph);
  assert.equal(structure.records.length, 3);
  assert.ok(structure.records[0]?.nodeIds.includes('edu-1'));
  assert.ok(structure.records[1]?.nodeIds.includes('edu-2'));
  assert.ok(structure.records[2]?.nodeIds.includes('edu-3'));
});

void test('projects and certifications split into source-level records from single-year anchors', () => {
  const projects = detectResumeStructure(
    graphWithParagraphs([
      ['projects-heading', 'SELECTED PROJECTS & RESEARCH'],
      ['project-1', 'OpenFeatureStore (Open Source, fictional) 2021 – Present'],
      ['project-1-body', 'Creator and lead maintainer of an open-source feature store.'],
      ['project-2', 'Fairness-Aware Ranking Toolkit 2020'],
      ['project-2-body', 'Internal toolkit implementing fairness metrics.'],
      ['project-3', 'Synthetic Resume Parsing Benchmark v2 2019'],
      ['project-3-body', 'Synthetic multi-page resume benchmark.'],
      ['project-4', 'Clinical Note De-Identification Pipeline 2016 – 2018'],
      ['project-4-body', 'Research prototype for PHI detection.'],
    ]),
  );
  assert.equal(projects.records.length, 4);

  const certifications = detectResumeStructure(
    graphWithParagraphs([
      ['cert-heading', 'CERTIFICATIONS & LICENSES'],
      ['cert-header', 'Certification Issuer Year Credential ID'],
      ['cert-1', 'AWS Certified Machine Learning – Specialty Amazon Web Services 2023 FAKE-MLS-90213'],
      ['cert-2', 'Google Cloud Professional ML Engineer Google Cloud 2022 FAKE-GCPML-44120'],
      ['cert-3', 'Certified Kubernetes Administrator (CKA) CNCF 2021 FAKE-CKA-30987'],
      ['cert-4', 'Deep Learning Specialization DeepLearning.AI 2017 FAKE-DLS-11023'],
      ['cert-5', 'Six Sigma Green Belt Fictional Quality Institute 2013 FAKE-SSGB-55210'],
    ]),
  );
  assert.equal(certifications.records.length, 5);
  assert.equal(certifications.records.some((record) => record.nodeIds.includes('cert-header')), false);
});

void test('reference rows remain three independent private-only records', () => {
  const graph = graphWithParagraphs([
    ['references-heading', 'REFERENCES'],
    ['references-header', 'Name Title / Company Email Phone'],
    [
      'reference-1',
      'Dr. Elena Vasquez-Thornbury | Professor | elena.vasquez@example-mail.com | +1 (555) 220-8871',
    ],
    [
      'reference-2',
      'Priya Nakamura-Singh | VP Engineering | priya.nakamura@example-mail.com | +1 (555) 671-2290',
    ],
    [
      'reference-3',
      'Marcus O. Alderidge | CTO | marcus.alderidge@example-mail.com | +1 (555) 908-4471',
    ],
  ]);
  const structure = detectResumeStructure(graph);
  const extensions = extractExtensionResumeFieldsV2(graph, structure);

  assert.equal(structure.records.length, 3);
  assert.equal(extensions.privateSections.length, 3);
  assert.equal(
    extensions.decisions.filter((decision) => decision.status === 'PRIVATE_ONLY').length,
    3,
  );
});

void test('language parsing keeps only language rows and does not duplicate proficiency text', () => {
  const graph = graphWithParagraphs([
    ['languages-heading', 'LANGUAGES'],
    ['language-1', 'English Native'],
    ['language-2', 'Portuguese Professional Working Proficiency'],
    ['language-3', 'Mandarin Chinese Limited Working Proficiency'],
  ]);
  const structure = detectResumeStructure(graph);
  const extensions = extractExtensionResumeFieldsV2(graph, structure);

  assert.deepEqual(
    extensions.languages.map((language) => language.name.value),
    ['English', 'Portuguese', 'Mandarin Chinese'],
  );
  assert.deepEqual(
    extensions.languages.map((language) => language.proficiency?.value),
    ['Native', 'Professional Working Proficiency', 'Limited Working Proficiency'],
  );
});

void test('table of contents is accounted as document navigation and never becomes career content', () => {
  const graph = graphWithParagraphs([
    ['toc-heading', 'TABLE OF CONTENTS'],
    ['toc-line-1', '1. Professional Summary 1'],
    ['toc-line-2', '2. Professional Experience (6 roles) 2'],
    ['toc-line-3', '3. Education 6'],
  ]);
  const structure = detectResumeStructure(graph);
  const extensions = extractExtensionResumeFieldsV2(graph, structure);

  assert.equal(extensions.additionalSections.length, 0);
  assert.ok(
    extensions.decisions.some(
      (decision) =>
        decision.status === 'INTENTIONALLY_IGNORED' &&
        decision.reasonCode === 'DOCUMENT_NAVIGATION',
    ),
  );
});

function graphWithParagraphs(
  rows: ReadonlyArray<readonly [id: string, text: string]>,
): ResumeDocumentGraphV1 {
  let cursor = 0;
  const nodes = rows.map(([id, text], index): DocumentGraphNode => {
    const startOffset = cursor;
    const endOffset = startOffset + text.length;
    cursor = endOffset + 1;
    return {
      id,
      kind: 'PARAGRAPH',
      text,
      pageNumber: 1,
      parentId: 'page-1',
      childIds: [],
      readingOrder: index + 1,
      sourceRange: { startOffset, endOffset },
    };
  });

  return {
    schemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'real-document-hardening-resume',
    sourceExtractionId: 'real-document-hardening-extraction',
    nodes: [
      {
        id: 'document',
        kind: 'DOCUMENT',
        pageNumber: null,
        childIds: ['page-1'],
        readingOrder: -1,
      },
      {
        id: 'page-1',
        kind: 'PAGE',
        pageNumber: 1,
        parentId: 'document',
        childIds: nodes.map((node) => node.id),
        readingOrder: 0,
      },
      ...nodes,
    ],
    pageIds: ['page-1'],
    extractionMethod: 'NATIVE_PDF',
    extractionVersion: 'real-document-fixture@1',
    warnings: [],
  };
}
