import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalDeterministicResumeParser } from './local-parser.js';
import { preprocessResumeDocument } from './preprocessing.js';
import { validateResumeProposal } from './proposal-validation.js';

void test('runtime parser emits only source-grounded deterministic contact claims', async () => {
  const preprocessedDocument = preprocessResumeDocument({
    schemaVersion: 'resume-document-v1',
    resumeVersionId: 'resume-version-1',
    text: 'CONTACT\nprivate@example.com\n+92 300 1234567\nhttps://example.com/me',
    pages: [
      {
        pageNumber: 1,
        text: 'CONTACT\nprivate@example.com\n+92 300 1234567\nhttps://example.com/me',
        blocks: [
          { text: 'CONTACT', sourceRange: { startOffset: 0, endOffset: 7 } },
          {
            text: 'private@example.com',
            sourceRange: { startOffset: 8, endOffset: 27 },
          },
          { text: '+92 300 1234567', sourceRange: { startOffset: 28, endOffset: 43 } },
          {
            text: 'https://example.com/me',
            sourceRange: { startOffset: 44, endOffset: 66 },
          },
        ],
      },
    ],
  });
  const parser = new LocalDeterministicResumeParser();

  const result = await parser.parse({
    resumeVersionId: 'resume-version-1',
    sourceExtractionId: 'extraction-1',
    processingPipelineVersion: 'resume-v1',
    sourceDocumentSchemaVersion: 'resume-document-v1',
    preprocessedDocument,
  });

  assert.equal(result.parsedResume.identityCandidate?.email?.value, 'private@example.com');
  assert.equal(result.parsedResume.identityCandidate?.phone?.value, '+92 300 1234567');
  assert.equal(result.parsedResume.links[0]?.url.value, 'https://example.com/me');
  assert.deepEqual(result.parsedResume.experiences, []);
  assert.deepEqual(result.parsedResume.education, []);

  const validation = validateResumeProposal(
    result.parsedResume,
    preprocessedDocument,
    'extraction-1',
  );
  assert.equal(validation.claimCount, 3);
  assert.equal(validation.evidenceCount, 3);
});

void test('runtime parser returns a valid empty proposal when no deterministic claim is provable', async () => {
  const preprocessedDocument = preprocessResumeDocument({
    schemaVersion: 'resume-document-v1',
    resumeVersionId: 'resume-version-empty',
    text: 'EXPERIENCE\nBuilt internal systems',
    pages: [
      {
        pageNumber: 1,
        text: 'EXPERIENCE\nBuilt internal systems',
        blocks: [
          { text: 'EXPERIENCE', sourceRange: { startOffset: 0, endOffset: 10 } },
          {
            text: 'Built internal systems',
            sourceRange: { startOffset: 11, endOffset: 33 },
          },
        ],
      },
    ],
  });
  const result = await new LocalDeterministicResumeParser().parse({
    resumeVersionId: 'resume-version-empty',
    sourceExtractionId: 'extraction-empty',
    processingPipelineVersion: 'resume-v1',
    sourceDocumentSchemaVersion: 'resume-document-v1',
    preprocessedDocument,
  });

  assert.equal(result.parsedResume.confidenceSummary.totalClaimCount, 0);
  assert.equal(result.parsedResume.confidenceSummary.overall, 0);
  assert.equal(result.parsedResume.warnings.length, 1);
  assert.doesNotThrow(() =>
    validateResumeProposal(result.parsedResume, preprocessedDocument, 'extraction-empty'),
  );
});

