import assert from 'node:assert/strict';
import test from 'node:test';
import { GroundedResumeParser } from './grounded-parser.js';
import { preprocessResumeDocument } from './preprocessing.js';
import { validateResumeProposal } from './proposal-validation.js';
import { validateParsedResume } from './schema.js';

void test('parser v5 preserves annotation link provenance and separates coverage from confidence', async () => {
  const blocks = [
    {
      text: 'ALEX MORGAN',
      sourceRange: { startOffset: 0, endOffset: 11 },
      boundingBox: { x: 40, y: 740, width: 100, height: 14 },
    },
    {
      text: 'Senior Full Stack Engineer',
      sourceRange: { startOffset: 12, endOffset: 38 },
      boundingBox: { x: 40, y: 720, width: 180, height: 14 },
    },
    {
      text: 'alex@example.com | LinkedIn',
      sourceRange: { startOffset: 39, endOffset: 67 },
      boundingBox: { x: 40, y: 700, width: 220, height: 14 },
    },
    {
      text: 'PROFESSIONAL SUMMARY',
      sourceRange: { startOffset: 68, endOffset: 88 },
      boundingBox: { x: 40, y: 670, width: 150, height: 14 },
    },
    {
      text: 'Engineer building secure SaaS systems.',
      sourceRange: { startOffset: 89, endOffset: 126 },
      boundingBox: { x: 40, y: 650, width: 240, height: 14 },
    },
    {
      text: 'TECHNICAL SKILLS',
      sourceRange: { startOffset: 127, endOffset: 143 },
      boundingBox: { x: 40, y: 620, width: 120, height: 14 },
    },
    {
      text: 'Frontend React, TypeScript',
      sourceRange: { startOffset: 144, endOffset: 170 },
      boundingBox: { x: 40, y: 600, width: 180, height: 14 },
    },
  ];

  const preprocessedDocument = preprocessResumeDocument({
    schemaVersion: 'resume-document-v2',
    resumeVersionId: 'resume-version-v5',
    text: blocks.map((block) => block.text).join('\n'),
    pages: [
      {
        pageNumber: 1,
        text: blocks.map((block) => block.text).join('\n'),
        blocks,
        nativePdf: {
          annotations: [
            {
              subtype: 'Link',
              url: 'https://www.linkedin.com/in/alex-morgan',
              rect: [180, 699, 250, 716],
            },
          ],
        },
      },
    ],
  });

  const result = await new GroundedResumeParser().parse({
    resumeVersionId: 'resume-version-v5',
    sourceExtractionId: 'extraction-v5',
    processingPipelineVersion: 'resume-v2',
    sourceDocumentSchemaVersion: 'resume-document-v2',
    preprocessedDocument,
  });

  assert.equal(result.parsedResume.parser.version, '5');
  assert.equal(result.parsedResume.links.length, 1);
  assert.equal(
    result.parsedResume.links[0]?.url.normalizedValue,
    'https://www.linkedin.com/in/alex-morgan',
  );
  assert.equal(result.parsedResume.links[0]?.url.evidence[0]?.evidenceKind, 'DERIVED_LINK');
  assert.equal(result.parsedResume.coverageSummary?.status, 'COMPLETE');
  assert.equal(result.parsedResume.coverageSummary?.sourceSectionCount, 4);
  assert.equal(result.parsedResume.coverageSummary?.coveredSectionCount, 4);
  assert.equal(result.parsedResume.coverageSummary?.ratio, 1);

  assert.doesNotThrow(() =>
    validateResumeProposal(result.parsedResume, preprocessedDocument, 'extraction-v5'),
  );

  const structured = validateParsedResume(result.parsedResume, {
    resumeVersionId: 'resume-version-v5',
    sourceExtractionId: 'extraction-v5',
  });
  assert.deepEqual(structured.coverageSummary, result.parsedResume.coverageSummary);
});

void test('parser v5 preserves recognized and unknown headed sections without treating the preamble as custom', async () => {
  const texts = [
    'ALEX MORGAN',
    'Senior Engineer',
    'alex@example.com',
    'PUBLICATIONS',
    'Reliable Multi-Tenant Systems, 2026',
    'INDUSTRY ACTIVITIES',
    'Mentored founders on secure SaaS architecture',
  ];
  let offset = 0;
  const blocks = texts.map((text) => {
    const startOffset = offset;
    offset += text.length + 1;
    return { text, sourceRange: { startOffset, endOffset: startOffset + text.length } };
  });
  const text = texts.join('\n');
  const preprocessedDocument = preprocessResumeDocument({
    schemaVersion: 'resume-document-v2',
    resumeVersionId: 'resume-version-open-world',
    text,
    pages: [{ pageNumber: 1, text, blocks }],
  });

  const result = await new GroundedResumeParser().parse({
    resumeVersionId: 'resume-version-open-world',
    sourceExtractionId: 'extraction-open-world',
    processingPipelineVersion: 'resume-v2',
    sourceDocumentSchemaVersion: 'resume-document-v2',
    preprocessedDocument,
  });

  assert.deepEqual(
    result.parsedResume.additionalSections?.map((section) => section.heading.value),
    ['PUBLICATIONS', 'INDUSTRY ACTIVITIES'],
  );
  assert.equal(result.parsedResume.additionalSections?.[0]?.entries[0]?.value, 'Reliable Multi-Tenant Systems, 2026');
  assert.equal(
    result.parsedResume.additionalSections?.[1]?.entries[0]?.value,
    'Mentored founders on secure SaaS architecture',
  );
  assert.equal(
    result.parsedResume.additionalSections?.some((section) => section.heading.value === 'ALEX MORGAN'),
    false,
  );

  assert.doesNotThrow(() =>
    validateResumeProposal(result.parsedResume, preprocessedDocument, 'extraction-open-world'),
  );
  const structured = validateParsedResume(result.parsedResume, {
    resumeVersionId: 'resume-version-open-world',
    sourceExtractionId: 'extraction-open-world',
  });
  assert.deepEqual(structured.additionalSections, result.parsedResume.additionalSections);
});

void test('coverage does not penalize sections that are absent from the source', async () => {
  const text = 'ALEX MORGAN\nSenior Engineer\nalex@example.com';
  const preprocessedDocument = preprocessResumeDocument({
    schemaVersion: 'resume-document-v2',
    resumeVersionId: 'resume-version-minimal',
    text,
    pages: [
      {
        pageNumber: 1,
        text,
        blocks: [
          { text: 'ALEX MORGAN', sourceRange: { startOffset: 0, endOffset: 11 } },
          { text: 'Senior Engineer', sourceRange: { startOffset: 12, endOffset: 27 } },
          { text: 'alex@example.com', sourceRange: { startOffset: 28, endOffset: 44 } },
        ],
      },
    ],
  });

  const result = await new GroundedResumeParser().parse({
    resumeVersionId: 'resume-version-minimal',
    sourceExtractionId: 'extraction-minimal',
    processingPipelineVersion: 'resume-v2',
    sourceDocumentSchemaVersion: 'resume-document-v2',
    preprocessedDocument,
  });

  const coverage = result.parsedResume.coverageSummary;
  assert.equal(coverage?.sourceSectionCount, 1);
  assert.equal(coverage?.coveredSectionCount, 1);
  assert.equal(coverage?.status, 'COMPLETE');
  assert.equal(
    coverage?.sections.find((section) => section.key === 'EXPERIENCE')?.status,
    'NOT_PRESENT',
  );
});
