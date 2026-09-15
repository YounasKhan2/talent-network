export const RESUME_DOCUMENT_SCHEMA_VERSION = 'resume-document-v1' as const;

export type ResumeExtractionMethod = 'NATIVE_PDF' | 'NATIVE_DOCX' | 'OCR';

export type ResumeSourceRange = {
  startOffset: number;
  endOffset: number;
};

export type ResumeDocumentBlock = {
  text: string;
  sourceRange: ResumeSourceRange;
};

export type ResumeDocumentPage = {
  pageNumber: number | null;
  text: string;
  blocks: ResumeDocumentBlock[];
};

export type ResumeExtractionQuality = {
  characterCount: number;
  nonWhitespaceCharacterCount: number;
  pageCount: number;
  pagesWithText: number;
  replacementCharacterRatio: number;
  controlCharacterRatio: number;
  warnings: string[];
};

export type ResumeDocument = {
  schemaVersion: typeof RESUME_DOCUMENT_SCHEMA_VERSION;
  resumeVersionId: string;
  sourceMimeType: string;
  extractionMethod: ResumeExtractionMethod;
  extractor: {
    name: string;
    version: string;
  };
  text: string;
  pages: ResumeDocumentPage[];
  quality: ResumeExtractionQuality;
};

export type ResumeExtractionInput = {
  resumeVersionId: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type ResumeExtractionResult = {
  document: ResumeDocument;
  durationMs: number;
};

export interface ResumeExtractor {
  readonly name: string;
  readonly version: string;
  supports(mimeType: string): boolean;
  extract(input: ResumeExtractionInput): Promise<ResumeExtractionResult>;
}

export interface ResumeOcrEngine {
  readonly name: string;
  readonly version: string;
  recognize(input: ResumeExtractionInput): Promise<ResumeExtractionResult>;
}
