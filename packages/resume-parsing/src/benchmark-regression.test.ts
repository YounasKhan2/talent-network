import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PHASE_3G_SEED_REGRESSION_POLICY,
  PRODUCTION_RESUME_BENCHMARK_POLICY,
  evaluateResumeBenchmarkRegression,
  type ResumeBenchmarkQualityObservation,
} from './benchmark-regression.js';
import { PHASE_3G_SEED_BENCHMARK_CASES } from './benchmark-suite-fixtures.js';

const healthyQuality: ResumeBenchmarkQualityObservation = {
  recordF1: 0.97,
  fieldF1: 0.96,
  evidenceGroundingRate: 0.995,
  unknownPreservationRate: 1,
  privacyViolationCount: 0,
};

void test('seed regression suite spans distinct layout, format, open-world, and privacy cases', () => {
  const fixtureIds = PHASE_3G_SEED_BENCHMARK_CASES.map((fixture) => fixture.truth.fixtureId);
  const sourceFormats = new Set(
    PHASE_3G_SEED_BENCHMARK_CASES.map((fixture) => fixture.truth.sourceFormat),
  );

  assert.equal(new Set(fixtureIds).size, fixtureIds.length);
  assert.ok(fixtureIds.includes('complex-five-page-synthetic-v1'));
  assert.ok(fixtureIds.includes('docx-table-layout-v1'));
  assert.ok(fixtureIds.includes('scanned-ocr-two-page-v1'));
  assert.ok(fixtureIds.includes('two-column-pdf-v1'));
  assert.ok(fixtureIds.includes('open-world-custom-sections-v1'));
  assert.ok(fixtureIds.includes('private-references-v1'));
  assert.deepEqual([...sourceFormats].sort(), ['DOCX', 'IMAGE', 'PDF']);
});

void test('seed regression gate passes only when every seed fixture and quality invariant passes', () => {
  const result = evaluateResumeBenchmarkRegression(
    PHASE_3G_SEED_BENCHMARK_CASES,
    healthyQuality,
    PHASE_3G_SEED_REGRESSION_POLICY,
  );

  assert.equal(result.passed, true);
  assert.equal(result.productionReady, false);
  assert.equal(result.fixturePassRate, 1);
  assert.equal(result.sourceCoverageRate, 1);
  assert.deepEqual(result.failedFixtureIds, []);
  assert.deepEqual(result.reasons, []);
});

void test('one silent record regression fails the suite even when aggregate quality remains high', () => {
  const cases = PHASE_3G_SEED_BENCHMARK_CASES.map((fixture) => {
    if (fixture.truth.fixtureId !== 'two-column-pdf-v1') return fixture;
    return {
      ...fixture,
      observation: {
        ...fixture.observation,
        sections: fixture.observation.sections.map((section) =>
          section.typeKey === 'WORK_EXPERIENCE'
            ? {
                ...section,
                observedSourceCount: section.observedSourceCount - 1,
                mappedCount: section.mappedCount - 1,
              }
            : section,
        ),
      },
    };
  });

  const result = evaluateResumeBenchmarkRegression(
    cases,
    healthyQuality,
    PHASE_3G_SEED_REGRESSION_POLICY,
  );

  assert.equal(result.passed, false);
  assert.ok(result.failedFixtureIds.includes('two-column-pdf-v1'));
  assert.ok(result.reasons.includes('FIXTURE_PASS_RATE_TOO_LOW'));
});

void test('unknown preservation and privacy regressions fail closed', () => {
  const result = evaluateResumeBenchmarkRegression(
    PHASE_3G_SEED_BENCHMARK_CASES,
    {
      ...healthyQuality,
      unknownPreservationRate: 0.99,
      privacyViolationCount: 1,
    },
    PHASE_3G_SEED_REGRESSION_POLICY,
  );

  assert.equal(result.passed, false);
  assert.ok(result.reasons.includes('UNKNOWN_PRESERVATION_TOO_LOW'));
  assert.ok(result.reasons.includes('PRIVACY_VIOLATION'));
});

void test('production readiness remains blocked until the real artifact-backed corpus reaches policy', () => {
  const result = evaluateResumeBenchmarkRegression(
    PHASE_3G_SEED_BENCHMARK_CASES,
    healthyQuality,
    PRODUCTION_RESUME_BENCHMARK_POLICY,
  );

  assert.equal(result.passed, false);
  assert.equal(result.productionReady, false);
  assert.ok(result.reasons.includes('FIXTURE_COUNT_TOO_LOW'));
  assert.ok(result.reasons.includes('ARTIFACT_BACKED_FIXTURE_COUNT_TOO_LOW'));
});
