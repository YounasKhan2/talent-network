import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARSED_RESUME_SCHEMA_VERSION,
  RESUME_EVIDENCE_POLICY_VERSION,
  RESUME_PARSER_POLICY_VERSION,
  type ParsedEvidence,
  type ParsedResume,
} from './index.js';

test('resume parsing contracts expose explicit version identities', () => {
  assert.equal(PARSED_RESUME_SCHEMA_VERSION, 'parsed-resume-v1');
  assert.equal(RESUME_PARSER_POLICY_VERSION, 'resume-parser-policy-v1');
  assert.equal(RESUME_EVIDENCE_POLICY_VERSION, 'resume-evidence-policy-v1');
});

test('evidence can preserve truthful page-less DOCX semantics', () => {
  const evidence: ParsedEvidence = {
    resumeExtractionId: 'extraction-id',
    pageNumber: null,
    sourceRange: { start: 10, end: 42 },
    evidenceKind: 'DIRECT_TEXT',
  };

  assert.equal(evidence.pageNumber, null);
  assert.deepEqual(evidence.sourceRange, { start: 10, end: 42 });
});

test('parsed resume remains a proposal contract without approval state', () => {
  const parsed: ParsedResume = {
    schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
    resumeVersionId: 'resume-version-id',
    sourceExtractionId: 'extraction-id',
    parser: {
      name: 'fixture-parser',
      version: '1.0.0',
      parserPolicyVersion: RESUME_PARSER_POLICY_VERSION,
      evidencePolicyVersion: RESUME_EVIDENCE_POLICY_VERSION,
    },
    experiences: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    links: [],
    locations: [],
    warnings: [],
    confidenceSummary: { overall: 1, lowConfidenceClaimCount: 0, totalClaimCount: 0 },
  };

  assert.equal(parsed.resumeVersionId, 'resume-version-id');
  assert.equal('approved' in parsed, false);
});
