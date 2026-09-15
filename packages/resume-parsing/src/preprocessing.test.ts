import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RESUME_PREPROCESSING_POLICY_VERSION,
  buildBoundedChunks,
  classifyResumeSectionHeading,
  detectDeterministicCandidates,
  preprocessResumeDocument,
  type ResumePreprocessingDocumentInput,
  type ResumeSourceFragment,
} from './preprocessing.js';

void test('classifies known headings and preserves unknown uppercase sections as OTHER', () => {
  assert.equal(classifyResumeSectionHeading('Professional Experience'), 'EXPERIENCE');
  assert.equal(classifyResumeSectionHeading('TECHNICAL SKILLS'), 'SKILLS');
  assert.equal(classifyResumeSectionHeading('VOLUNTEERING'), 'OTHER');
  assert.equal(classifyResumeSectionHeading('Senior Software Engineer'), null);
});

void test('preprocessing preserves PDF page, block and source ranges across sections', () => {
  const document = fixtureDocument([
    page(1, [
      block('Alex Morgan', 0),
      block('SUMMARY', 20),
      block('Backend engineer focused on reliable systems.', 30),
      block('EXPERIENCE', 80),
      block('Acme Corp — Senior Engineer', 95),
      block('SKILLS', 130),
      block('TypeScript PostgreSQL Redis', 140),
    ]),
  ]);

  const result = preprocessResumeDocument(document);

  assert.equal(result.preprocessingPolicyVersion, RESUME_PREPROCESSING_POLICY_VERSION);
  assert.deepEqual(
    result.sections.map((section) => section.kind),
    ['OTHER', 'SUMMARY', 'EXPERIENCE', 'SKILLS'],
  );

  const experience = result.sections[2];
  assert.equal(experience?.heading, 'EXPERIENCE');
  assert.deepEqual(experience?.headingFragment?.sourceRange, { start: 80, end: 90 });
  assert.equal(experience?.fragments[1]?.pageNumber, 1);
  assert.equal(experience?.fragments[1]?.blockIndex, 4);
  assert.deepEqual(experience?.fragments[1]?.sourceRange, { start: 95, end: 122 });
});

void test('preprocessing keeps DOCX page identity null instead of fabricating pagination', () => {
  const document = fixtureDocument([
    page(null, [block('EDUCATION', 0), block('BS Software Engineering', 12)]),
  ]);

  const result = preprocessResumeDocument(document);

  assert.equal(result.sections[0]?.headingFragment?.pageNumber, null);
  assert.equal(result.sections[0]?.fragments[1]?.pageNumber, null);
  assert.equal(result.chunks[0]?.fragments[0]?.pageNumber, null);
});

void test('unknown custom sections remain explicit OTHER sections instead of being discarded', () => {
  const document = fixtureDocument([
    page(1, [
      block('EXPERIENCE', 0),
      block('Engineer at Acme', 12),
      block('COMMUNITY LEADERSHIP', 40),
      block('Organized developer meetups.', 62),
    ]),
  ]);

  const result = preprocessResumeDocument(document);

  assert.deepEqual(
    result.sections.map((section) => [section.kind, section.heading]),
    [
      ['EXPERIENCE', 'EXPERIENCE'],
      ['OTHER', 'COMMUNITY LEADERSHIP'],
    ],
  );
  assert.equal(result.sections[1]?.fragments[1]?.text, 'Organized developer meetups.');
});

void test('bounded chunks never exceed the requested limit and preserve split source coordinates', () => {
  const fragments: ResumeSourceFragment[] = [
    {
      pageNumber: 2,
      blockIndex: 3,
      segmentIndex: 0,
      text: 'abcdefghij',
      sourceRange: { start: 100, end: 110 },
    },
  ];

  const chunks = buildBoundedChunks(fragments, 4);

  assert.deepEqual(
    chunks.map((chunk) => chunk.text),
    ['abcd', 'efgh', 'ij'],
  );
  assert.ok(chunks.every((chunk) => chunk.characterCount <= 4));
  assert.deepEqual(
    chunks.map((chunk) => chunk.fragments[0]?.sourceRange),
    [
      { start: 100, end: 104 },
      { start: 104, end: 108 },
      { start: 108, end: 110 },
    ],
  );
  assert.deepEqual(
    chunks.map((chunk) => chunk.fragments[0]?.segmentIndex),
    [0, 1, 2],
  );
});

void test('oversized fragments fail closed when source offsets are not one-to-one with text', () => {
  const fragments: ResumeSourceFragment[] = [
    {
      pageNumber: 1,
      blockIndex: 0,
      segmentIndex: 0,
      text: 'abcdefghij',
      sourceRange: { start: 0, end: 99 },
    },
  ];

  assert.throws(
    () => buildBoundedChunks(fragments, 4),
    /Cannot split a source fragment whose source range does not map 1:1 to its text/,
  );
});

void test('deterministic contact candidates retain exact source coordinates', () => {
  const text = 'alex@example.com +92 300 1234567 https://example.com/alex';
  const fragments: ResumeSourceFragment[] = [
    {
      pageNumber: 1,
      blockIndex: 0,
      segmentIndex: 0,
      text,
      sourceRange: { start: 50, end: 50 + text.length },
    },
  ];

  const detections = detectDeterministicCandidates(fragments);
  const email = detections.find((item) => item.kind === 'EMAIL');
  const phone = detections.find((item) => item.kind === 'PHONE');
  const url = detections.find((item) => item.kind === 'URL');

  assert.equal(email?.value, 'alex@example.com');
  assert.deepEqual(email?.sourceRange, { start: 50, end: 66 });
  assert.equal(phone?.value, '+92 300 1234567');
  assert.equal(url?.value, 'https://example.com/alex');
  assert.equal(url?.pageNumber, 1);
  assert.equal(url?.blockIndex, 0);
});

function fixtureDocument(
  pages: ResumePreprocessingDocumentInput['pages'],
): ResumePreprocessingDocumentInput {
  return {
    schemaVersion: 'resume-document-v1',
    resumeVersionId: 'resume-version-id',
    text: pages.map((value) => value.text).join('\n\n'),
    pages,
  };
}

function page(
  pageNumber: number | null,
  blocks: ResumePreprocessingDocumentInput['pages'][number]['blocks'],
): ResumePreprocessingDocumentInput['pages'][number] {
  return {
    pageNumber,
    text: blocks.map((value) => value.text).join('\n\n'),
    blocks,
  };
}

function block(
  text: string,
  startOffset: number,
): ResumePreprocessingDocumentInput['pages'][number]['blocks'][number] {
  return {
    text,
    sourceRange: { startOffset, endOffset: startOffset + text.length },
  };
}
