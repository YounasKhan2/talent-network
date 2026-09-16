import assert from 'node:assert/strict';
import test from 'node:test';

import type { ResumeDocumentGraphSource } from './document-graph.js';
import {
  preprocessResumeDocument,
  type ResumePreprocessingDocumentInput,
} from './preprocessing.js';
import { validateResumeProposal } from './proposal-validation.js';
import { ResumeIntelligenceV2Parser } from './runtime-v2-parser.js';

const RESUME_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const EXTRACTION_ID = '22222222-2222-4222-8222-222222222222';

type RuntimeFixtureDocument = ResumeDocumentGraphSource & ResumePreprocessingDocumentInput;

void test('runtime V2 parser closes graph structure extraction ledger and sanitized review telemetry', async () => {
  const document = fixtureDocument();
  const preprocessedDocument = preprocessResumeDocument(document);
  const parser = new ResumeIntelligenceV2Parser();

  const draft = await parser.parse({
    resumeVersionId: RESUME_VERSION_ID,
    sourceExtractionId: EXTRACTION_ID,
    processingPipelineVersion: 'resume-v1',
    sourceDocumentSchemaVersion: document.schemaVersion,
    sourceDocument: document,
    preprocessedDocument,
  });

  assert.equal(draft.parsedResume.parser.name, 'resume-intelligence-v2-parser');
  assert.equal(draft.parsedResume.parser.version, '1');
  assert.equal(draft.parsedResume.experiences.length, 1);
  assert.equal(draft.parsedResume.experiences[0]?.role?.value, 'Senior Software Engineer');
  assert.equal(draft.parsedResume.skills.length, 2);
  assert.equal(draft.parsedResume.runtimeV2?.sourceCoverage.status, 'COMPLETE');
  assert.equal(draft.parsedResume.runtimeV2?.privateSourceCount, 1);
  assert.equal(draft.parsedResume.runtimeV2?.privateContentPersisted, false);
  assert.equal(draft.parsedResume.runtimeV2?.documentQuality, 1);
  assert.ok((draft.parsedResume.runtimeV2?.structuralConfidence ?? 0) > 0);
  assert.ok(
    draft.parsedResume.additionalSections?.some(
      (section) => section.heading.value === 'CUSTOM EXPERIMENTS',
    ),
  );

  const serialized = JSON.stringify(draft.parsedResume);
  assert.equal(serialized.includes('jane.reference@example.com'), false);
  assert.equal(serialized.includes('+1 202 555 0199'), false);

  const validation = validateResumeProposal(
    draft.parsedResume,
    preprocessedDocument,
    EXTRACTION_ID,
  );
  assert.equal(
    validation.confidenceSummary.totalClaimCount,
    draft.parsedResume.confidenceSummary.totalClaimCount,
  );
});

void test('runtime V2 parser fails closed without the verified source document', async () => {
  const document = fixtureDocument();
  const parser = new ResumeIntelligenceV2Parser();

  await assert.rejects(
    parser.parse({
      resumeVersionId: RESUME_VERSION_ID,
      sourceExtractionId: EXTRACTION_ID,
      processingPipelineVersion: 'resume-v1',
      sourceDocumentSchemaVersion: document.schemaVersion,
      preprocessedDocument: preprocessResumeDocument(document),
    }),
    /requires the verified source ResumeDocument/i,
  );
});

function fixtureDocument(): RuntimeFixtureDocument {
  const lines = [
    'Alex Morgan',
    'Senior Software Engineer',
    'alex.morgan@example.com',
    'PROFESSIONAL SUMMARY',
    'Platform engineer focused on reliable distributed systems and developer productivity.',
    'EXPERIENCE',
    'Senior Software Engineer',
    'Jan 2021 - Present',
    'Northstar Labs',
    'SKILLS',
    'TypeScript, PostgreSQL',
    'CUSTOM EXPERIMENTS',
    'Built an internal reliability lab for incident simulations.',
    'REFERENCES',
    'Jane Reference | jane.reference@example.com | +1 202 555 0199',
  ];
  let cursor = 0;
  const blocks = lines.map((text) => {
    const startOffset = cursor;
    const endOffset = startOffset + text.length;
    cursor = endOffset + 1;
    return { text, sourceRange: { startOffset, endOffset } };
  });
  const text = lines.join('\n');

  return {
    schemaVersion: 'resume-document-v2',
    resumeVersionId: RESUME_VERSION_ID,
    extractionMethod: 'NATIVE_PDF',
    extractor: { name: 'fixture-pdf', version: '1' },
    text,
    pages: [{ pageNumber: 1, text, blocks }],
    quality: {
      pageCount: 1,
      pagesWithText: 1,
      replacementCharacterRatio: 0,
      controlCharacterRatio: 0,
      warnings: [],
    },
  };
}
