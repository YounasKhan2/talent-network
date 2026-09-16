import type { CareerPassportSectionTypeKey } from './career-passport-taxonomy.js';

export const DOCUMENT_GRAPH_SCHEMA_VERSION = 'resume-document-graph-v1' as const;
export const RESUME_STRUCTURAL_DOCUMENT_SCHEMA_VERSION = 'resume-structural-document-v1' as const;
export const RESUME_INTELLIGENCE_BENCHMARK_SCHEMA_VERSION =
  'resume-intelligence-benchmark-v1' as const;

export const DOCUMENT_NODE_KINDS = [
  'DOCUMENT',
  'PAGE',
  'REGION',
  'TITLE',
  'HEADING',
  'PARAGRAPH',
  'LIST',
  'LIST_ITEM',
  'TABLE',
  'TABLE_ROW',
  'TABLE_CELL',
  'KEY_VALUE',
  'LINK',
  'IMAGE',
  'OTHER',
] as const;

export type DocumentNodeKind = (typeof DOCUMENT_NODE_KINDS)[number];

export interface ResumeIntelligenceSourceRange {
  start: number;
  end: number;
}

export interface ResumeIntelligenceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentGraphNode {
  id: string;
  kind: DocumentNodeKind;
  text?: string;
  pageNumber: number | null;
  sourceRange?: ResumeIntelligenceSourceRange;
  boundingBox?: ResumeIntelligenceBoundingBox;
  parentId?: string;
  childIds: readonly string[];
  readingOrder: number;
  extractionConfidence?: number;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface DocumentGraphWarning {
  code: ResumeIntelligenceDiagnosticCode;
  nodeIds: readonly string[];
  message?: string;
}

export interface ResumeDocumentGraphV1 {
  schemaVersion: typeof DOCUMENT_GRAPH_SCHEMA_VERSION;
  resumeVersionId: string;
  sourceExtractionId: string;
  nodes: readonly DocumentGraphNode[];
  pageIds: readonly string[];
  extractionMethod: string;
  extractionVersion: string;
  warnings: readonly DocumentGraphWarning[];
}

export interface ResumeStructuralSection {
  id: string;
  headingNodeId: string | null;
  headingText: string | null;
  nodeIds: readonly string[];
  sourceOrder: number;
  sectionBoundaryConfidence: number;
}

export interface ResumeStructuralRecord {
  id: string;
  sectionId: string;
  nodeIds: readonly string[];
  sourceOrder: number;
  recordBoundaryConfidence: number;
}

export interface ResumeStructuralDocumentV1 {
  schemaVersion: typeof RESUME_STRUCTURAL_DOCUMENT_SCHEMA_VERSION;
  documentGraphSchemaVersion: typeof DOCUMENT_GRAPH_SCHEMA_VERSION;
  resumeVersionId: string;
  sourceExtractionId: string;
  sections: readonly ResumeStructuralSection[];
  records: readonly ResumeStructuralRecord[];
  unsectionedNodeIds: readonly string[];
  diagnostics: readonly ResumeIntelligenceDiagnostic[];
}

export const SOURCE_LEDGER_STATUSES = [
  'UNPROCESSED',
  'CLASSIFIED',
  'MAPPED',
  'PARTIALLY_MAPPED',
  'UNMAPPED',
  'PRIVATE_ONLY',
  'INTENTIONALLY_IGNORED',
] as const;

export type SourceLedgerStatus = (typeof SOURCE_LEDGER_STATUSES)[number];
export type SourceLedgerSourceKind = 'SECTION' | 'RECORD' | 'NODE';

export interface ResumeSourceLedgerEntry {
  sourceId: string;
  sourceKind: SourceLedgerSourceKind;
  status: SourceLedgerStatus;
  semanticTypeKey?: CareerPassportSectionTypeKey;
  mappedClaimIds: readonly string[];
  reasonCode?: string;
  reviewRequired: boolean;
}

export const RESUME_INTELLIGENCE_DIAGNOSTIC_CODES = [
  'UNMAPPED_SECTION',
  'UNMAPPED_RECORD',
  'PARTIALLY_MAPPED_RECORD',
  'READING_ORDER_UNCERTAIN',
  'MULTI_COLUMN_LAYOUT_UNCERTAIN',
  'TABLE_STRUCTURE_UNCERTAIN',
  'SECTION_BOUNDARY_UNCERTAIN',
  'RECORD_BOUNDARY_UNCERTAIN',
  'OCR_LOW_QUALITY',
  'TRUNCATED_INPUT',
  'DUPLICATE_RECORD',
  'CONFLICTING_VALUES',
  'DATE_RANGE_AMBIGUOUS',
  'CONTACT_CONFLICT',
  'PRIVATE_THIRD_PARTY_DATA',
] as const;

export type ResumeIntelligenceDiagnosticCode =
  (typeof RESUME_INTELLIGENCE_DIAGNOSTIC_CODES)[number];

export interface ResumeIntelligenceDiagnostic {
  code: ResumeIntelligenceDiagnosticCode;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  sectionId?: string;
  recordId?: string;
  nodeIds: readonly string[];
  reviewRequired: boolean;
}

export type ResumeSourceCoverageStatus = 'INCOMPLETE' | 'COMPLETE';

export interface ResumeSourceCoverageSummary {
  status: ResumeSourceCoverageStatus;
  meaningfulSourceCount: number;
  accountedSourceCount: number;
  unprocessedSourceCount: number;
  ratio: number;
}

export interface ResumeRecordReconciliation {
  sectionTypeKey: CareerPassportSectionTypeKey;
  sourceRecordCount: number;
  mappedRecordCount: number;
  partiallyMappedRecordCount: number;
  unmappedRecordCount: number;
  privateOnlyRecordCount: number;
  intentionallyIgnoredRecordCount: number;
  unprocessedRecordCount: number;
  accountedRecordCount: number;
  recordCoverageRatio: number;
}

export interface ResumeIntelligenceQualitySummary {
  documentQuality: number | null;
  structuralConfidence: number | null;
  claimConfidence: number | null;
  sourceCoverage: ResumeSourceCoverageSummary;
  needsReviewCount: number;
}

export type ResumeBenchmarkExpectationKind = 'SECTION' | 'RECORDS' | 'ITEMS';

export interface ResumeBenchmarkSectionExpectation {
  typeKey: CareerPassportSectionTypeKey;
  label: string;
  expectationKind: ResumeBenchmarkExpectationKind;
  expectedCount?: number;
  privateOnly?: boolean;
  required: boolean;
  sourcePages?: readonly number[];
}

export interface ResumeBenchmarkGroundTruth {
  schemaVersion: typeof RESUME_INTELLIGENCE_BENCHMARK_SCHEMA_VERSION;
  fixtureId: string;
  title: string;
  description: string;
  sourceFormat: 'PDF' | 'DOCX' | 'IMAGE';
  pageCount: number | null;
  sections: readonly ResumeBenchmarkSectionExpectation[];
}

export interface ResumeBenchmarkSectionObservation {
  typeKey: CareerPassportSectionTypeKey;
  observedSourceCount: number;
  mappedCount: number;
  partiallyMappedCount: number;
  unmappedCount: number;
  privateOnlyCount: number;
}

export interface ResumeBenchmarkObservation {
  fixtureId: string;
  sections: readonly ResumeBenchmarkSectionObservation[];
  meaningfulSourceCount: number;
  accountedSourceCount: number;
  unprocessedSourceCount: number;
}

export interface ResumeBenchmarkSectionResult {
  typeKey: CareerPassportSectionTypeKey;
  expectedCount: number | null;
  observedSourceCount: number;
  countMatches: boolean | null;
  accountedCount: number;
  accountingComplete: boolean;
}

export interface ResumeBenchmarkEvaluation {
  fixtureId: string;
  passed: boolean;
  sourceAccountingComplete: boolean;
  sourceCoverageRatio: number;
  missingRequiredSections: readonly CareerPassportSectionTypeKey[];
  mismatchedCountSections: readonly CareerPassportSectionTypeKey[];
  sectionResults: readonly ResumeBenchmarkSectionResult[];
}
