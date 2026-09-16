import assert from 'node:assert/strict';
import test from 'node:test';

import type { ParsedResume } from './contracts.js';
import type { PreprocessedResumeDocument } from './preprocessing.js';
import {
  ResumeProposalValidationError,
  classifyResumeClaimConfidence,
  validateResumeProposal,
} from './proposal-validation.js';
import {
  PARSED_RESUME_SCHEMA_VERSION,
  RESUME_EVIDENCE_POLICY_VERSION,
  RESUME_PARSER_POLICY_VERSION,
} from './versions.js';

const extractionId = '11111111-1111-1111-1111-111111111111';
const resumeVersionId = '22222222-2222-2222-2222-222222222222';

void test('valid grounded claims reconcile evidence and confidence summary', () => {
  const parsed = parsedResumeWithSkill({ confidence: 0.9, warnings: [] });
  const result = validateResumeProposal(parsed, sourceDocument(), extractionId);

  assert.equal(result.claimCount, 1);
  assert.equal(result.evidenceCount, 1);
  assert.deepEqual(result.confidenceSummary, parsed.confidenceSummary);
  assert.equal(classifyResumeClaimConfidence(0.9), 'HIGH');
});

void test('claims cannot reference another ResumeExtraction', () => {
  const parsed = parsedResumeWithSkill({ confidence: 0.9, warnings: [] });
  parsed.skills[0]!.name.evidence[0]!.resumeExtractionId = '33333333-3333-3333-3333-333333333333';

  assert.throws(
    () => validateResumeProposal(parsed, sourceDocument(), extractionId),
    ResumeProposalValidationError,
  );
});

void test('evidence must map to a real page block and source range', () => {
  const parsed = parsedResumeWithSkill({ confidence: 0.9, warnings: [] });
  parsed.skills[0]!.name.evidence[0]!.sourceRange = { start: 20, end: 25 };

  assert.throws(
    () => validateResumeProposal(parsed, sourceDocument(), extractionId),
    /does not map to a real preprocessed source fragment/,
  );
});

void test('low-confidence claims require an explicit candidate-review warning', () => {
  const parsed = parsedResumeWithSkill({ confidence: 0.4, warnings: [] });
  parsed.confidenceSummary = { overall: 0.4, lowConfidenceClaimCount: 1, totalClaimCount: 1 };

  assert.throws(
    () => validateResumeProposal(parsed, sourceDocument(), extractionId),
    /must surface a review warning/,
  );

  parsed.skills[0]!.name.warnings = ['LOW_CONFIDENCE_REVIEW_REQUIRED'];
  const result = validateResumeProposal(parsed, sourceDocument(), extractionId);
  assert.equal(result.confidenceSummary.lowConfidenceClaimCount, 1);
  assert.equal(classifyResumeClaimConfidence(0.4), 'LOW');
});

void test('confidence summary cannot disagree with the actual parsed claims', () => {
  const parsed = parsedResumeWithSkill({ confidence: 0.9, warnings: [] });
  parsed.confidenceSummary = { overall: 0.7, lowConfidenceClaimCount: 0, totalClaimCount: 1 };

  assert.throws(
    () => validateResumeProposal(parsed, sourceDocument(), extractionId),
    /confidenceSummary.overall does not match/,
  );
});

function parsedResumeWithSkill(input: { confidence: number; warnings: string[] }): ParsedResume {
  return {
    schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
    resumeVersionId,
    sourceExtractionId: extractionId,
    parser: {
      name: 'fixture-parser',
      version: '1',
      parserPolicyVersion: RESUME_PARSER_POLICY_VERSION,
      evidencePolicyVersion: RESUME_EVIDENCE_POLICY_VERSION,
    },
    experiences: [],
    education: [],
    skills: [
      {
        name: {
          value: 'React',
          confidence: input.confidence,
          evidence: [
            {
              resumeExtractionId: extractionId,
              pageNumber: 1,
              blockIndex: 0,
              sourceRange: { start: 0, end: 5 },
              evidenceKind: 'DIRECT_TEXT',
            },
          ],
          warnings: input.warnings,
        },
      },
    ],
    projects: [],
    certifications: [],
    languages: [],
    links: [],
    locations: [],
    warnings: [],
    confidenceSummary: {
      overall: input.confidence,
      lowConfidenceClaimCount: input.confidence < 0.65 ? 1 : 0,
      totalClaimCount: 1,
    },
  };
}

function sourceDocument(): PreprocessedResumeDocument {
  const fragment = {
    pageNumber: 1,
    blockIndex: 0,
    segmentIndex: 0,
    text: 'React',
    sourceRange: { start: 0, end: 5 },
  } as const;

  return {
    preprocessingPolicyVersion: 'resume-preprocess-v3',
    sourceDocumentSchemaVersion: 'resume-document-v1',
    resumeVersionId,
    sections: [
      {
        kind: 'SKILLS',
        heading: 'Skills',
        headingFragment: null,
        fragments: [fragment],
      },
    ],
    chunks: [
      {
        index: 0,
        text: 'React',
        characterCount: 5,
        fragments: [fragment],
      },
    ],
    candidates: [],
  };
}
