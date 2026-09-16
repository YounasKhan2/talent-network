import type {
  ResumeBenchmarkEvaluation,
  ResumeBenchmarkGroundTruth,
  ResumeBenchmarkObservation,
  ResumeBenchmarkSectionResult,
} from '@talent-network/contracts';

export function evaluateResumeBenchmark(
  truth: ResumeBenchmarkGroundTruth,
  observation: ResumeBenchmarkObservation,
): ResumeBenchmarkEvaluation {
  if (truth.fixtureId !== observation.fixtureId) {
    throw new Error('Benchmark fixture identity mismatch.');
  }

  const observed = new Map(observation.sections.map((section) => [section.typeKey, section]));
  const sectionResults: ResumeBenchmarkSectionResult[] = truth.sections.map((expected) => {
    const actual = observed.get(expected.typeKey);
    const observedSourceCount = actual?.observedSourceCount ?? 0;
    const accountedCount = actual
      ? actual.mappedCount +
        actual.partiallyMappedCount +
        actual.unmappedCount +
        actual.privateOnlyCount
      : 0;
    const expectedCount = expected.expectedCount ?? null;

    return {
      typeKey: expected.typeKey,
      expectedCount,
      observedSourceCount,
      countMatches: expectedCount === null ? null : observedSourceCount === expectedCount,
      accountedCount,
      accountingComplete: observedSourceCount === accountedCount,
    };
  });

  const missingRequiredSections = truth.sections
    .filter((expected) => expected.required && !observed.has(expected.typeKey))
    .map((expected) => expected.typeKey);

  const mismatchedCountSections = sectionResults
    .filter((result) => result.countMatches === false)
    .map((result) => result.typeKey);

  const sourceAccountingComplete =
    observation.unprocessedSourceCount === 0 &&
    observation.meaningfulSourceCount === observation.accountedSourceCount &&
    sectionResults.every((result) => result.accountingComplete);

  const sourceCoverageRatio =
    observation.meaningfulSourceCount === 0
      ? 1
      : observation.accountedSourceCount / observation.meaningfulSourceCount;

  return {
    fixtureId: truth.fixtureId,
    passed:
      sourceAccountingComplete &&
      missingRequiredSections.length === 0 &&
      mismatchedCountSections.length === 0,
    sourceAccountingComplete,
    sourceCoverageRatio,
    missingRequiredSections,
    mismatchedCountSections,
    sectionResults,
  };
}
