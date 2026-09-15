import mammoth from 'mammoth';

import {
  RESUME_DOCUMENT_SCHEMA_VERSION,
  type ResumeExtractionInput,
  type ResumeExtractionResult,
  type ResumeExtractor,
} from './contracts.js';
import {
  assertSourceWithinExtractionLimits,
  calculateExtractionQuality,
  createBlocks,
  normalizeExtractedText,
} from './normalization.js';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
    const result = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
    const text = normalizeExtractedText(result.value);
    const page = {
      pageNumber: null,
      text,
      blocks: createBlocks(text),
    };
    const quality = calculateExtractionQuality([page]);
    quality.warnings = result.messages.map((message) => message.message);

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
