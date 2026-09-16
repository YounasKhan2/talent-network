import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SEMANTIC_RECOVERY_POLICY,
  evaluateSemanticRecoveryCapability,
  type SemanticRecoveryBenchmarkResult,
  type SemanticRecoveryOperationalResult,
  type SemanticRecoveryProviderCapability,
  type SemanticRecoverySourceCandidate,
} from './semantic-recovery-gate.js';

const provider: SemanticRecoveryProviderCapability = {
  provider: 'fixture-provider',
  model: 'fixture-model-v1',
  deploymentMode: 'REMOTE_API',
  supportsStructuredOutput: true,
  supportsVersionPinning: true,
  trainingDisabledByDefault: true,
  retentionMode: 'BOUNDED',
  maxRetentionDays: 30,
  supportsRegionalProcessingControls: true,
  documentsRateLimits: true,
  exposesUsageMetrics: true,
};

const benchmark: SemanticRecoveryBenchmarkResult = {
  fixtureCount: 120,
  recordF1: 0.97,
  fieldF1: 0.96,
  evidenceGroundingRate: 0.995,
  unknownPreservationRate: 1,
  sourceAccountingRate: 1,
  privacyViolationCount: 0,
};

const operations: SemanticRecoveryOperationalResult = {
  p95LatencyMs: 3200,
  estimatedCostUsdPerResume: 0.03,
};

const unresolved: SemanticRecoverySourceCandidate[] = [
  {
    sourceId: 'experience-4',
    status: 'PARTIALLY_MAPPED',
    semanticTypeKey: 'WORK_EXPERIENCE',
    privacyClass: 'CANDIDATE_PRIVATE',
  },
];

void test('semantic recovery is eligible only for unresolved candidate-owned source after capability checks pass', () => {
  const decision = evaluateSemanticRecoveryCapability(unresolved, provider, benchmark, operations);
  assert.equal(decision.eligible, true);
  assert.deepEqual(decision.candidateSourceIds, ['experience-4']);
  assert.deepEqual(decision.blockedSourceIds, []);
  assert.deepEqual(decision.reasons, []);
});

void test('semantic recovery stays off when deterministic processing left no unresolved source', () => {
  const decision = evaluateSemanticRecoveryCapability([], provider, benchmark, operations);
  assert.equal(decision.eligible, false);
  assert.deepEqual(decision.reasons, ['NO_UNRESOLVED_SOURCE']);
});

void test('remote semantic recovery keeps third-party reference data blocked even when provider otherwise passes', () => {
  const decision = evaluateSemanticRecoveryCapability(
    [
      ...unresolved,
      {
        sourceId: 'reference-1',
        status: 'UNMAPPED',
        semanticTypeKey: 'REFERENCES',
        privacyClass: 'THIRD_PARTY_PRIVATE',
      },
    ],
    provider,
    benchmark,
    operations,
  );

  assert.equal(decision.eligible, true);
  assert.deepEqual(decision.candidateSourceIds, ['experience-4']);
  assert.deepEqual(decision.blockedSourceIds, ['reference-1']);
  assert.ok(decision.reasons.includes('THIRD_PARTY_PRIVATE_REMOTE_BLOCKED'));
});

void test('provider and benchmark weaknesses fail closed with explicit reasons', () => {
  const decision = evaluateSemanticRecoveryCapability(
    unresolved,
    {
      ...provider,
      supportsStructuredOutput: false,
      supportsVersionPinning: false,
      trainingDisabledByDefault: false,
      retentionMode: 'UNKNOWN',
      supportsRegionalProcessingControls: false,
      documentsRateLimits: false,
      exposesUsageMetrics: false,
    },
    {
      ...benchmark,
      fixtureCount: DEFAULT_SEMANTIC_RECOVERY_POLICY.minFixtureCount - 1,
      recordF1: 0.8,
      fieldF1: 0.8,
      evidenceGroundingRate: 0.9,
      unknownPreservationRate: 0.9,
      sourceAccountingRate: 0.9,
      privacyViolationCount: 1,
    },
    {
      p95LatencyMs: DEFAULT_SEMANTIC_RECOVERY_POLICY.maxP95LatencyMs + 1,
      estimatedCostUsdPerResume:
        DEFAULT_SEMANTIC_RECOVERY_POLICY.maxEstimatedCostUsdPerResume + 0.01,
    },
  );

  assert.equal(decision.eligible, false);
  assert.ok(decision.reasons.includes('STRUCTURED_OUTPUT_UNSUPPORTED'));
  assert.ok(decision.reasons.includes('MODEL_VERSION_NOT_PINNABLE'));
  assert.ok(decision.reasons.includes('TRAINING_POLICY_UNACCEPTABLE'));
  assert.ok(decision.reasons.includes('RETENTION_POLICY_UNKNOWN'));
  assert.ok(decision.reasons.includes('REGIONAL_PROCESSING_CONTROL_MISSING'));
  assert.ok(decision.reasons.includes('RATE_LIMITS_UNDOCUMENTED'));
  assert.ok(decision.reasons.includes('USAGE_METRICS_UNAVAILABLE'));
  assert.ok(decision.reasons.includes('BENCHMARK_FIXTURE_COUNT_TOO_LOW'));
  assert.ok(decision.reasons.includes('BENCHMARK_RECORD_F1_TOO_LOW'));
  assert.ok(decision.reasons.includes('BENCHMARK_FIELD_F1_TOO_LOW'));
  assert.ok(decision.reasons.includes('BENCHMARK_EVIDENCE_GROUNDING_TOO_LOW'));
  assert.ok(decision.reasons.includes('BENCHMARK_UNKNOWN_PRESERVATION_TOO_LOW'));
  assert.ok(decision.reasons.includes('BENCHMARK_SOURCE_ACCOUNTING_TOO_LOW'));
  assert.ok(decision.reasons.includes('BENCHMARK_PRIVACY_VIOLATION'));
  assert.ok(decision.reasons.includes('P95_LATENCY_TOO_HIGH'));
  assert.ok(decision.reasons.includes('ESTIMATED_COST_TOO_HIGH'));
});
