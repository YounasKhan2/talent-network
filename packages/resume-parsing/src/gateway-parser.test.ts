import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ResumeAiGatewayError,
  type ResumeAiGateway,
  type ResumeAiGatewayParseRequest,
} from './ai-gateway.js';
import type { ResumeParseInput } from './contracts.js';
import { DeterministicResumeParser, GatewayResumeParser } from './gateway-parser.js';

const PRIVATE_TEXT = 'private.candidate@example.com';

void test('gateway parser binds trusted provider metadata and returns privacy-safe invocation metadata', async () => {
  let observedRequest: ResumeAiGatewayParseRequest | undefined;
  const gateway: ResumeAiGateway = {
    parseResume(request) {
      observedRequest = request;
      return Promise.resolve({
        output: validOutput(),
        provider: 'fixture-provider',
        model: 'fixture-model',
        usage: { inputTokens: 100, outputTokens: 40, estimatedCostUsd: 0.001, durationMs: 25 },
      });
    },
  };

  const parser = new GatewayResumeParser(gateway);
  const result = await parser.parse(input());

  assert.equal(observedRequest?.capability, 'parseResume');
  assert.equal(result.parsedResume.parser.name, 'ai-gateway-resume-parser');
  assert.equal(result.parsedResume.parser.provider, 'fixture-provider');
  assert.equal(result.parsedResume.parser.model, 'fixture-model');
  assert.equal(result.parsedResume.parser.promptVersion, 'resume-parse-prompt-v1');
  assert.equal(result.parsedResume.identityCandidate?.email?.value, PRIVATE_TEXT);

  const safeMetadata = JSON.stringify(result.invocationMetadata);
  assert.equal(safeMetadata.includes(PRIVATE_TEXT), false);
  assert.equal(safeMetadata.includes('SUMMARY'), false);
});

void test('schema-invalid gateway output fails closed as non-retryable structured output failure', async () => {
  const gateway: ResumeAiGateway = {
    parseResume() {
      return Promise.resolve({
        output: {
          ...validOutput(),
          confidenceSummary: { overall: 2, lowConfidenceClaimCount: 0, totalClaimCount: 1 },
        },
        provider: 'fixture-provider',
        model: 'fixture-model',
      });
    },
  };

  const parser = new GatewayResumeParser(gateway);

  await assert.rejects(parser.parse(input()), (error: unknown) => {
    assert.ok(error instanceof ResumeAiGatewayError);
    assert.equal(error.kind, 'INVALID_STRUCTURED_OUTPUT');
    assert.equal(error.retryable, false);
    return true;
  });
});

void test('deterministic parser exercises the same structured-output validator without a live provider', async () => {
  const parser = new DeterministicResumeParser(() => validOutput());
  const result = await parser.parse(input());

  assert.equal(result.parsedResume.parser.name, 'deterministic-fixture-resume-parser');
  assert.equal(result.parsedResume.identityCandidate?.email?.value, PRIVATE_TEXT);
  assert.equal(result.parsedResume.confidenceSummary.overall, 1);
});

void test('gateway retryability classification is preserved for transient provider failures', async () => {
  const gateway: ResumeAiGateway = {
    parseResume() {
      return Promise.reject(new ResumeAiGatewayError('RATE_LIMITED', true, 'provider throttled'));
    },
  };

  const parser = new GatewayResumeParser(gateway);

  await assert.rejects(parser.parse(input()), (error: unknown) => {
    assert.ok(error instanceof ResumeAiGatewayError);
    assert.equal(error.kind, 'RATE_LIMITED');
    assert.equal(error.retryable, true);
    return true;
  });
});

function input(): ResumeParseInput {
  return {
    resumeVersionId: 'resume-version-id',
    sourceExtractionId: 'resume-extraction-id',
    processingPipelineVersion: 'resume-pipeline-v1',
    sourceDocumentSchemaVersion: 'resume-document-v1',
    preprocessedDocument: {
      preprocessingPolicyVersion: 'resume-preprocess-v3',
      sourceDocumentSchemaVersion: 'resume-document-v1',
      resumeVersionId: 'resume-version-id',
      sections: [
        {
          kind: 'SUMMARY',
          heading: 'SUMMARY',
          headingFragment: null,
          fragments: [
            {
              pageNumber: 1,
              blockIndex: 0,
              segmentIndex: 0,
              text: `SUMMARY ${PRIVATE_TEXT}`,
              sourceRange: { start: 0, end: 35 },
            },
          ],
        },
      ],
      chunks: [],
      candidates: [],
    },
  };
}

function validOutput(): Record<string, unknown> {
  return {
    parser: {
      name: 'untrusted-model-value',
      version: 'untrusted-model-value',
      parserPolicyVersion: 'resume-parser-policy-v1',
      evidencePolicyVersion: 'resume-evidence-policy-v1',
    },
    identityCandidate: {
      email: {
        value: PRIVATE_TEXT,
        confidence: 1,
        evidence: [
          {
            resumeExtractionId: 'resume-extraction-id',
            pageNumber: 1,
            blockIndex: 0,
            sourceRange: { start: 8, end: 37 },
            evidenceKind: 'DIRECT_TEXT',
          },
        ],
        warnings: [],
      },
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
    confidenceSummary: { overall: 1, lowConfidenceClaimCount: 0, totalClaimCount: 1 },
  };
}
