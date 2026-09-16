import { classifyCareerSectionHeading } from '@talent-network/contracts';

export const RESUME_PREPROCESSING_POLICY_VERSION = 'resume-preprocess-v3' as const;

export const RESUME_PREPROCESSING_LIMITS = {
  maximumChunkCharacters: 12_000,
} as const;

export type ResumeSectionKind =
  | 'SUMMARY'
  | 'EXPERIENCE'
  | 'EDUCATION'
  | 'SKILLS'
  | 'PROJECTS'
  | 'CERTIFICATIONS'
  | 'LANGUAGES'
  | 'LINKS'
  | 'OTHER';

export interface ResumePreprocessingSourceRange {
  start: number;
  end: number;
}

export interface ResumePreprocessingBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResumePreprocessingBlockInput {
  text: string;
  sourceRange: {
    startOffset: number;
    endOffset: number;
  };
  boundingBox?: ResumePreprocessingBoundingBox | null;
}

export interface ResumePreprocessingPageInput {
  pageNumber: number | null;
  text: string;
  blocks: ResumePreprocessingBlockInput[];
  nativePdf?: {
    annotations?: unknown[];
  };
}

export interface ResumePreprocessingDocumentInput {
  schemaVersion: string;
  resumeVersionId: string;
  text: string;
  pages: ResumePreprocessingPageInput[];
}

export interface ResumeSourceFragment {
  pageNumber: number | null;
  blockIndex: number;
  segmentIndex: number;
  text: string;
  sourceRange: ResumePreprocessingSourceRange;
  boundingBox?: ResumePreprocessingBoundingBox | null;
}

export interface ResumePreprocessedSection {
  kind: ResumeSectionKind;
  heading: string | null;
  headingFragment: ResumeSourceFragment | null;
  fragments: ResumeSourceFragment[];
}

export interface ResumePreprocessedChunk {
  index: number;
  text: string;
  characterCount: number;
  fragments: ResumeSourceFragment[];
}

export type ResumeCandidateDetectionKind = 'EMAIL' | 'PHONE' | 'URL';
export type ResumeCandidateEvidenceKind = 'DIRECT_TEXT' | 'DERIVED_LINK';

export interface ResumeCandidateDetection {
  kind: ResumeCandidateDetectionKind;
  value: string;
  pageNumber: number | null;
  blockIndex: number;
  sourceRange: ResumePreprocessingSourceRange;
  evidenceKind: ResumeCandidateEvidenceKind;
}

export interface PreprocessedResumeDocument {
  preprocessingPolicyVersion: typeof RESUME_PREPROCESSING_POLICY_VERSION;
  sourceDocumentSchemaVersion: string;
  resumeVersionId: string;
  sections: ResumePreprocessedSection[];
  chunks: ResumePreprocessedChunk[];
  candidates: ResumeCandidateDetection[];
}

const SECTION_ALIASES: ReadonlyArray<readonly [ResumeSectionKind, readonly string[]]> = [
  ['SUMMARY', ['summary', 'profile', 'professional summary', 'professional profile', 'about me']],
  [
    'EXPERIENCE',
    [
      'experience',
      'work experience',
      'professional experience',
      'employment',
      'employment history',
      'work history',
    ],
  ],
  ['EDUCATION', ['education', 'academic background', 'academic history', 'qualifications']],
  ['SKILLS', ['skills', 'technical skills', 'core skills', 'competencies', 'technologies']],
  ['PROJECTS', ['projects', 'selected projects', 'personal projects']],
  [
    'CERTIFICATIONS',
    ['certifications', 'certificates', 'licenses & certifications', 'licenses and certifications'],
  ],
  ['LANGUAGES', ['languages', 'language']],
  ['LINKS', ['links', 'profiles', 'online profiles']],
];

