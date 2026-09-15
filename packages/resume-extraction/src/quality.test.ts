import assert from 'node:assert/strict';
import test from 'node:test';

import { decideResumeExtractionQuality, type ResumeExtractionQuality } from './index.js';

const healthyQuality = (): ResumeExtractionQuality => ({
  characterCount: 1200,
  nonWhitespaceCharacterCount: 900,
  pageCount: 2,
  pagesWithText: 2,
  replacementCharacterRatio: 0,
  controlCharacterRatio: 0,
  warnings: [],
});

void test('accepts sufficiently extracted native text', () => {
  const result = decideResumeExtractionQuality(healthyQuality());
  assert.equal(result.decision, 'NATIVE_TEXT_SUFFICIENT');
  assert.deepEqual(result.reasons, []);
});

void test('routes text-poor documents to OCR', () => {
  const result = decideResumeExtractionQuality({
    ...healthyQuality(),
    nonWhitespaceCharacterCount: 20,
    pagesWithText: 0,
  });

  assert.equal(result.decision, 'OCR_REQUIRED');
  assert.ok(result.reasons.includes('INSUFFICIENT_TEXT'));
  assert.ok(result.reasons.includes('INSUFFICIENT_TEXT_PAGE_COVERAGE'));
});

void test('routes corrupted-looking native text to OCR', () => {
  const result = decideResumeExtractionQuality({
    ...healthyQuality(),
    replacementCharacterRatio: 0.1,
    controlCharacterRatio: 0.05,
  });

  assert.equal(result.decision, 'OCR_REQUIRED');
  assert.ok(result.reasons.includes('EXCESSIVE_REPLACEMENT_CHARACTERS'));
  assert.ok(result.reasons.includes('EXCESSIVE_CONTROL_CHARACTERS'));
});
