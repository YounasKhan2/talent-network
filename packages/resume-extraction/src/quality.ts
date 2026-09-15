import type { ResumeExtractionQuality } from './contracts.js';

export const RESUME_EXTRACTION_QUALITY_POLICY_VERSION = 'native-quality-v1' as const;

export type ResumeExtractionQualityDecision =
  | {
      decision: 'NATIVE_TEXT_SUFFICIENT';
      policyVersion: typeof RESUME_EXTRACTION_QUALITY_POLICY_VERSION;
      reasons: string[];
    }
  | {
      decision: 'OCR_REQUIRED';
      policyVersion: typeof RESUME_EXTRACTION_QUALITY_POLICY_VERSION;
      reasons: string[];
    };

export type ResumeExtractionQualityPolicy = {
  minimumNonWhitespaceCharacters: number;
  maximumReplacementCharacterRatio: number;
  maximumControlCharacterRatio: number;
  minimumTextPageRatio: number;
};

export const DEFAULT_RESUME_EXTRACTION_QUALITY_POLICY: ResumeExtractionQualityPolicy = {
  minimumNonWhitespaceCharacters: 120,
  maximumReplacementCharacterRatio: 0.02,
  maximumControlCharacterRatio: 0.01,
  minimumTextPageRatio: 0.5,
};

export function decideResumeExtractionQuality(
  quality: ResumeExtractionQuality,
  policy: ResumeExtractionQualityPolicy = DEFAULT_RESUME_EXTRACTION_QUALITY_POLICY,
): ResumeExtractionQualityDecision {
  const reasons: string[] = [];

  if (quality.nonWhitespaceCharacterCount < policy.minimumNonWhitespaceCharacters) {
    reasons.push('INSUFFICIENT_TEXT');
  }

  if (quality.replacementCharacterRatio > policy.maximumReplacementCharacterRatio) {
    reasons.push('EXCESSIVE_REPLACEMENT_CHARACTERS');
  }

  if (quality.controlCharacterRatio > policy.maximumControlCharacterRatio) {
    reasons.push('EXCESSIVE_CONTROL_CHARACTERS');
  }

  const textPageRatio = quality.pageCount === 0 ? 0 : quality.pagesWithText / quality.pageCount;
  if (textPageRatio < policy.minimumTextPageRatio) {
    reasons.push('INSUFFICIENT_TEXT_PAGE_COVERAGE');
  }

  if (reasons.length > 0) {
    return {
      decision: 'OCR_REQUIRED',
      policyVersion: RESUME_EXTRACTION_QUALITY_POLICY_VERSION,
      reasons,
    };
  }

  return {
    decision: 'NATIVE_TEXT_SUFFICIENT',
    policyVersion: RESUME_EXTRACTION_QUALITY_POLICY_VERSION,
    reasons: [],
  };
}