const YEAR_RANGE_PATTERN = /^(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}$/;
const BARE_URL_PATTERN =
  /(?:www\.)?(?:linkedin\.com\/[A-Za-z0-9_./-]+|github\.com\/[A-Za-z0-9_.-]+|[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|org|net|io|me|dev|app|ai|co|pk)(?:\/[A-Za-z0-9_./?=&%#~-]*)?)/gi;

export function preprocessResumeDocument(
  document: ResumePreprocessingDocumentInput,
  options: { maximumChunkCharacters?: number } = {},
): PreprocessedResumeDocument {
  const maximumChunkCharacters =
    options.maximumChunkCharacters ?? RESUME_PREPROCESSING_LIMITS.maximumChunkCharacters;

  if (!Number.isInteger(maximumChunkCharacters) || maximumChunkCharacters <= 0) {
    throw new Error('maximumChunkCharacters must be a positive integer.');
  }

  const fragments = flattenSourceFragments(document);

  return {
    preprocessingPolicyVersion: RESUME_PREPROCESSING_POLICY_VERSION,
    sourceDocumentSchemaVersion: document.schemaVersion,
    resumeVersionId: document.resumeVersionId,
    sections: detectSections(fragments),
    chunks: buildBoundedChunks(fragments, maximumChunkCharacters),
    candidates: detectDeterministicCandidates(fragments, document.pages),
  };
}

export function classifyResumeSectionHeading(value: string): ResumeSectionKind | null {
  const normalized = normalizeHeading(value);
  if (!normalized) return null;

  for (const [kind, aliases] of SECTION_ALIASES) {
    if (aliases.includes(normalized)) return kind;
  }

  const taxonomy = classifyCareerSectionHeading(value);
  if (taxonomy.typeKey !== 'CUSTOM') return resumeKindForCareerSection(taxonomy.typeKey);

  return looksLikeUnknownSectionHeading(value) ? 'OTHER' : null;
}

function resumeKindForCareerSection(typeKey: string): ResumeSectionKind {
  switch (typeKey) {
    case 'PROFESSIONAL_SUMMARY':
      return 'SUMMARY';
    case 'WORK_EXPERIENCE':
      return 'EXPERIENCE';
    case 'EDUCATION':
      return 'EDUCATION';
    case 'SKILLS':
      return 'SKILLS';
    case 'PROJECTS':
      return 'PROJECTS';
    case 'CERTIFICATIONS':
      return 'CERTIFICATIONS';
    case 'LANGUAGES':
      return 'LANGUAGES';
    case 'PROFESSIONAL_LINKS':
      return 'LINKS';
    default:
      return 'OTHER';
  }
}

export function detectSections(fragments: ResumeSourceFragment[]): ResumePreprocessedSection[] {
  const sections: ResumePreprocessedSection[] = [];
  let current = createSection('OTHER', null, null);

  const flush = (): void => {
    if (current.fragments.length === 0) return;
    sections.push(current);
  };

  for (const fragment of fragments) {
    const headingKind = classifyResumeSectionHeading(fragment.text);
    if (headingKind) {
      flush();
      current = createSection(headingKind, fragment.text.trim(), fragment);
      current.fragments.push(fragment);
      continue;
    }

    current.fragments.push(fragment);
  }

  flush();
  return sections;
}

export function buildBoundedChunks(
  fragments: ResumeSourceFragment[],
  maximumChunkCharacters: number = RESUME_PREPROCESSING_LIMITS.maximumChunkCharacters,
): ResumePreprocessedChunk[] {
  if (!Number.isInteger(maximumChunkCharacters) || maximumChunkCharacters <= 0) {
    throw new Error('maximumChunkCharacters must be a positive integer.');
  }

  const chunks: ResumePreprocessedChunk[] = [];
  let current: ResumeSourceFragment[] = [];
  let currentLength = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    const text = current.map((fragment) => fragment.text).join('\n\n');
    chunks.push({
      index: chunks.length,
      text,
      characterCount: text.length,
      fragments: current,
    });
    current = [];
    currentLength = 0;
  };

  for (const fragment of fragments) {
    const boundedFragments = splitFragment(fragment, maximumChunkCharacters);

    for (const boundedFragment of boundedFragments) {
      const separatorLength = current.length === 0 ? 0 : 2;
      const projectedLength = currentLength + separatorLength + boundedFragment.text.length;

      if (current.length > 0 && projectedLength > maximumChunkCharacters) flush();

      current.push(boundedFragment);
      currentLength += (current.length === 1 ? 0 : 2) + boundedFragment.text.length;
    }
  }

  flush();
  return chunks;
}

export function detectDeterministicCandidates(
  fragments: ResumeSourceFragment[],
  pages: ResumePreprocessingPageInput[] = [],
): ResumeCandidateDetection[] {
  const detections: ResumeCandidateDetection[] = [];

  for (const fragment of fragments) {
    collectMatches(fragment, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'EMAIL', detections);
    collectMatches(fragment, /https?:\/\/[^\s)\]}>]+/gi, 'URL', detections);
    collectBareUrlMatches(fragment, detections);
    collectPhoneMatches(fragment, detections);
  }

  collectPdfAnnotationLinks(pages, detections);
  return deduplicateDetections(detections);
}

