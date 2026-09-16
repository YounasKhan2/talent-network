import mammoth from 'mammoth';

import {
  RESUME_DOCUMENT_SCHEMA_VERSION,
  type ResumeDocumentBlock,
  type ResumeDocxBlockKind,
  type ResumeDocxHyperlink,
  type ResumeDocxNativeBlock,
  type ResumeExtractionInput,
  type ResumeExtractionResult,
  type ResumeExtractor,
} from './contracts.js';
import {
  ResumeExtractionLimitError,
  assertSourceWithinExtractionLimits,
  calculateExtractionQuality,
  createBlocks,
  normalizeExtractedText,
} from './normalization.js';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAXIMUM_DOCX_HTML_CHARACTERS = 2_000_000;
const HTML_TOKEN_PATTERN = /<[^>]*>|[^<]+/g;
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);

export class MammothDocxResumeExtractor implements ResumeExtractor {
  readonly name = 'mammoth';
  readonly version = '1.12.3';

  supports(mimeType: string): boolean {
    return mimeType === DOCX_MIME_TYPE;
  }

  async extract(input: ResumeExtractionInput): Promise<ResumeExtractionResult> {
    if (!this.supports(input.mimeType)) {
      throw new Error('RESUME_EXTRACTION_UNSUPPORTED_MIME_TYPE');
    }

    assertSourceWithinExtractionLimits(input.bytes);
    const startedAt = performance.now();
    const buffer = Buffer.from(input.bytes);
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        includeEmbeddedStyleMap: false,
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
      },
    );

    if (result.value.length > MAXIMUM_DOCX_HTML_CHARACTERS) {
      throw new ResumeExtractionLimitError('RESUME_EXTRACTION_TEXT_TOO_LARGE');
    }

    const nativeBlocks = parseMammothHtml(result.value);
    let text: string;
    let blocks: ResumeDocumentBlock[];
    let warnings = result.messages.map((message) => message.message);

    if (nativeBlocks.length > 0) {
      ({ text, blocks } = buildCanonicalDocument(nativeBlocks));
    } else {
      const fallback = await mammoth.extractRawText({ buffer });
      text = normalizeExtractedText(fallback.value);
      blocks = createBlocks(text);
      warnings = [...warnings, ...fallback.messages.map((message) => message.message)];
      warnings.push('DOCX_STRUCTURED_HTML_EMPTY_RAW_TEXT_FALLBACK');
    }

    const page = {
      pageNumber: null,
      text,
      blocks,
      nativeDocx: { blocks: nativeBlocks },
    };
    const quality = calculateExtractionQuality([page]);
    quality.warnings = warnings;

    return {
      durationMs: performance.now() - startedAt,
      document: {
        schemaVersion: RESUME_DOCUMENT_SCHEMA_VERSION,
        resumeVersionId: input.resumeVersionId,
        sourceMimeType: input.mimeType,
        extractionMethod: 'NATIVE_DOCX',
        extractor: { name: this.name, version: this.version },
        text,
        pages: [page],
        quality,
      },
    };
  }
}