void test('runtime parser derives grounded name headline summary and skills without inventing unsupported records', async () => {
  const blocks = [
    'ALEX MORGAN',
    'Senior Full Stack Engineer',
    'alex@example.com',
    'PROFESSIONAL SUMMARY',
    'Full-stack engineer building secure multi-tenant SaaS platforms.',
    'TECHNICAL SKILLS',
    'Frontend: React, Next.js, TypeScript',
    'Backend: Node.js, NestJS, PostgreSQL',
    'EXPERIENCE',
    'Acme Systems',
    'Senior Engineer 2024 - 2026',
  ];

  const preprocessedDocument = preprocessFixture(blocks, 1, 'resume-version-semantics');
  const result = await parseFixture(
    preprocessedDocument,
    'resume-version-semantics',
    'extraction-semantics',
  );

  assert.equal(result.identityCandidate?.fullName?.value, 'ALEX MORGAN');
  assert.equal(result.headline?.value, 'Senior Full Stack Engineer');
  assert.equal(
    result.summary?.value,
    'Full-stack engineer building secure multi-tenant SaaS platforms.',
  );
  assert.deepEqual(
    result.skills.map((skill) => skill.name.value),
    ['React', 'Next.js', 'TypeScript', 'Node.js', 'NestJS', 'PostgreSQL'],
  );
  assert.deepEqual(result.experiences, []);
  assert.deepEqual(result.education, []);

  const validation = validateResumeProposal(
    result,
    preprocessedDocument,
    'extraction-semantics',
  );
  assert.equal(validation.claimCount, 16);
  assert.equal(validation.confidenceSummary.lowConfidenceClaimCount, 0);
});

void test('parser v3 handles PDF-style role/date plus company/location rows and no-colon skill categories', async () => {
  const blocks = [
    'ALEX MORGAN',
    'Full-Stack Developer | React | Next.js | Node.js | NestJS | TypeScript | AI/RAG',
    'alex@example.com',
    'PROFESSIONAL SUMMARY',
    'Full-stack developer building production web applications and scalable APIs.',
    'TECHNICAL SKILLS',
    'Frontend React.js, Next.js, TypeScript, JavaScript',
    'Backend Node.js, NestJS, Express.js, REST APIs',
    'Databases PostgreSQL, MongoDB, Redis',
    'PROFESSIONAL EXPERIENCE',
    'Associate Full-Stack Developer Jun 2025 - May 2026',
    'Acme Systems | Lahore, Pakistan',
    '• Built production APIs and frontend workflows.',
    'Full-Stack Developer Mar 2023 - Apr 2025',
    'Example Studio | Lahore, Pakistan',
    '• Delivered full-stack applications.',
    'Independent Full-Stack Developer',
    'Freelance / Project-Based',
    '• Delivered an independent product.',
    'EDUCATION',
    'Bachelor of Science in Software Engineering 2026',
    'Example University Lahore',
  ];

  const preprocessedDocument = preprocessFixture(blocks, 1, 'resume-version-pdf-shape');
  const result = await parseFixture(
    preprocessedDocument,
    'resume-version-pdf-shape',
    'extraction-pdf-shape',
  );

  assert.equal(
    result.headline?.value,
    'Full-Stack Developer | React | Next.js | Node.js | NestJS | TypeScript | AI/RAG',
  );
  assert.deepEqual(
    result.skills.map((skill) => [skill.category?.value, skill.name.value]),
    [
      ['Frontend', 'React.js'],
      ['Frontend', 'Next.js'],
      ['Frontend', 'TypeScript'],
      ['Frontend', 'JavaScript'],
      ['Backend', 'Node.js'],
      ['Backend', 'NestJS'],
      ['Backend', 'Express.js'],
      ['Backend', 'REST APIs'],
      ['Databases', 'PostgreSQL'],
      ['Databases', 'MongoDB'],
      ['Databases', 'Redis'],
    ],
  );
  assert.equal(result.experiences.length, 3);
  assert.deepEqual(
    result.experiences.map((experience) => ({
      role: experience.role?.value,
      company: experience.company?.value,
      location: experience.location?.value,
      dates: experience.dates?.value,
      highlights: experience.highlights.map((highlight) => highlight.value),
    })),
    [
      {
        role: 'Associate Full-Stack Developer',
        company: 'Acme Systems',
        location: 'Lahore, Pakistan',
        dates: { start: '2025-06', end: '2026-05' },
        highlights: ['Built production APIs and frontend workflows.'],
      },
      {
        role: 'Full-Stack Developer',
        company: 'Example Studio',
        location: 'Lahore, Pakistan',
        dates: { start: '2023-03', end: '2025-04' },
        highlights: ['Delivered full-stack applications.'],
      },
      {
        role: 'Independent Full-Stack Developer',
        company: 'Freelance / Project-Based',
        location: undefined,
        dates: undefined,
        highlights: ['Delivered an independent product.'],
      },
    ],
  );
  assert.equal(result.education.length, 1);
  assert.equal(result.education[0]?.qualification?.value, 'Bachelor of Science in Software Engineering');
  assert.equal(result.education[0]?.institution?.value, 'Example University Lahore');
  assert.deepEqual(result.education[0]?.dates?.value, { end: '2026' });

  assert.doesNotThrow(() =>
    validateResumeProposal(result, preprocessedDocument, 'extraction-pdf-shape'),
  );
});

