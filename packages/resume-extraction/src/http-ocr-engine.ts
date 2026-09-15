import { Buffer } from 'node:buffer';
import {
  RESUME_DOCUMENT_SCHEMA_VERSION,
  type ResumeDocumentPage,
  type ResumeExtractionInput,
  type ResumeExtractionResult,
  type ResumeOcrEngine,
} from './contracts.js';
import {
  RESUME_EXTRACTION_LIMITS,
  assertSourceWithinExtractionLimits,
  calculateExtractionQuality,
  createBlocks,
  normalizeExtractedText,
} from './normalization.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface HttpResumeOcrEngineOptions {
  endpoint: string;
  bearerToken?: string;
  timeoutMs?: number;
  maximumResponseBytes?: number;
  fetchImpl?: typeof fetch;
}

export class HttpResumeOcrEngine implements ResumeOcrEngine {
  readonly name = 'http-ocr-service';
  readonly version = '1';

  private readonly endpoint: string;
  private readonly bearerToken?: string;
  private readonly timeoutMs: number;
  private readonly maximumResponseBytes: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpResumeOcrEngineOptions) {
    this.endpoint = options.endpoint;
    this.bearerToken = options.bearerToken;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maximumResponseBytes = options.maximumResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async recognize(input: ResumeExtractionInput): Promise<ResumeExtractionResult> {
    assertSourceWithinExtractionLimits(input.bytes);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        'content-type': input.mimeType,
        'x-resume-version-id': input.resumeVersionId,
      };
      if (this.bearerToken) headers.authorization = `Bearer ${this.bearerToken}`;

      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers,
          body: Buffer.from(input.bytes),
          signal: controller.signal,
        });
      } catch (error: unknown) {
        if (isAbortError(error)) throw new Error('RESUME_OCR_SERVICE_UNAVAILABLE:TIMEOUT');
        throw new Error('RESUME_OCR_SERVICE_UNAVAILABLE:NETWORK');
      }

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`RESUME_OCR_SERVICE_UNAVAILABLE:HTTP_${response.status}`);
        }
        throw new Error(`RESUME_OCR_RECOGNITION_FAILED:HTTP_${response.status}`);
      }

      const responseText = await readBoundedResponse(response, this.maximumResponseBytes);
      const payload = parseOcrPayload(responseText);
      if (payload.pages.length > RESUME_EXTRACTION_LIMITS.maximumPages) {
        throw new Error('RESUME_OCR_RECOGNITION_FAILED:TOO_MANY_PAGES');
      }

      const pages: ResumeDocumentPage[] = payload.pages.map((page, index) => {
        const text = normalizeExtractedText(page.text);
        return {
          pageNumber: page.pageNumber ?? index + 1,
          text,
          blocks: createBlocks(text),
        };
      });
      const text = normalizeExtractedText(
        pages.map((page) => page.text).join('\n\n'),
      );
      const quality = calculateExtractionQuality(pages);
      quality.warnings.push(...payload.warnings);

      return {
        document: {
          schemaVersion: RESUME_DOCUMENT_SCHEMA_VERSION,
          resumeVersionId: input.resumeVersionId,
          sourceMimeType: input.mimeType,
          extractionMethod: 'OCR',
          extractor: { name: this.name, version: this.version },
          text,
          pages,
          quality,
        },
        durationMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

type OcrPayload = {
  pages: Array<{ pageNumber: number | null; text: string }>;
  warnings: string[];
};

function parseOcrPayload(value: string): OcrPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('RESUME_OCR_RECOGNITION_FAILED:INVALID_JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('RESUME_OCR_RECOGNITION_FAILED:INVALID_RESPONSE');
  }
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.pages) || record.pages.length === 0) {
    throw new Error('RESUME_OCR_RECOGNITION_FAILED:INVALID_PAGES');
  }

  const pages = record.pages.map((page) => {
    if (!page || typeof page !== 'object' || Array.isArray(page)) {
      throw new Error('RESUME_OCR_RECOGNITION_FAILED:INVALID_PAGE');
    }
    const pageRecord = page as Record<string, unknown>;
    const pageNumber = pageRecord.pageNumber;
    const text = pageRecord.text;
    if (
      pageNumber !== null &&
      pageNumber !== undefined &&
      (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber <= 0)
    ) {
      throw new Error('RESUME_OCR_RECOGNITION_FAILED:INVALID_PAGE_NUMBER');
    }
    if (typeof text !== 'string') {
      throw new Error('RESUME_OCR_RECOGNITION_FAILED:INVALID_PAGE_TEXT');
    }
    return { pageNumber: typeof pageNumber === 'number' ? pageNumber : null, text };
  });

  const warnings = Array.isArray(record.warnings)
    ? record.warnings.filter((warning): warning is string => typeof warning === 'string').slice(0, 50)
    : [];

  return { pages, warnings };
}

async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maximumBytes) {
    throw new Error('RESUME_OCR_RECOGNITION_FAILED:RESPONSE_TOO_LARGE');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error('RESUME_OCR_RECOGNITION_FAILED:RESPONSE_TOO_LARGE');
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
