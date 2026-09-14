import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertResumeProcessingTransition,
  canTransitionResumeProcessingState,
  isResumeProcessingTerminal,
  isResumeReadyForCandidateReview,
} from './resume-processing-state.js';

void test('resume processing state machine allows the happy path', () => {
  const path = [
    ['UPLOADING', 'UPLOADED'],
    ['UPLOADED', 'VALIDATING'],
    ['VALIDATING', 'SCANNING'],
    ['SCANNING', 'EXTRACTING'],
    ['EXTRACTING', 'PARSING'],
    ['PARSING', 'READY_FOR_REVIEW'],
    ['READY_FOR_REVIEW', 'APPROVED'],
  ] as const;

  for (const [current, next] of path) {
    assert.equal(canTransitionResumeProcessingState(current, next), true);
    assert.doesNotThrow(() => assertResumeProcessingTransition(current, next));
  }
});

void test('resume processing state machine supports OCR fallback and bounded retry re-entry', () => {
  assert.equal(canTransitionResumeProcessingState('EXTRACTING', 'OCR_REQUIRED'), true);
  assert.equal(canTransitionResumeProcessingState('OCR_REQUIRED', 'PARSING'), true);
  assert.equal(canTransitionResumeProcessingState('PARSING', 'FAILED_RETRYABLE'), true);
  assert.equal(canTransitionResumeProcessingState('FAILED_RETRYABLE', 'PARSING'), true);
});

void test('resume processing state machine blocks invalid and post-terminal transitions', () => {
  assert.equal(canTransitionResumeProcessingState('UPLOADING', 'READY_FOR_REVIEW'), false);
  assert.equal(canTransitionResumeProcessingState('APPROVED', 'PARSING'), false);
  assert.equal(canTransitionResumeProcessingState('REJECTED', 'VALIDATING'), false);
  assert.throws(
    () => assertResumeProcessingTransition('READY_FOR_REVIEW', 'PARSING'),
    /Invalid resume processing transition/,
  );
});

void test('resume processing state helpers distinguish review and terminal states', () => {
  assert.equal(isResumeReadyForCandidateReview('READY_FOR_REVIEW'), true);
  assert.equal(isResumeReadyForCandidateReview('PARSING'), false);
  assert.equal(isResumeProcessingTerminal('APPROVED'), true);
  assert.equal(isResumeProcessingTerminal('REJECTED'), true);
  assert.equal(isResumeProcessingTerminal('FAILED_TERMINAL'), true);
  assert.equal(isResumeProcessingTerminal('FAILED_RETRYABLE'), false);
});