function flattenSourceFragments(
  document: ResumePreprocessingDocumentInput,
): ResumeSourceFragment[] {
  const fragments: ResumeSourceFragment[] = [];

  for (const page of document.pages) {
    page.blocks.forEach((block, blockIndex) => {
      if (!block.text) return;
      assertSourceRange(block);
      fragments.push({
        pageNumber: page.pageNumber,
        blockIndex,
        segmentIndex: 0,
        text: block.text,
        sourceRange: {
          start: block.sourceRange.startOffset,
          end: block.sourceRange.endOffset,
        },
        ...(block.boundingBox === undefined ? {} : { boundingBox: block.boundingBox }),
      });
    });
  }

  return fragments;
}

function splitFragment(
  fragment: ResumeSourceFragment,
  maximumChunkCharacters: number,
): ResumeSourceFragment[] {
  if (fragment.text.length <= maximumChunkCharacters) return [fragment];

  const sourceLength = fragment.sourceRange.end - fragment.sourceRange.start;
  if (sourceLength !== fragment.text.length) {
    throw new Error(
      'Cannot split a source fragment whose source range does not map 1:1 to its text.',
    );
  }

  const result: ResumeSourceFragment[] = [];
  let cursor = 0;
  let segmentIndex = 0;

  while (cursor < fragment.text.length) {
    const text = fragment.text.slice(cursor, cursor + maximumChunkCharacters);
    const start = fragment.sourceRange.start + cursor;
    result.push({
      ...fragment,
      segmentIndex,
      text,
      sourceRange: { start, end: start + text.length },
    });
    cursor += text.length;
    segmentIndex += 1;
  }

  return result;
}

function collectMatches(
  fragment: ResumeSourceFragment,
  pattern: RegExp,
  kind: Exclude<ResumeCandidateDetectionKind, 'PHONE'>,
  output: ResumeCandidateDetection[],
): void {
  for (const match of fragment.text.matchAll(pattern)) {
    const index = match.index;
    if (index === undefined || !match[0]) continue;
    output.push({
      kind,
      value: match[0],
      pageNumber: fragment.pageNumber,
      blockIndex: fragment.blockIndex,
      sourceRange: {
        start: fragment.sourceRange.start + index,
        end: fragment.sourceRange.start + index + match[0].length,
      },
      evidenceKind: 'DIRECT_TEXT',
    });
  }
}

function collectBareUrlMatches(
  fragment: ResumeSourceFragment,
  output: ResumeCandidateDetection[],
): void {
  for (const match of fragment.text.matchAll(BARE_URL_PATTERN)) {
    const index = match.index;
    if (index === undefined || !match[0]) continue;

    const prefix = fragment.text.slice(Math.max(0, index - 8), index);
    if (/https?:\/\/$/i.test(prefix)) continue;
    if (index > 0 && fragment.text[index - 1] === '@') continue;

    output.push({
      kind: 'URL',
      value: match[0],
      pageNumber: fragment.pageNumber,
      blockIndex: fragment.blockIndex,
      sourceRange: {
        start: fragment.sourceRange.start + index,
        end: fragment.sourceRange.start + index + match[0].length,
      },
      evidenceKind: 'DIRECT_TEXT',
    });
  }
}

function collectPdfAnnotationLinks(
  pages: ResumePreprocessingPageInput[],
  output: ResumeCandidateDetection[],
): void {
  for (const page of pages) {
    if (page.pageNumber === null || !Array.isArray(page.nativePdf?.annotations)) continue;

    for (const annotation of page.nativePdf.annotations) {
      const data = asRecord(annotation);
      const url = safeHttpUrl(data?.url);
      const rect = annotationRect(data?.rect);
      if (!url || !rect) continue;

      const match = bestOverlappingBlock(page.blocks, rect);
      if (!match) continue;

      output.push({
        kind: 'URL',
        value: url,
        pageNumber: page.pageNumber,
        blockIndex: match.index,
        sourceRange: {
          start: match.block.sourceRange.startOffset,
          end: match.block.sourceRange.endOffset,
        },
        evidenceKind: 'DERIVED_LINK',
      });
    }
  }
}