void test('parser v3 handles DOCX pipe-delimited experience education and bare links', async () => {
  const blocks = [
    'ALEX MORGAN',
    'FULL-STACK DEVELOPER | REACT, NEXT.JS, NODE.JS, TYPESCRIPT',
    'Pakistan | alex@example.com | linkedin.com/in/alex-morgan | github.com/alex-morgan | alex-morgan.me',
    'PROFESSIONAL SUMMARY',
    'Full-stack developer with hands-on experience building and deploying web products.',
    'TECHNICAL SKILLS',
    'Frontend: React, Next.js, TypeScript',
    'Backend & APIs: Node.js, NestJS, REST APIs',
    'PROFESSIONAL EXPERIENCE',
    'Associate Full-Stack Developer | Acme Systems | Lahore, Pakistan 2025 - 2026',
    '• Built and maintained responsive web applications.',
    'Flutter Android Developer & Freelance Full-Stack Developer | Self-Employed 2023 - 2024',
    '• Delivered client web projects.',
    'EDUCATION',
    'Bachelor of Science in Software Engineering | Example University Lahore | Graduated 2026',
    'Relevant Focus: software engineering, web development, databases and APIs.',
  ];

  const preprocessedDocument = preprocessFixture(blocks, null, 'resume-version-docx-shape');
  const result = await parseFixture(
    preprocessedDocument,
    'resume-version-docx-shape',
    'extraction-docx-shape',
  );

  assert.equal(result.experiences.length, 2);
  assert.equal(result.experiences[0]?.role?.value, 'Associate Full-Stack Developer');
  assert.equal(result.experiences[0]?.company?.value, 'Acme Systems');
  assert.equal(result.experiences[0]?.location?.value, 'Lahore, Pakistan');
  assert.deepEqual(result.experiences[0]?.dates?.value, { start: '2025', end: '2026' });
  assert.equal(
    result.experiences[1]?.role?.value,
    'Flutter Android Developer & Freelance Full-Stack Developer',
  );
  assert.equal(result.experiences[1]?.company?.value, 'Self-Employed');
  assert.equal(result.education[0]?.institution?.value, 'Example University Lahore');
  assert.deepEqual(result.education[0]?.dates?.value, { end: '2026' });
  assert.deepEqual(
    result.links.map((link) => link.url.normalizedValue),
    [
      'https://linkedin.com/in/alex-morgan',
      'https://github.com/alex-morgan',
      'https://alex-morgan.me',
    ],
  );

  assert.doesNotThrow(() =>
    validateResumeProposal(result, preprocessedDocument, 'extraction-docx-shape'),
  );
});

async function parseFixture(
  preprocessedDocument: ReturnType<typeof preprocessResumeDocument>,
  resumeVersionId: string,
  sourceExtractionId: string,
) {
  const parsed = await new LocalDeterministicResumeParser().parse({
    resumeVersionId,
    sourceExtractionId,
    processingPipelineVersion: 'resume-v3',
    sourceDocumentSchemaVersion: preprocessedDocument.sourceDocumentSchemaVersion,
    preprocessedDocument,
  });
  return parsed.parsedResume;
}

function preprocessFixture(
  blocks: string[],
  pageNumber: number | null,
  resumeVersionId: string,
): ReturnType<typeof preprocessResumeDocument> {
  let offset = 0;
  const sourceBlocks = blocks.map((text) => {
    const startOffset = offset;
    const endOffset = startOffset + text.length;
    offset = endOffset + 1;
    return { text, sourceRange: { startOffset, endOffset } };
  });

  return preprocessResumeDocument({
    schemaVersion: 'resume-document-v2',
    resumeVersionId,
    text: blocks.join('\n'),
    pages: [
      {
        pageNumber,
        text: blocks.join('\n'),
        blocks: sourceBlocks,
      },
    ],
  });
}
