import type {
  ResumeBenchmarkEvaluation,
  ResumeBenchmarkGroundTruth,
  ResumeBenchmarkObservation,
} from '@talent-network/contracts';

import { evaluateResumeBenchmark } from './benchmark.js';

export interface ResumeBenchmarkSuiteCase {
  truth: ResumeBenchmarkGroundTruth;
  observation: ResumeBenchmarkObservation;
  artifactStatus: 'SPECIFIED' | 'AVAILABLE';
  tags: readonly string[];
}

export interface ResumeBenchmarkQualityObservation {
  recordF1: number;
  fieldF1: number;
  evidenceGroundingRate: number;
  unknownPreservationRate: number;
  privacyViolationCount: number;
}

export interface ResumeBenchmarkRegressionPolicy {
  minFixtureCount: number;
  minArtifactBackedFixtureCount: number;
  minFixturePassRate: number;
  minSourceCoverageRate: number;
  minRecordF1: number;
  minFieldF1: number;
  minEvidenceGroundingRate: number;
  minUnknownPreservationRate: number;
  maxPrivacyViolationCount: number;
}

export interface ResumeBenchmarkRegressionResult {
  passed: boolean;
  productionReady: boolean;
  fixtureCount: number;
  artifactBackedFixtureCount: number;
  fixturePassRate: number;
  sourceCoverageRate: number;
  evaluations: readonly ResumeBenchmarkEvaluation[];
  failedFixtureIds: readonly string[];
  reasons: readonly ResumeBenchmarkRegressionReason[];
}

export type ResumeBenchmarkRegressionReason =
  | 'FIXTURE_COUNT_TOO_LOW'
  | 'ARTIFACT_BACKED_FIXTURE_COUNT_TOO_LOW'
  | 'FIXTURE_PASS_RATE_TOO_LOW'
  | 'SOURCE_COVERAGE_TOO_LOW'
  | 'RECORD_F1_TOO_LOW'
  | 'FIELD_F1_TOO_LOW'
  | 'EVIDENCE_GROUNDING_TOO_LOW'
  | 'UNKNOWN_PRESERVATION_TOO_LOW'
  | 'PRIVACY_VIOLATION';

export const PHASE_3G_SEED_REGRESSION_POLICY: ResumeBenchmarkRegressionPolicy = {
  minFixtureCount: 6,
  minArtifactBackedFixtureCount: 1,
  minFixturePassRate: 1,
  minSourceCoverageRate: 1,
  minRecordF1: 0.9,
  minFieldF1: 0.9,
  minEvidenceGroundingRate: 0.99,
  minUnknownPreservationRate: 1,
  maxPrivacyViolationCount: 0,
};

export const PRODUCTION_RESUME_BENCHMARK_POLICY: ResumeBenchmarkRegressionPolicy = {
  minFixtureCount: 100,
  minArtifactBackedFixtureCount: 100,
  minFixturePassRate: 0.98,
  minSourceCoverageRate: 1,
  minRecordF1: 0.95,
  minFieldF1: 0.95,
  minEvidenceGroundingRate: 0.99,
  minUnknownPreservationRate: 1,
  maxPrivacyViolationCount: 0,
};

export function evaluateResumeBenchmarkRegression(
  cases: readonly ResumeBenchmarkSuiteCase[],
  quality: ResumeBenchmarkQualityObservation,
  policy: ResumeBenchmarkRegressionPolicy,
): ResumeBenchmarkRegressionResult {
  const evaluations = cases.map(({ truth, observation }) =>
    evaluateResumeBenchmark(truth, observation),
  );
  const fixtureCount = cases.length;
  const artifactBackedFixtureCount = cases.filter(
    (fixture) => fixture.artifactStatus === 'AVAILABLE',
  ).length;
  const passedFixtureCount = evaluations.filter((evaluation) => evaluation.passed).length;
  const fixturePassRate = fixtureCount === 0 ? 0 : passedFixtureCount / fixtureCount;
  const meaningfulSourceCount = cases.reduce(
    (total, fixture) => total + fixture.observation.meaningfulSourceCount,
    0,
  );
  const accountedSourceCount = cases.reduce(
    (total, fixture) => total + fixture.observation.accountedSourceCount,
    0,
  );
  const sourceCoverageRate =
    meaningfulSourceCount === 0 ? 1 : accountedSourceCount / meaningfulSourceCount;
  const failedFixtureIds = evaluations
    .filter((evaluation) => !evaluation.passed)
    .map((evaluation) => evaluation.fixtureId);

  const reasons: ResumeBenchmarkRegressionReason[] = [];
  if (fixtureCount < policy.minFixtureCount) reasons.push('FIXTURE_COUNT_TOO_LOW');
  if (artifactBackedFixtureCount < policy.minArtifactBackedFixtureCount) {
    reasons.push('ARTIFACT_BACKED_FIXTURE_COUNT_TOO_LOW');
  }
  if (fixturePassRate < policy.minFixturePassRate) reasons.push('FIXTURE_PASS_RATE_TOO_LOW');
  if (sourceCoverageRate < policy.minSourceCoverageRate) reasons.push('SOURCE_COVERAGE_TOO_LOW');
  if (quality.recordF1 < policy.minRecordF1) reasons.push('RECORD_F1_TOO_LOW');
  if (quality.fieldF1 < policy.minFieldF1) reasons.push('FIELD_F1_TOO_LOW');
  if (quality.evidenceGroundingRate < policy.minEvidenceGroundingRate) {
    reasons.push('EVIDENCE_GROUNDING_TOO_LOW');
  }
  if (quality.unknownPreservationRate < policy.minUnknownPreservationRate) {
    reasons.push('UNKNOWN_PRESERVATION_TOO_LOW');
  }
  if (quality.privacyViolationCount > policy.maxPrivacyViolationCount) {
    reasons.push('PRIVACY_VIOLATION');
  }

  const passed = reasons.length === 0;
  const productionReady =
    passed &&
    policy.minFixtureCount >= PRODUCTION_RESUME_BENCHMARK_POLICY.minFixtureCount &&
    policy.minArtifactBackedFixtureCount >=
      PRODUCTION_RESUME_BENCHMARK_POLICY.minArtifactBackedFixtureCount;

  return {
    passed,
    productionReady,
    fixtureCount,
    artifactBackedFixtureCount,
    fixturePassRate,
    sourceCoverageRate,
    evaluations,
    failedFixtureIds,
    reasons,
  };
}
