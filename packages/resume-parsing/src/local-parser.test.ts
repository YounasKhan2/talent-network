import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalDeterministicResumeParser } from './local-parser.js';
import { preprocessResumeDocument } from './preprocessing.js';
import { validateResumeProposal } from './proposal-validation.js';

void test('runtime parser emits only source-grounded deterministic contact claims', async () => {
  const preprocessedDocument = preprocessResumeDocument({
    schemaVersion: 'resume-document-v1',
    resumeVersionId: 'resume-version-1',
    text: 'CONTACT\nprivate@example.com\n+92 300 1234567\nhttps://example.com/me',
    pages: [
      {
        pageNumber: 1,
        text: 'CONTACT\nprivate@example.com\n+92 300 1234567\nhttps://example.com/me',
        blocks: [
          { text: 'CONTACT', sourceRange: { startOffset: 0, endOffset: 7 } },
          {
            text: 'private@example.com',
            sourceRange: { startOffset: 8, endOffset: 27 },
          },
          { text: '+92 300 1234567', sourceRange: { startOffset: 28, endOffset: 43 } },
          {
            text: 'https://example.com/me',
            sourceRange: { startOffset: 44, endOffset: 66 },
          },
        ],
      },
    ],
  });
  const parser = new LocalDeterministicResumeParser();

  const result = await parser.parse({
    resumeVersionId: 'resume-version-1',
    sourceExtractionId: 'extraction-1',
    processingPipelineVersion: 'resume-v1',
    sourceDocumentSchemaVersion: 'resume-document-v1',
    preprocessedDocument,
  });

  assert.equal(result.parsedResume.identityCandidate?.email?.value, 'private@example.com');
  assert.equal(result.parsedResume.identityCandidate?.phone?.value, '+92 300 1234567');
  assert.equal(result.parsedResume.links[0]?.url.value, 'https://example.com/me');
  assert.deepEqual(result.parsedResume.experiences, []);
  assert.deepEqual(result.parsedResume.education, []);

  const validation = validateResumeProposal(
    result.parsedResume,
    preprocessedDocument,
    'extraction-1',
  );
  assert.equal(validation.claimCount, 3);
  assert.equal(validation.evidenceCount, 3);
});

void test('runtime parser returns a valid empty proposal when no deterministic claim is provable', async () => {
  const preprocessedDocument = preprocessResumeDocument({
    schemaVersion: 'resume-document-v1',
    resumeVersionId: 'resume-version-empty',
    text: 'EXPERIENCE\nBuilt internal systems',
    pages: [
      {
        pageNumber: 1,
        text: 'EXPERIENCE\nBuilt internal systems',
        blocks: [
          { text: 'EXPERIENCE', sourceRange: { startOffset: 0, endOffset: 10 } },
          {
            text: 'Built internal systems',
            sourceRange: { startOffset: 11, endOffset: 33 },
          },
        ],
      },
    ],
  });
  const result = await new LocalDeterministicResumeParser().parse({
    resumeVersionId: 'resume-version-empty',
    sourceExtractionId: 'extraction-empty',
    processingPipelineVersion: 'resume-v1',
    sourceDocumentSchemaVersion: 'resume-document-v1',
    preprocessedDocument,
  });

  assert.equal(result.parsedResume.confidenceSummary.totalClaimCount, 0);
  assert.equal(result.parsedResume.confidenceSummary.overall, 0);
  assert.equal(result.parsedResume.warnings.length, 1);
  assert.doesNotThrow(() =>
    validateResumeProposal(result.parsedResume, preprocessedDocument, 'extraction-empty'),
  );
});

void test('runtime parser derives grounded name headline summary and skills without inventing records', async () => {
  const blocks = [
    'ALEX MORGAN',
    'Senior Full Stack Engineer',
    'alex@example.com',
    'PROFESSIONAL SUMMARY',
    'Full-stack engineer building secure multi-tenant SaaS platforms.',
    'TECHNICAL SKILLS',
    'Frontend: React, Next.js, TypeScript',
    'Backend: Node.js, NestJS, PostgreSQL',
    'EXPERIENCE',
    'Acme Systems',
    'Senior Engineer 2024 - 2026',
  ];

  let offset = 0;
  const sourceBlocks = blocks.map((text) => {
    const startOffset = offset;
    const endOffset = startOffset + text.length;
    offset = endOffset + 1;
    return { text, sourceRange: { startOffset, endOffset } };
  });

  const preprocessedDocument = preprocessResumeDocument({
    schemaVersion: 'resume-document-v2',
    resumeVersionId: 'resume-version-semantics',
    text: blocks.join('\n'),
    pages: [
      {
        pageNumber: 1,
        text: blocks.join('\n'),
        blocks: sourceBlocks,
      },
    ],
  });

  const result = await new LocalDeterministicResumeParser().parse({
    resumeVersionId: 'resume-version-semantics',
    sourceExtractionId: 'extraction-semantics',
    processingPipelineVersion: 'resume-v2',
    sourceDocumentSchemaVersion: 'resume-document-v2',
    preprocessedDocument,
  });

  assert.equal(result.parsedResume.identityCandidate?.fullName?.value, 'ALEX MORGAN');
  assert.equal(result.parsedResume.headline?.value, 'Senior Full Stack Engineer');
  assert.equal(
    result.parsedResume.summary?.value,
    'Full-stack engineer building secure multi-tenant SaaS platforms.',
  );
  assert.deepEqual(
    result.parsedResume.skills.map((skill) => skill.name.value),
    ['React', 'Next.js', 'TypeScript', 'Node.js', 'NestJS', 'PostgreSQL'],
  );
  assert.deepEqual(result.parsedResume.experiences, []);
  assert.deepEqual(result.parsedResume.education, []);

  const validation = validateResumeProposal(
    result.parsedResume,
    preprocessedDocument,
    'extraction-semantics',
  );
  assert.equal(validation.claimCount, 16);
  assert.equal(validation.confidenceSummary.lowConfidenceClaimCount, 0);
});