function parseMammothHtml(html: string): ResumeDocxNativeBlock[] {
  const output: ResumeDocxNativeBlock[] = [];
  let tableDepth = 0;
  let rowCells: string[] | null = null;
  let rowHyperlinks: ResumeDocxHyperlink[] = [];
  let cellParts: string[] | null = null;
  let cellHyperlinks: ResumeDocxHyperlink[] = [];
  let blockKind: ResumeDocxBlockKind | null = null;
  let blockParts: string[] = [];
  let blockHyperlinks: ResumeDocxHyperlink[] = [];
  let anchor: { url: string; parts: string[] } | null = null;

  const appendText = (value: string): void => {
    if (!value) return;
    if (cellParts) cellParts.push(value);
    else if (blockKind) blockParts.push(value);
    if (anchor) anchor.parts.push(value);
  };

  const appendBreak = (): void => {
    if (cellParts) cellParts.push('\n');
    else if (blockKind) blockParts.push('\n');
  };

  const closeAnchor = (): void => {
    if (!anchor) return;
    const text = normalizeInlineText(anchor.parts.join(''));
    if (text) {
      const link = { text, url: anchor.url };
      if (cellParts) cellHyperlinks.push(link);
      else if (blockKind) blockHyperlinks.push(link);
    }
    anchor = null;
  };

  const closeBlock = (): void => {
    if (!blockKind) return;
    closeAnchor();
    let text = normalizeInlineText(blockParts.join(''));
    if (blockKind === 'LIST_ITEM' && text && !/^[•●◦▪*-]\s/.test(text)) text = `• ${text}`;
    if (text) {
      output.push({
        kind: blockKind,
        text,
        ...(blockHyperlinks.length > 0 ? { hyperlinks: blockHyperlinks } : {}),
      });
    }
    blockKind = null;
    blockParts = [];
    blockHyperlinks = [];
  };

  for (const token of html.match(HTML_TOKEN_PATTERN) ?? []) {
    if (!token.startsWith('<')) {
      appendText(decodeHtmlEntities(token));
      continue;
    }

    if (/^<!--/.test(token) || /^<!doctype/i.test(token)) continue;
    const tagName = readTagName(token);
    if (!tagName) continue;
    const closing = /^<\s*\//.test(token);

    if (!closing) {
      if (tagName === 'table') {
        closeBlock();
        tableDepth += 1;
      } else if (tagName === 'tr' && tableDepth > 0) {
        rowCells = [];
        rowHyperlinks = [];
      } else if ((tagName === 'td' || tagName === 'th') && rowCells) {
        cellParts = [];
        cellHyperlinks = [];
      } else if (BLOCK_TAGS.has(tagName) && tableDepth === 0) {
        closeBlock();
        blockKind = blockKindForTag(tagName);
      } else if (tagName === 'br') {
        appendBreak();
      } else if (tagName === 'a') {
        const url = safeHttpUrl(readAttribute(token, 'href'));
        if (url) anchor = { url, parts: [] };
      }
      continue;
    }

    if (tagName === 'a') {
      closeAnchor();
    } else if ((tagName === 'td' || tagName === 'th') && rowCells && cellParts) {
      closeAnchor();
      const text = normalizeInlineText(cellParts.join(''));
      if (text) rowCells.push(text);
      rowHyperlinks.push(...cellHyperlinks);
      cellParts = null;
      cellHyperlinks = [];
    } else if (tagName === 'tr' && rowCells) {
      const cells = rowCells.filter(Boolean);
      const text = normalizeInlineText(cells.join(' | '));
      if (text) {
        output.push({
          kind: 'TABLE_ROW',
          text,
          tableCells: cells,
          ...(rowHyperlinks.length > 0 ? { hyperlinks: rowHyperlinks } : {}),
        });
      }
      rowCells = null;
      rowHyperlinks = [];
    } else if (tagName === 'table') {
      tableDepth = Math.max(0, tableDepth - 1);
    } else if (BLOCK_TAGS.has(tagName) && tableDepth === 0) {
      closeBlock();
    } else if (tagName === 'p' && tableDepth > 0 && cellParts) {
      cellParts.push(' ');
    }
  }

  closeBlock();
  return output;
}

function buildCanonicalDocument(nativeBlocks: ResumeDocxNativeBlock[]): {
  text: string;
  blocks: ResumeDocumentBlock[];
} {
  const text = normalizeExtractedText(nativeBlocks.map((block) => block.text).join('\n'));
  const blocks: ResumeDocumentBlock[] = [];
  let cursor = 0;

  for (const nativeBlock of nativeBlocks) {
    const blockText = normalizeInlineText(nativeBlock.text);
    if (!blockText) continue;
    const startOffset = text.indexOf(blockText, cursor);
    if (startOffset < 0) continue;
    const endOffset = startOffset + blockText.length;
    blocks.push({ text: blockText, sourceRange: { startOffset, endOffset } });
    cursor = endOffset;
  }

  return { text, blocks };
}

function blockKindForTag(tagName: string): ResumeDocxBlockKind {
  if (tagName === 'li') return 'LIST_ITEM';
  if (/^h[1-6]$/.test(tagName)) return 'HEADING';
  return 'PARAGRAPH';
}

function readTagName(token: string): string | null {
  const match = /^<\s*\/?\s*([A-Za-z0-9]+)/.exec(token);
  return match?.[1]?.toLowerCase() ?? null;
}

function readAttribute(token: string, name: string): string | null {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = pattern.exec(token);
  return match ? decodeHtmlEntities(match[1] ?? match[2] ?? '') : null;
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body: string) => {
    const normalized = body.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    const radix = normalized.startsWith('#x') ? 16 : 10;
    const digits = normalized.replace(/^#x?/, '');
    const codePoint = Number.parseInt(digits, radix);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
}
