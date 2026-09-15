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

void test('accepts quality metrics exactly at inclusive policy boundaries', () => {
  const result = decideResumeExtractionQuality({
    ...healthyQuality(),
    nonWhitespaceCharacterCount: 120,
    pageCount: 2,
    pagesWithText: 1,
    replacementCharacterRatio: 0.02,
    controlCharacterRatio: 0.01,
  });

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

void test('routes documents just below the minimum text threshold to OCR', () => {
  const result = decideResumeExtractionQuality({
    ...healthyQuality(),
    nonWhitespaceCharacterCount: 119,
  });

  assert.equal(result.decision, 'OCR_REQUIRED');
  assert.deepEqual(result.reasons, ['INSUFFICIENT_TEXT']);
});

void test('routes documents below the minimum text-page coverage to OCR', () => {
  const result = decideResumeExtractionQuality({
    ...healthyQuality(),
    pageCount: 3,
    pagesWithText: 1,
  });

  assert.equal(result.decision, 'OCR_REQUIRED');
  assert.deepEqual(result.reasons, ['INSUFFICIENT_TEXT_PAGE_COVERAGE']);
});

void test('routes zero-page extraction results to OCR', () => {
  const result = decideResumeExtractionQuality({
    ...healthyQuality(),
    pageCount: 0,
    pagesWithText: 0,
  });

  assert.equal(result.decision, 'OCR_REQUIRED');
  assert.deepEqual(result.reasons, ['INSUFFICIENT_TEXT_PAGE_COVERAGE']);
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

void test('routes metrics just above corruption thresholds to OCR', () => {
  const result = decideResumeExtractionQuality({
    ...healthyQuality(),
    replacementCharacterRatio: 0.020001,
    controlCharacterRatio: 0.010001,
  });

  assert.equal(result.decision, 'OCR_REQUIRED');
  assert.deepEqual(result.reasons, [
    'EXCESSIVE_REPLACEMENT_CHARACTERS',
    'EXCESSIVE_CONTROL_CHARACTERS',
  ]);
});
