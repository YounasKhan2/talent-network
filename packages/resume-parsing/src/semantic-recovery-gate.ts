import type { CareerPassportSectionTypeKey } from '@talent-network/contracts';

export type SemanticRecoveryRetentionMode = 'ZERO' | 'BOUNDED' | 'UNKNOWN';
export type SemanticRecoveryDeploymentMode = 'REMOTE_API' | 'SELF_HOSTED';
export type SemanticRecoveryPrivacyClass = 'CANDIDATE_PRIVATE' | 'THIRD_PARTY_PRIVATE';

export interface SemanticRecoverySourceCandidate {
  sourceId: string;
  status: 'UNMAPPED' | 'PARTIALLY_MAPPED';
  semanticTypeKey?: CareerPassportSectionTypeKey;
  privacyClass: SemanticRecoveryPrivacyClass;
}

export interface SemanticRecoveryProviderCapability {
  provider: string;
  model: string;
  deploymentMode: SemanticRecoveryDeploymentMode;
  supportsStructuredOutput: boolean;
  supportsVersionPinning: boolean;
  trainingDisabledByDefault: boolean;
  retentionMode: SemanticRecoveryRetentionMode;
  maxRetentionDays?: number;
  supportsRegionalProcessingControls: boolean;
  documentsRateLimits: boolean;
  exposesUsageMetrics: boolean;
}

export interface SemanticRecoveryBenchmarkResult {
  fixtureCount: number;
  recordF1: number;
  fieldF1: number;
  evidenceGroundingRate: number;
  unknownPreservationRate: number;
  sourceAccountingRate: number;
  privacyViolationCount: number;
}

export interface SemanticRecoveryOperationalResult {
  p95LatencyMs: number;
  estimatedCostUsdPerResume: number;
}

export interface SemanticRecoveryPolicy {
  minFixtureCount: number;
  minRecordF1: number;
  minFieldF1: number;
  minEvidenceGroundingRate: number;
  minUnknownPreservationRate: number;
  minSourceAccountingRate: number;
  maxPrivacyViolationCount: number;
  maxP95LatencyMs: number;
  maxEstimatedCostUsdPerResume: number;
  maxRemoteRetentionDays: number;
  allowThirdPartyPrivateRemote: boolean;
}

export const DEFAULT_SEMANTIC_RECOVERY_POLICY: SemanticRecoveryPolicy = {
  minFixtureCount: 100,
  minRecordF1: 0.95,
  minFieldF1: 0.95,
  minEvidenceGroundingRate: 0.99,
  minUnknownPreservationRate: 1,
  minSourceAccountingRate: 1,
  maxPrivacyViolationCount: 0,
  maxP95LatencyMs: 5000,
  maxEstimatedCostUsdPerResume: 0.05,
  maxRemoteRetentionDays: 30,
  allowThirdPartyPrivateRemote: false,
};

export type SemanticRecoveryGateReason =
  | 'NO_UNRESOLVED_SOURCE'
  | 'THIRD_PARTY_PRIVATE_REMOTE_BLOCKED'
  | 'STRUCTURED_OUTPUT_UNSUPPORTED'
  | 'MODEL_VERSION_NOT_PINNABLE'
  | 'TRAINING_POLICY_UNACCEPTABLE'
  | 'RETENTION_POLICY_UNKNOWN'
  | 'RETENTION_POLICY_EXCEEDED'
  | 'REGIONAL_PROCESSING_CONTROL_MISSING'
  | 'RATE_LIMITS_UNDOCUMENTED'
  | 'USAGE_METRICS_UNAVAILABLE'
  | 'BENCHMARK_FIXTURE_COUNT_TOO_LOW'
  | 'BENCHMARK_RECORD_F1_TOO_LOW'
  | 'BENCHMARK_FIELD_F1_TOO_LOW'
  | 'BENCHMARK_EVIDENCE_GROUNDING_TOO_LOW'
  | 'BENCHMARK_UNKNOWN_PRESERVATION_TOO_LOW'
  | 'BENCHMARK_SOURCE_ACCOUNTING_TOO_LOW'
  | 'BENCHMARK_PRIVACY_VIOLATION'
  | 'P95_LATENCY_TOO_HIGH'
  | 'ESTIMATED_COST_TOO_HIGH';

export interface SemanticRecoveryGateDecision {
  eligible: boolean;
  candidateSourceIds: readonly string[];
  blockedSourceIds: readonly string[];
  reasons: readonly SemanticRecoveryGateReason[];
}

