import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResumeStructuralDocumentV1 } from '@talent-network/contracts';

import { buildResumeSourceLedger } from './source-ledger.js';

void test('source ledger preserves every structural source and keeps incomplete work visible', () => {
  const result = buildResumeSourceLedger({ structuralDocument: structuralDocument() });

  assert.equal(result.entries.length, 9);
  assert.deepEqual(result.sourceCoverage, {
    status: 'INCOMPLETE',
    meaningfulSourceCount: 6,
    accountedSourceCount: 2,
    unprocessedSourceCount: 4,
    ratio: 2 / 6,
  });

  const experienceSection = result.entries.find((entry) => entry.sourceId === 'section-experience');
  assert.equal(experienceSection?.status, 'CLASSIFIED');
  assert.equal(experienceSection?.semanticTypeKey, 'WORK_EXPERIENCE');

  const customSection = result.entries.find((entry) => entry.sourceId === 'section-custom');
  assert.equal(customSection?.semanticTypeKey, 'CUSTOM');
  assert.equal(customSection?.reviewRequired, true);

  const referenceRecords = result.entries.filter(
    (entry) => entry.sourceKind === 'RECORD' && entry.semanticTypeKey === 'REFERENCES',
  );
  assert.equal(referenceRecords.length, 2);
  assert.ok(referenceRecords.every((entry) => entry.status === 'PRIVATE_ONLY'));
  assert.ok(referenceRecords.every((entry) => entry.reasonCode === 'THIRD_PARTY_REFERENCE_DATA'));
  assert.ok(
    result.diagnostics.some((diagnostic) => diagnostic.code === 'PRIVATE_THIRD_PARTY_DATA'),
  );
});

void test('mapping decisions can close source accounting without pretending unmapped records were understood', () => {
  const result = buildResumeSourceLedger({
    structuralDocument: structuralDocument(),
    decisions: [
      {
        sourceId: 'experience-1',
        status: 'MAPPED',
        mappedClaimIds: ['experience[0]'],
      },
      {
        sourceId: 'experience-2',
        status: 'PARTIALLY_MAPPED',
        mappedClaimIds: ['experience[1].title'],
      },
      {
        sourceId: 'custom-1',
        status: 'UNMAPPED',
        reasonCode: 'NO_TYPED_EXTRACTOR',
      },
      {
        sourceId: 'node-name',
        status: 'MAPPED',
        semanticTypeKey: 'CONTACT_INFORMATION',
        mappedClaimIds: ['contact.fullName'],
      },
    ],
  });

  assert.deepEqual(result.sourceCoverage, {
    status: 'COMPLETE',
    meaningfulSourceCount: 6,
    accountedSourceCount: 6,
    unprocessedSourceCount: 0,
    ratio: 1,
  });

  const experience = result.reconciliations.find(
    (item) => item.sectionTypeKey === 'WORK_EXPERIENCE',
  );
  assert.deepEqual(experience, {
    sectionTypeKey: 'WORK_EXPERIENCE',
    sourceRecordCount: 2,
    mappedRecordCount: 1,
    partiallyMappedRecordCount: 1,
    unmappedRecordCount: 0,
    privateOnlyRecordCount: 0,
    intentionallyIgnoredRecordCount: 0,
    unprocessedRecordCount: 0,
    accountedRecordCount: 2,
    recordCoverageRatio: 1,
  });

  const references = result.reconciliations.find((item) => item.sectionTypeKey === 'REFERENCES');
  assert.equal(references?.sourceRecordCount, 2);
  assert.equal(references?.privateOnlyRecordCount, 2);
  assert.equal(references?.accountedRecordCount, 2);
  assert.equal(references?.recordCoverageRatio, 0);

  const custom = result.reconciliations.find((item) => item.sectionTypeKey === 'CUSTOM');
  assert.equal(custom?.sourceRecordCount, 1);
  assert.equal(custom?.unmappedRecordCount, 1);
  assert.equal(custom?.accountedRecordCount, 1);
  assert.equal(custom?.recordCoverageRatio, 0);
});

