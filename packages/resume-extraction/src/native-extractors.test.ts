import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MammothDocxResumeExtractor,
  PdfJsResumeExtractor,
  RESUME_EXTRACTION_LIMITS,
  ResumeExtractionLimitError,
  createBlocks,
  normalizeExtractedText,
} from './index.js';

void test('normalization preserves paragraph boundaries and source offsets', () => {
  const text = normalizeExtractedText('  SUMMARY  \r\n\r\n  Senior engineer  \n\nSkills  ');

  assert.equal(text, 'SUMMARY\n\nSenior engineer\n\nSkills');
  assert.deepEqual(createBlocks(text), [
    { text: 'SUMMARY', sourceRange: { startOffset: 0, endOffset: 7 } },
    { text: 'Senior engineer', sourceRange: { startOffset: 9, endOffset: 24 } },
    { text: 'Skills', sourceRange: { startOffset: 26, endOffset: 32 } },
  ]);
});

void test('native extractors advertise only their supported MIME type', () => {
  const pdf = new PdfJsResumeExtractor();
  const docx = new MammothDocxResumeExtractor();

  assert.equal(pdf.supports('application/pdf'), true);
  assert.equal(pdf.supports('text/plain'), false);
  assert.equal(
    docx.supports('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    true,
  );
  assert.equal(docx.supports('application/pdf'), false);
});

void test('source-size ceilings fail closed before native parsing', async () => {
  const bytes = new Uint8Array(RESUME_EXTRACTION_LIMITS.maximumSourceBytes + 1);
  const pdf = new PdfJsResumeExtractor();

  await assert.rejects(
    () =>
      pdf.extract({
        resumeVersionId: 'resume-version-large',
        mimeType: 'application/pdf',
        bytes,
      }),
    (error: unknown) =>
      error instanceof ResumeExtractionLimitError &&
      error.code === 'RESUME_EXTRACTION_SOURCE_TOO_LARGE',
  );
});

void test('unsupported MIME extraction fails explicitly', async () => {
  const docx = new MammothDocxResumeExtractor();

  await assert.rejects(
    () =>
      docx.extract({
        resumeVersionId: 'resume-version-unsupported',
        mimeType: 'application/pdf',
        bytes: new Uint8Array(),
      }),
    /RESUME_EXTRACTION_UNSUPPORTED_MIME_TYPE/,
  );
});
