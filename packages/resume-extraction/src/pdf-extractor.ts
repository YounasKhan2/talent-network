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
  normalizeExtractedText,
} from './normalization.js';
import {
  reconstructPdfPageText,
  toResumeJsonValue,
  toResumePdfTextContentItem,
  toResumePdfTextStyles,
} from './pdf-layout.js';

const PDF_MIME_TYPE = 'application/pdf';

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
        const viewport = page.getViewport({ scale: 1 });
        const [content, structTree, annotations] = await Promise.all([
          page.getTextContent({
            includeMarkedContent: true,
            disableNormalization: true,
          }),
          page.getStructTree(),
          page.getAnnotations({ intent: 'display' }),
        ]);
        const items = content.items
          .map((item) => toResumePdfTextContentItem(item))
          .filter((item) => item !== null);
        const reconstructed = reconstructPdfPageText(items);
        const text = normalizeExtractedText(reconstructed.text);

        if (text !== reconstructed.text) {
          throw new Error('RESUME_EXTRACTION_LAYOUT_RANGE_MISMATCH');
        }

        pages.push({
          pageNumber,
          text,
          lines: reconstructed.lines,
          blocks: reconstructed.blocks,
          nativePdf: {
            pageNumber,
            rotation: page.rotate,
            userUnit: page.userUnit,
            view: [...page.view],
            viewport: {
              width: viewport.width,
              height: viewport.height,
              rotation: viewport.rotation,
              scale: viewport.scale,
            },
            textContent: {
              items,
              styles: toResumePdfTextStyles(content.styles),
              lang: content.lang ?? null,
            },
            structTree: toResumeJsonValue(structTree),
            annotations: annotations
              .map((annotation) => toResumeJsonValue(annotation))
              .filter((annotation) => annotation !== null),
          },
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
