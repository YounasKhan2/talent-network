export const RESUME_PROCESSING_STATES = [
  'UPLOADING',
  'UPLOADED',
  'VALIDATING',
  'SCANNING',
  'EXTRACTING',
  'OCR_REQUIRED',
  'PARSING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'REJECTED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
] as const;

export type ResumeProcessingState = (typeof RESUME_PROCESSING_STATES)[number];

const transitions: Readonly<Record<ResumeProcessingState, readonly ResumeProcessingState[]>> = {
  UPLOADING: ['UPLOADED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  UPLOADED: ['VALIDATING', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  VALIDATING: ['SCANNING', 'REJECTED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  SCANNING: ['EXTRACTING', 'REJECTED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  EXTRACTING: ['OCR_REQUIRED', 'PARSING', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  OCR_REQUIRED: ['PARSING', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  PARSING: ['READY_FOR_REVIEW', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  READY_FOR_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
  FAILED_RETRYABLE: ['VALIDATING', 'SCANNING', 'EXTRACTING', 'OCR_REQUIRED', 'PARSING', 'FAILED_TERMINAL'],
  FAILED_TERMINAL: [],
};

export function canTransitionResumeProcessingState(
  current: ResumeProcessingState,
  next: ResumeProcessingState,
): boolean {
  return transitions[current].includes(next);
}

export function assertResumeProcessingTransition(
  current: ResumeProcessingState,
  next: ResumeProcessingState,
): void {
  if (!canTransitionResumeProcessingState(current, next)) {
    throw new Error(`Invalid resume processing transition: ${current} -> ${next}`);
  }
}

export function isResumeProcessingTerminal(state: ResumeProcessingState): boolean {
  return state === 'APPROVED' || state === 'REJECTED' || state === 'FAILED_TERMINAL';
}

export function isResumeReadyForCandidateReview(state: ResumeProcessingState): boolean {
  return state === 'READY_FOR_REVIEW';
}