function bestOverlappingBlock(
  blocks: ResumePreprocessingBlockInput[],
  annotation: ResumePreprocessingBoundingBox,
): { index: number; block: ResumePreprocessingBlockInput } | null {
  let bestIndex = -1;
  let bestOverlap = 0;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block?.boundingBox) continue;
    const overlap = intersectionArea(block.boundingBox, annotation);
    if (overlap <= bestOverlap) continue;
    bestIndex = index;
    bestOverlap = overlap;
  }

  const block = bestIndex >= 0 ? blocks[bestIndex] : undefined;
  return block ? { index: bestIndex, block } : null;
}

function annotationRect(value: unknown): ResumePreprocessingBoundingBox | null {
  const coordinates = asUnknownArray(value);
  if (!coordinates || coordinates.length < 4) return null;

  const x1 = coordinates[0];
  const y1 = coordinates[1];
  const x2 = coordinates[2];
  const y2 = coordinates[3];
  if (!isFiniteNumber(x1) || !isFiniteNumber(y1) || !isFiniteNumber(x2) || !isFiniteNumber(y2)) {
    return null;
  }

  const left = Math.min(x1, x2);
  const bottom = Math.min(y1, y2);
  return {
    x: left,
    y: bottom,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function intersectionArea(
  left: ResumePreprocessingBoundingBox,
  right: ResumePreprocessingBoundingBox,
): number {
  const xOverlap = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return xOverlap * yOverlap;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function collectPhoneMatches(
  fragment: ResumeSourceFragment,
  output: ResumeCandidateDetection[],
): void {
  const pattern = /(?:\+?\d[\d .()-]{6,}\d)/g;

  for (const match of fragment.text.matchAll(pattern)) {
    const index = match.index;
    if (index === undefined || !match[0]) continue;
    const value = match[0].trim();
    if (YEAR_RANGE_PATTERN.test(value)) continue;

    const digitCount = value.replace(/\D/g, '').length;
    if (digitCount < 7 || digitCount > 15) continue;

    if (digitCount < 9 && !value.startsWith('+')) continue;

    output.push({
      kind: 'PHONE',
      value,
      pageNumber: fragment.pageNumber,
      blockIndex: fragment.blockIndex,
      sourceRange: {
        start: fragment.sourceRange.start + index,
        end: fragment.sourceRange.start + index + match[0].length,
      },
      evidenceKind: 'DIRECT_TEXT',
    });
  }
}

function deduplicateDetections(detections: ResumeCandidateDetection[]): ResumeCandidateDetection[] {
  const seen = new Set<string>();
  return detections.filter((detection) => {
    const key = [
      detection.kind,
      detection.value.toLocaleLowerCase('en-US'),
      detection.pageNumber ?? 'null',
      detection.blockIndex,
      detection.sourceRange.start,
      detection.sourceRange.end,
      detection.evidenceKind,
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createSection(
  kind: ResumeSectionKind,
  heading: string | null,
  headingFragment: ResumeSourceFragment | null,
): ResumePreprocessedSection {
  return { kind, heading, headingFragment, fragments: [] };
}

function normalizeHeading(value: string): string {
  return value
    .trim()
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function looksLikeUnknownSectionHeading(value: string): boolean {
  const trimmed = value.trim().replace(/[:：]\s*$/, '');
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  if (trimmed.includes('\n')) return false;
  if (trimmed.includes('|')) return false;
  if (trimmed.split(/\s+/).length > 8) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (/[.!?]/.test(trimmed)) return false;

  const letters = [...trimmed].filter((character) => /[A-Za-z]/.test(character));
  return letters.length > 0 && letters.every((character) => character === character.toUpperCase());
}

function assertSourceRange(block: ResumePreprocessingBlockInput): void {
  const { startOffset, endOffset } = block.sourceRange;
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
    throw new Error('Resume source ranges must use integer offsets.');
  }
  if (startOffset < 0 || endOffset < startOffset) {
    throw new Error('Resume source range is invalid.');
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asUnknownArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? (value as unknown[]) : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
