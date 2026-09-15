import type {
  ResumeDocumentBlock,
  ResumeDocumentPage,
  ResumeExtractionQuality,
} from './contracts.js';

export const RESUME_EXTRACTION_LIMITS = {
  maximumSourceBytes: 10 * 1024 * 1024,
  maximumPages: 100,
  maximumNormalizedCharacters: 500_000,
} as const;

export class ResumeExtractionLimitError extends Error {
  constructor(
    public readonly code:
      | 'RESUME_EXTRACTION_SOURCE_TOO_LARGE'
      | 'RESUME_EXTRACTION_TOO_MANY_PAGES'
      | 'RESUME_EXTRACTION_TEXT_TOO_LARGE',
  ) {
    super(code);
    this.name = 'ResumeExtractionLimitError';
  }
}

export function assertSourceWithinExtractionLimits(bytes: Uint8Array): void {
  if (bytes.byteLength > RESUME_EXTRACTION_LIMITS.maximumSourceBytes) {
    throw new ResumeExtractionLimitError('RESUME_EXTRACTION_SOURCE_TOO_LARGE');
  }
}

export function normalizeExtractedText(value: string): string {
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length > RESUME_EXTRACTION_LIMITS.maximumNormalizedCharacters) {
    throw new ResumeExtractionLimitError('RESUME_EXTRACTION_TEXT_TOO_LARGE');
  }

  return normalized;
}

export function createBlocks(text: string): ResumeDocumentBlock[] {
  const blocks: ResumeDocumentBlock[] = [];
  let cursor = 0;

  for (const rawBlock of text.split(/\n{2,}/)) {
    const block = rawBlock.trim();
    if (!block) continue;

    const startOffset = text.indexOf(block, cursor);
    const endOffset = startOffset + block.length;
    blocks.push({ text: block, sourceRange: { startOffset, endOffset } });
    cursor = endOffset;
  }

  return blocks;
}

export function calculateExtractionQuality(pages: ResumeDocumentPage[]): ResumeExtractionQuality {
  const text = pages.map((page) => page.text).join('\n\n');
  const characterCount = text.length;
  const nonWhitespaceCharacterCount = text.replace(/\s/g, '').length;
  const replacementCharacters = [...text].filter((character) => character === '\ufffd').length;
  const controlCharacters = [...text].filter((character) => {
    const code = character.charCodeAt(0);
    return code < 32 && character !== '\n' && character !== '\t';
  }).length;

  return {
    characterCount,
    nonWhitespaceCharacterCount,
    pageCount: pages.length,
    pagesWithText: pages.filter((page) => page.text.trim().length > 0).length,
    replacementCharacterRatio: characterCount === 0 ? 0 : replacementCharacters / characterCount,
    controlCharacterRatio: characterCount === 0 ? 0 : controlCharacters / characterCount,
    warnings: [],
  };
}
