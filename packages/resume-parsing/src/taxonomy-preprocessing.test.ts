import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyResumeSectionHeading, preprocessResumeDocument } from './preprocessing.js';

void test('shared taxonomy recognizes title-case extension headings without forcing their storage shape', () => {
  assert.equal(classifyResumeSectionHeading('Publications'), 'OTHER');
  assert.equal(classifyResumeSectionHeading('Professional Memberships'), 'OTHER');
  assert.equal(classifyResumeSectionHeading('Awards & Honors'), 'OTHER');
  assert.equal(classifyResumeSectionHeading('Work Experience'), 'EXPERIENCE');
});

void test('real-world combined headings route into their typed Career Passport sections', () => {
  assert.equal(classifyResumeSectionHeading('CORE COMPETENCIES'), 'SKILLS');
  assert.equal(classifyResumeSectionHeading('CERTIFICATIONS & LICENSES'), 'CERTIFICATIONS');
  assert.equal(classifyResumeSectionHeading('SELECTED PROJECTS & RESEARCH'), 'PROJECTS');
});

void test('title-case known extensions remain explicit headed sections for parser v5 preservation', () => {
  const blocks = [
    { text: 'Alex Morgan', sourceRange: { startOffset: 0, endOffset: 11 } },
    { text: 'Publications', sourceRange: { startOffset: 12, endOffset: 24 } },
    {
      text: 'Reliable Multi-Tenant Systems, 2026',
      sourceRange: { startOffset: 25, endOffset: 60 },
    },
  ];

  const result = preprocessResumeDocument({
    schemaVersion: 'resume-document-v2',
    resumeVersionId: 'resume-taxonomy-title-case',
    text: blocks.map((block) => block.text).join('\n'),
    pages: [{ pageNumber: 1, text: blocks.map((block) => block.text).join('\n'), blocks }],
  });

  assert.equal(result.preprocessingPolicyVersion, 'resume-preprocess-v3');
  assert.deepEqual(
    result.sections.map((section) => [section.kind, section.heading]),
    [
      ['OTHER', null],
      ['OTHER', 'Publications'],
    ],
  );
  assert.equal(result.sections[1]?.fragments[1]?.text, 'Reliable Multi-Tenant Systems, 2026');
});
