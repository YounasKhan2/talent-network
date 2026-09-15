export const LEGACY_RESUME_DOCUMENT_SCHEMA_VERSION = 'resume-document-v1' as const;
export const RESUME_DOCUMENT_SCHEMA_VERSION = 'resume-document-v2' as const;

export type ResumeExtractionMethod = 'NATIVE_PDF' | 'NATIVE_DOCX' | 'OCR';

export type ResumeSourceRange = {
  startOffset: number;
  endOffset: number;
};

export type ResumeBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResumeDocumentLine = {
  text: string;
  sourceRange: ResumeSourceRange;
  boundingBox: ResumeBoundingBox | null;
  sourceItemIndexes: number[];
};

export type ResumeDocumentBlock = {
  text: string;
  sourceRange: ResumeSourceRange;
  boundingBox?: ResumeBoundingBox | null;
  sourceItemIndexes?: number[];
};

export type ResumePdfTextItem = {
  kind: 'TEXT';
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
};

export type ResumePdfMarkedContentItem = {
  kind: 'MARKED_CONTENT';
  type: string;
  id: string | null;
};

export type ResumePdfTextContentItem = ResumePdfTextItem | ResumePdfMarkedContentItem;

export type ResumePdfTextStyle = {
  ascent: number;
  descent: number;
  vertical: boolean;
  fontFamily: string;
};

export type ResumeJsonValue =
  | null
  | boolean
  | number
  | string
  | ResumeJsonValue[]
  | { [key: string]: ResumeJsonValue };

export type ResumePdfNativePage = {
  pageNumber: number;
  rotation: number;
  userUnit: number;
  view: number[];
  viewport: {
    width: number;
    height: number;
    rotation: number;
    scale: number;
  };
  textContent: {
    items: ResumePdfTextContentItem[];
    styles: Record<string, ResumePdfTextStyle>;
    lang: string | null;
  };
  structTree: ResumeJsonValue | null;
};

export type ResumeDocumentPage = {
  pageNumber: number | null;
  text: string;
  lines?: ResumeDocumentLine[];
  blocks: ResumeDocumentBlock[];
  nativePdf?: ResumePdfNativePage;
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