export function evaluateSemanticRecoveryCapability(
  sources: readonly SemanticRecoverySourceCandidate[],
  provider: SemanticRecoveryProviderCapability,
  benchmark: SemanticRecoveryBenchmarkResult,
  operations: SemanticRecoveryOperationalResult,
  policy: SemanticRecoveryPolicy = DEFAULT_SEMANTIC_RECOVERY_POLICY,
): SemanticRecoveryGateDecision {
  const unresolved = sources.filter(
    (source) => source.status === 'UNMAPPED' || source.status === 'PARTIALLY_MAPPED',
  );
  if (unresolved.length === 0) {
    return {
      eligible: false,
      candidateSourceIds: [],
      blockedSourceIds: [],
      reasons: ['NO_UNRESOLVED_SOURCE'],
    };
  }

  const blockedSourceIds = unresolved
    .filter(
      (source) =>
        provider.deploymentMode === 'REMOTE_API' &&
        source.privacyClass === 'THIRD_PARTY_PRIVATE' &&
        !policy.allowThirdPartyPrivateRemote,
    )
    .map((source) => source.sourceId);
  const blockedSourceSet = new Set(blockedSourceIds);
  const candidateSourceIds = unresolved
    .filter((source) => !blockedSourceSet.has(source.sourceId))
    .map((source) => source.sourceId);

  const reasons: SemanticRecoveryGateReason[] = [];
  if (blockedSourceIds.length > 0) reasons.push('THIRD_PARTY_PRIVATE_REMOTE_BLOCKED');
  if (!provider.supportsStructuredOutput) reasons.push('STRUCTURED_OUTPUT_UNSUPPORTED');
  if (!provider.supportsVersionPinning) reasons.push('MODEL_VERSION_NOT_PINNABLE');
  if (!provider.trainingDisabledByDefault) reasons.push('TRAINING_POLICY_UNACCEPTABLE');
  if (provider.deploymentMode === 'REMOTE_API') {
    if (provider.retentionMode === 'UNKNOWN') reasons.push('RETENTION_POLICY_UNKNOWN');
    if (
      provider.retentionMode === 'BOUNDED' &&
      (provider.maxRetentionDays === undefined ||
        provider.maxRetentionDays > policy.maxRemoteRetentionDays)
    ) {
      reasons.push('RETENTION_POLICY_EXCEEDED');
    }
    if (!provider.supportsRegionalProcessingControls) {
      reasons.push('REGIONAL_PROCESSING_CONTROL_MISSING');
    }
  }
  if (!provider.documentsRateLimits) reasons.push('RATE_LIMITS_UNDOCUMENTED');
  if (!provider.exposesUsageMetrics) reasons.push('USAGE_METRICS_UNAVAILABLE');
  if (benchmark.fixtureCount < policy.minFixtureCount)
    reasons.push('BENCHMARK_FIXTURE_COUNT_TOO_LOW');
  if (benchmark.recordF1 < policy.minRecordF1) reasons.push('BENCHMARK_RECORD_F1_TOO_LOW');
  if (benchmark.fieldF1 < policy.minFieldF1) reasons.push('BENCHMARK_FIELD_F1_TOO_LOW');
  if (benchmark.evidenceGroundingRate < policy.minEvidenceGroundingRate) {
    reasons.push('BENCHMARK_EVIDENCE_GROUNDING_TOO_LOW');
  }
  if (benchmark.unknownPreservationRate < policy.minUnknownPreservationRate) {
    reasons.push('BENCHMARK_UNKNOWN_PRESERVATION_TOO_LOW');
  }
  if (benchmark.sourceAccountingRate < policy.minSourceAccountingRate) {
    reasons.push('BENCHMARK_SOURCE_ACCOUNTING_TOO_LOW');
  }
  if (benchmark.privacyViolationCount > policy.maxPrivacyViolationCount) {
    reasons.push('BENCHMARK_PRIVACY_VIOLATION');
  }
  if (operations.p95LatencyMs > policy.maxP95LatencyMs) reasons.push('P95_LATENCY_TOO_HIGH');
  if (operations.estimatedCostUsdPerResume > policy.maxEstimatedCostUsdPerResume) {
    reasons.push('ESTIMATED_COST_TOO_HIGH');
  }

  const providerOrBenchmarkBlocked = reasons.some(
    (reason) => reason !== 'THIRD_PARTY_PRIVATE_REMOTE_BLOCKED',
  );
  return {
    eligible: candidateSourceIds.length > 0 && !providerOrBenchmarkBlocked,
    candidateSourceIds,
    blockedSourceIds,
    reasons,
  };
}
