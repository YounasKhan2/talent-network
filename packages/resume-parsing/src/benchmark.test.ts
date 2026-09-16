import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResumeBenchmarkObservation } from '@talent-network/contracts';
import { evaluateResumeBenchmark } from './benchmark.js';
import { COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH } from './benchmark-fixtures.js';

void test('golden complex fixture encodes the expected independent source truth', () => {
  const counts = new Map(
    COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH.sections.map((section) => [
      section.typeKey,
      section.expectedCount ?? null,
    ]),
  );

  assert.equal(counts.get('WORK_EXPERIENCE'), 4);
  assert.equal(counts.get('EDUCATION'), 2);
  assert.equal(counts.get('PROJECTS'), 3);
  assert.equal(counts.get('CERTIFICATIONS'), 5);
  assert.equal(counts.get('LANGUAGES'), 4);
  assert.equal(counts.get('PROFESSIONAL_LINKS'), 3);
  assert.equal(counts.get('PUBLICATIONS'), 3);
  assert.equal(counts.get('PATENTS'), 2);
  assert.equal(counts.get('AWARDS'), 4);
  assert.equal(counts.get('VOLUNTEERING'), 1);
  assert.equal(counts.get('PROFESSIONAL_MEMBERSHIPS'), 3);
  assert.equal(counts.get('REFERENCES'), 3);

  const references = COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH.sections.find(
    (section) => section.typeKey === 'REFERENCES',
  );
  assert.equal(references?.privateOnly, true);
});

void test('benchmark fails when a parser silently misses complex source records', () => {
  const observation: ResumeBenchmarkObservation = {
    fixtureId: COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH.fixtureId,
    meaningfulSourceCount: 16,
    accountedSourceCount: 9,
    unprocessedSourceCount: 7,
    sections: [
      observationSection('CONTACT_INFORMATION', 1, 1),
      observationSection('PROFESSIONAL_SUMMARY', 1, 1),
      observationSection('SKILLS', 1, 1),
      observationSection('WORK_EXPERIENCE', 3, 3),
      observationSection('PROFESSIONAL_LINKS', 3, 3),
    ],
  };

  const result = evaluateResumeBenchmark(COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH, observation);

  assert.equal(result.passed, false);
  assert.equal(result.sourceAccountingComplete, false);
  assert.ok(result.mismatchedCountSections.includes('WORK_EXPERIENCE'));
  assert.ok(result.missingRequiredSections.includes('EDUCATION'));
  assert.ok(result.missingRequiredSections.includes('CERTIFICATIONS'));
});

void test('benchmark passes only when expected counts and source accounting are complete', () => {
  const sections = COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH.sections.map((section) => {
    const count = section.expectedCount ?? 1;
    return {
      typeKey: section.typeKey,
      observedSourceCount: count,
      mappedCount: section.privateOnly ? 0 : count,
      partiallyMappedCount: 0,
      unmappedCount: 0,
      privateOnlyCount: section.privateOnly ? count : 0,
    };
  });
  const meaningfulSourceCount = sections.reduce(
    (total, section) => total + section.observedSourceCount,
    0,
  );
  const observation: ResumeBenchmarkObservation = {
    fixtureId: COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH.fixtureId,
    meaningfulSourceCount,
    accountedSourceCount: meaningfulSourceCount,
    unprocessedSourceCount: 0,
    sections,
  };

  const result = evaluateResumeBenchmark(COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH, observation);

  assert.equal(result.passed, true);
  assert.equal(result.sourceAccountingComplete, true);
  assert.equal(result.sourceCoverageRatio, 1);
  assert.deepEqual(result.missingRequiredSections, []);
  assert.deepEqual(result.mismatchedCountSections, []);
});

function observationSection(
  typeKey: ResumeBenchmarkObservation['sections'][number]['typeKey'],
  observedSourceCount: number,
  mappedCount: number,
): ResumeBenchmarkObservation['sections'][number] {
  return {
    typeKey,
    observedSourceCount,
    mappedCount,
    partiallyMappedCount: 0,
    unmappedCount: 0,
    privateOnlyCount: 0,
  };
}
