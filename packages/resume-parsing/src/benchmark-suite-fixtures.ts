import type {
  ResumeBenchmarkGroundTruth,
  ResumeBenchmarkObservation,
} from '@talent-network/contracts';

import { COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH } from './benchmark-fixtures.js';
import type { ResumeBenchmarkSuiteCase } from './benchmark-regression.js';

const SIMPLE_ONE_PAGE_PDF: ResumeBenchmarkGroundTruth = {
  schemaVersion: 'resume-intelligence-benchmark-v1',
  fixtureId: 'simple-one-page-pdf-v1',
  title: 'Simple one-page software engineer PDF',
  description: 'Seed contract for a conventional single-column resume with core sections only.',
  sourceFormat: 'PDF',
  pageCount: 1,
  sections: [
    requiredSection('CONTACT_INFORMATION', 'Contact Information'),
    requiredRecords('PROFESSIONAL_SUMMARY', 'Professional Summary', 1),
    requiredRecords('WORK_EXPERIENCE', 'Work Experience', 2),
    requiredRecords('EDUCATION', 'Education', 1),
    requiredRecords('SKILLS', 'Skills', 8),
  ],
};

const DOCX_TABLE_RESUME: ResumeBenchmarkGroundTruth = {
  schemaVersion: 'resume-intelligence-benchmark-v1',
  fixtureId: 'docx-table-layout-v1',
  title: 'DOCX resume with table-backed records',
  description:
    'Seed contract for page-less DOCX structure containing table-backed experience and certifications.',
  sourceFormat: 'DOCX',
  pageCount: null,
  sections: [
    requiredSection('CONTACT_INFORMATION', 'Contact Information'),
    requiredRecords('WORK_EXPERIENCE', 'Work Experience', 3),
    requiredRecords('CERTIFICATIONS', 'Certifications', 4),
    requiredRecords('EDUCATION', 'Education', 1),
  ],
};

const SCANNED_OCR_RESUME: ResumeBenchmarkGroundTruth = {
  schemaVersion: 'resume-intelligence-benchmark-v1',
  fixtureId: 'scanned-ocr-two-page-v1',
  title: 'Scanned two-page OCR resume',
  description:
    'Seed contract for image/OCR recovery with core sections and explicit source accounting.',
  sourceFormat: 'IMAGE',
  pageCount: 2,
  sections: [
    requiredSection('CONTACT_INFORMATION', 'Contact Information'),
    requiredRecords('WORK_EXPERIENCE', 'Work Experience', 2),
    requiredRecords('EDUCATION', 'Education', 1),
    requiredRecords('SKILLS', 'Skills', 6),
  ],
};

const TWO_COLUMN_PDF_RESUME: ResumeBenchmarkGroundTruth = {
  schemaVersion: 'resume-intelligence-benchmark-v1',
  fixtureId: 'two-column-pdf-v1',
  title: 'Two-column PDF resume',
  description:
    'Seed contract for reading-order and section-boundary regressions in a multi-column layout.',
  sourceFormat: 'PDF',
  pageCount: 2,
  sections: [
    requiredSection('CONTACT_INFORMATION', 'Contact Information'),
    requiredRecords('WORK_EXPERIENCE', 'Work Experience', 3),
    requiredRecords('PROJECTS', 'Projects', 2),
    requiredRecords('SKILLS', 'Skills', 10),
    requiredRecords('EDUCATION', 'Education', 1),
  ],
};

const OPEN_WORLD_RESUME: ResumeBenchmarkGroundTruth = {
  schemaVersion: 'resume-intelligence-benchmark-v1',
  fixtureId: 'open-world-custom-sections-v1',
  title: 'Open-world extension resume',
  description: 'Seed contract for recognized extensions plus unknown/custom section preservation.',
  sourceFormat: 'PDF',
  pageCount: 3,
  sections: [
    requiredRecords('WORK_EXPERIENCE', 'Work Experience', 2),
    requiredRecords('PUBLICATIONS', 'Publications', 2),
    requiredRecords('VOLUNTEERING', 'Volunteering', 1),
    requiredRecords('CUSTOM', 'Community Labs', 2),
  ],
};

const PRIVATE_REFERENCES_RESUME: ResumeBenchmarkGroundTruth = {
  schemaVersion: 'resume-intelligence-benchmark-v1',
  fixtureId: 'private-references-v1',
  title: 'Resume containing third-party references',
  description:
    'Seed contract proving third-party reference records remain accounted for but private-only.',
  sourceFormat: 'DOCX',
  pageCount: null,
  sections: [
    requiredRecords('WORK_EXPERIENCE', 'Work Experience', 2),
    {
      ...requiredRecords('REFERENCES', 'References', 3),
      privateOnly: true,
    },
  ],
};

export const PHASE_3G_SEED_BENCHMARK_CASES: readonly ResumeBenchmarkSuiteCase[] = [
  suiteCase(COMPLEX_FIVE_PAGE_RESUME_GROUND_TRUTH, 'AVAILABLE'),
  suiteCase(SIMPLE_ONE_PAGE_PDF, 'SPECIFIED'),
  suiteCase(DOCX_TABLE_RESUME, 'SPECIFIED'),
  suiteCase(SCANNED_OCR_RESUME, 'SPECIFIED'),
  suiteCase(TWO_COLUMN_PDF_RESUME, 'SPECIFIED'),
  suiteCase(OPEN_WORLD_RESUME, 'SPECIFIED'),
  suiteCase(PRIVATE_REFERENCES_RESUME, 'SPECIFIED'),
];

function suiteCase(
  truth: ResumeBenchmarkGroundTruth,
  artifactStatus: ResumeBenchmarkSuiteCase['artifactStatus'],
): ResumeBenchmarkSuiteCase {
  return {
    truth,
    observation: perfectObservation(truth),
    artifactStatus,
    tags: [truth.sourceFormat.toLowerCase(), artifactStatus.toLowerCase()],
  };
}

function perfectObservation(truth: ResumeBenchmarkGroundTruth): ResumeBenchmarkObservation {
  const sections = truth.sections.map((section) => {
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
  return {
    fixtureId: truth.fixtureId,
    sections,
    meaningfulSourceCount,
    accountedSourceCount: meaningfulSourceCount,
    unprocessedSourceCount: 0,
  };
}

function requiredSection(
  typeKey: ResumeBenchmarkGroundTruth['sections'][number]['typeKey'],
  label: string,
): ResumeBenchmarkGroundTruth['sections'][number] {
  return {
    typeKey,
    label,
    expectationKind: 'SECTION',
    required: true,
  };
}

function requiredRecords(
  typeKey: ResumeBenchmarkGroundTruth['sections'][number]['typeKey'],
  label: string,
  expectedCount: number,
): ResumeBenchmarkGroundTruth['sections'][number] {
  return {
    typeKey,
    label,
    expectationKind: 'RECORDS',
    expectedCount,
    required: true,
  };
}
