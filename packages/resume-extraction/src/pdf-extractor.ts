import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import {
  RESUME_DOCUMENT_SCHEMA_VERSION,
  type ResumeDocumentPage,
  type ResumeExtractionInput,
  type ResumeExtractionResult,
  type ResumeExtractor,
} from './contracts.js';
import {
  RESUME_EXTRACTION_LIMITS,
  ResumeExtractionLimitError,
  assertSourceWithinExtractionLimits,
  calculateExtractionQuality,
  createBlocks,
  normalizeExtractedText,
} from './normalization.js';

const PDF_MIME_TYPE = 'application/pdf';

type PdfTextItem = {
  str: string;
  hasEOL: boolean;
};

function toPdfTextItem(item: unknown): PdfTextItem | null {
  if (typeof item !== 'object' || item === null || !('str' in item)) {
    return null;
  }

  const candidate = item as { str?: unknown; hasEOL?: unknown };
  if (typeof candidate.str !== 'string') {
    return null;
  }

  return {
    str: candidate.str,
    hasEOL: candidate.hasEOL === true,
  };
}

export class PdfJsResumeExtractor implements ResumeExtractor {
  readonly name = 'pdfjs-dist';
  readonly version = '6.3.289';

  supports(mimeType: string): boolean {
    return mimeType === PDF_MIME_TYPE;
  }

  async extract(input: ResumeExtractionInput): Promise<ResumeExtractionResult> {
    if (!this.supports(input.mimeType)) {
      throw new Error('RESUME_EXTRACTION_UNSUPPORTED_MIME_TYPE');
    }

    assertSourceWithinExtractionLimits(input.bytes);
    const startedAt = performance.now();
    const data = Uint8Array.from(input.bytes);
    const loadingTask = getDocument({ data, useWorkerFetch: false });
    const pdf = await loadingTask.promise;

    try {
      if (pdf.numPages > RESUME_EXTRACTION_LIMITS.maximumPages) {
        throw new ResumeExtractionLimitError('RESUME_EXTRACTION_TOO_MANY_PAGES');
      }

      const pages: ResumeDocumentPage[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const rawText = content.items
          .map((item) => toPdfTextItem(item))
          .filter((item): item is PdfTextItem => item !== null)
          .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
          .join('');
        const text = normalizeExtractedText(rawText);

        pages.push({
          pageNumber,
          text,
          blocks: createBlocks(text),
        });
      }

      const text = normalizeExtractedText(pages.map((page) => page.text).join('\n\n'));

      return {
        durationMs: performance.now() - startedAt,
        document: {
          schemaVersion: RESUME_DOCUMENT_SCHEMA_VERSION,
          resumeVersionId: input.resumeVersionId,
          sourceMimeType: input.mimeType,
          extractionMethod: 'NATIVE_PDF',
          extractor: { name: this.name, version: this.version },
          text,
          pages,
          quality: calculateExtractionQuality(pages),
        },
      };
    } finally {
      await loadingTask.destroy();
    }
  }
}
