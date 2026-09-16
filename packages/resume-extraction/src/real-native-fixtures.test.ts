import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MammothDocxResumeExtractor,
  PdfJsResumeExtractor,
  RESUME_DOCUMENT_SCHEMA_VERSION,
  decideResumeExtractionQuality,
} from './index.js';

const FIXTURE_VERSION_ID = 'native-fixture-resume-version';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fixtureUrl(name: string): URL {
  return new URL(`../test-fixtures/${name}`, import.meta.url);
}

function assertFixtureText(text: string): void {
  assert.match(text, /Alex Morgan/i);
  assert.match(text, /Software Engineer/i);
  assert.match(text, /TypeScript/i);
  assert.match(text, /PostgreSQL/i);
  assert.match(text, /automated testing/i);
}

function assertValidBlocks(
  text: string,
  blocks: Array<{ text: string; sourceRange: { startOffset: number; endOffset: number } }>,
): void {
  for (const block of blocks) {
    const { startOffset, endOffset } = block.sourceRange;
    assert.ok(startOffset >= 0);
    assert.ok(endOffset > startOffset);
    assert.ok(endOffset <= text.length);
    assert.equal(text.slice(startOffset, endOffset), block.text);
  }
}

void test('real native PDF fixture preserves PDF.js text-layer geometry and annotations', async () => {
  const bytes = await readFile(fixtureUrl('synthetic-resume.pdf'));
  const extractor = new PdfJsResumeExtractor();

  const result = await extractor.extract({
    resumeVersionId: FIXTURE_VERSION_ID,
    mimeType: 'application/pdf',
    bytes,
  });

  assert.equal(result.document.schemaVersion, RESUME_DOCUMENT_SCHEMA_VERSION);
  assert.equal(result.document.resumeVersionId, FIXTURE_VERSION_ID);
  assert.equal(result.document.sourceMimeType, 'application/pdf');
  assert.equal(result.document.extractionMethod, 'NATIVE_PDF');
  assert.equal(result.document.extractor.name, 'pdfjs-dist');
  assertFixtureText(result.document.text);
  assert.ok(result.document.pages.length >= 1);
  assert.ok(result.document.quality.nonWhitespaceCharacterCount >= 120);

  result.document.pages.forEach((page, index) => {
    assert.equal(page.pageNumber, index + 1);
    assertValidBlocks(page.text, page.blocks);
    assert.ok((page.lines?.length ?? 0) > 0);

    const nativePdf = page.nativePdf;
    assert.ok(nativePdf);
    assert.equal(nativePdf?.pageNumber, index + 1);
    assert.ok((nativePdf?.viewport.width ?? 0) > 0);
    assert.ok((nativePdf?.viewport.height ?? 0) > 0);
    assert.ok((nativePdf?.view.length ?? 0) >= 4);
    assert.ok(Array.isArray(nativePdf?.annotations));

    const textItems = nativePdf?.textContent.items.filter((item) => item.kind === 'TEXT') ?? [];
    assert.ok(textItems.length > 0);
    assert.ok(textItems.some((item) => item.transform.length >= 6));
    assert.ok(textItems.some((item) => item.width > 0));
    assert.ok(textItems.some((item) => item.height > 0));
    assert.ok(textItems.some((item) => item.fontName.length > 0));
    assert.ok(Object.keys(nativePdf?.textContent.styles ?? {}).length > 0);
  });

  assert.equal(
    decideResumeExtractionQuality(result.document.quality).decision,
    'NATIVE_TEXT_SUFFICIENT',
  );
});

void test('real DOCX fixture extracts through Mammoth without fabricated pagination', async () => {
  const bytes = await readFile(fixtureUrl('synthetic-resume.docx'));
  const extractor = new MammothDocxResumeExtractor();

  const result = await extractor.extract({
    resumeVersionId: FIXTURE_VERSION_ID,
    mimeType: DOCX_MIME,
    bytes,
  });

  assert.equal(result.document.schemaVersion, RESUME_DOCUMENT_SCHEMA_VERSION);
  assert.equal(result.document.resumeVersionId, FIXTURE_VERSION_ID);
  assert.equal(result.document.sourceMimeType, DOCX_MIME);
  assert.equal(result.document.extractionMethod, 'NATIVE_DOCX');
  assert.equal(result.document.extractor.name, 'mammoth');
  assertFixtureText(result.document.text);
  assert.equal(result.document.pages.length, 1);
  assert.equal(result.document.pages[0]?.pageNumber, null);
  assert.equal(result.document.pages[0]?.nativePdf, undefined);
  assert.ok((result.document.pages[0]?.nativeDocx?.blocks.length ?? 0) > 0);
  assert.ok(result.document.quality.nonWhitespaceCharacterCount >= 120);
  assertValidBlocks(result.document.pages[0]?.text ?? '', result.document.pages[0]?.blocks ?? []);

  assert.equal(
    decideResumeExtractionQuality(result.document.quality).decision,
    'NATIVE_TEXT_SUFFICIENT',
  );
});