void test('intentional ignore is accounted only with an explicit reason', () => {
  assert.throws(
    () =>
      buildResumeSourceLedger({
        structuralDocument: structuralDocument(),
        decisions: [{ sourceId: 'custom-1', status: 'INTENTIONALLY_IGNORED' }],
      }),
    /RESUME_SOURCE_LEDGER_IGNORE_REASON_REQUIRED/,
  );

  const result = buildResumeSourceLedger({
    structuralDocument: structuralDocument(),
    decisions: [
      {
        sourceId: 'custom-1',
        status: 'INTENTIONALLY_IGNORED',
        reasonCode: 'NON_CAREER_BOILERPLATE',
      },
    ],
  });
  const custom = result.reconciliations.find((item) => item.sectionTypeKey === 'CUSTOM');
  assert.equal(custom?.intentionallyIgnoredRecordCount, 1);
  assert.equal(custom?.accountedRecordCount, 1);
});

void test('invalid mapping decisions fail closed', () => {
  assert.throws(
    () =>
      buildResumeSourceLedger({
        structuralDocument: structuralDocument(),
        decisions: [{ sourceId: 'experience-1', status: 'MAPPED' }],
      }),
    /RESUME_SOURCE_LEDGER_DECISION_REQUIRES_CLAIMS/,
  );

  assert.throws(
    () =>
      buildResumeSourceLedger({
        structuralDocument: structuralDocument(),
        decisions: [
          {
            sourceId: 'missing-record',
            status: 'UNMAPPED',
          },
        ],
      }),
    /RESUME_SOURCE_LEDGER_DECISION_UNKNOWN_SOURCE/,
  );
});

function structuralDocument(): ResumeStructuralDocumentV1 {
  return {
    schemaVersion: 'resume-structural-document-v1',
    documentGraphSchemaVersion: 'resume-document-graph-v1',
    resumeVersionId: 'resume-version-1',
    sourceExtractionId: 'extraction-1',
    sections: [
      {
        id: 'section-experience',
        headingNodeId: 'heading-experience',
        headingText: 'Professional Experience',
        nodeIds: ['experience-node-1', 'experience-node-2'],
        sourceOrder: 0,
        sectionBoundaryConfidence: 0.98,
      },
      {
        id: 'section-references',
        headingNodeId: 'heading-references',
        headingText: 'References',
        nodeIds: ['reference-node-1', 'reference-node-2'],
        sourceOrder: 1,
        sectionBoundaryConfidence: 0.98,
      },
      {
        id: 'section-custom',
        headingNodeId: 'heading-custom',
        headingText: 'INDUSTRY ACTIVITIES',
        nodeIds: ['custom-node-1'],
        sourceOrder: 2,
        sectionBoundaryConfidence: 0.74,
      },
    ],
    records: [
      {
        id: 'experience-1',
        sectionId: 'section-experience',
        nodeIds: ['experience-node-1'],
        sourceOrder: 0,
        recordBoundaryConfidence: 0.86,
      },
      {
        id: 'experience-2',
        sectionId: 'section-experience',
        nodeIds: ['experience-node-2'],
        sourceOrder: 1,
        recordBoundaryConfidence: 0.86,
      },
      {
        id: 'reference-1',
        sectionId: 'section-references',
        nodeIds: ['reference-node-1'],
        sourceOrder: 0,
        recordBoundaryConfidence: 0.82,
      },
      {
        id: 'reference-2',
        sectionId: 'section-references',
        nodeIds: ['reference-node-2'],
        sourceOrder: 1,
        recordBoundaryConfidence: 0.82,
      },
      {
        id: 'custom-1',
        sectionId: 'section-custom',
        nodeIds: ['custom-node-1'],
        sourceOrder: 0,
        recordBoundaryConfidence: 0.35,
      },
    ],
    unsectionedNodeIds: ['node-name'],
    diagnostics: [],
  };
}
