import {
  classifyCareerSectionHeading,
  type CareerPassportSectionTypeKey,
  type ResumeIntelligenceDiagnostic,
  type ResumeRecordReconciliation,
  type ResumeSourceCoverageSummary,
  type ResumeSourceLedgerEntry,
  type ResumeStructuralDocumentV1,
  type SourceLedgerStatus,
} from '@talent-network/contracts';

export type ResumeSourceLedgerDecisionStatus = Extract<
  SourceLedgerStatus,
  'MAPPED' | 'PARTIALLY_MAPPED' | 'UNMAPPED' | 'PRIVATE_ONLY' | 'INTENTIONALLY_IGNORED'
>;

export interface ResumeSourceLedgerDecision {
  sourceId: string;
  status: ResumeSourceLedgerDecisionStatus;
  semanticTypeKey?: CareerPassportSectionTypeKey;
  mappedClaimIds?: readonly string[];
  reasonCode?: string;
  reviewRequired?: boolean;
}

export interface ResumeSourceLedgerResult {
  resumeVersionId: string;
  sourceExtractionId: string;
  entries: readonly ResumeSourceLedgerEntry[];
  diagnostics: readonly ResumeIntelligenceDiagnostic[];
  sourceCoverage: ResumeSourceCoverageSummary;
  reconciliations: readonly ResumeRecordReconciliation[];
}

export interface BuildResumeSourceLedgerInput {
  structuralDocument: ResumeStructuralDocumentV1;
  decisions?: readonly ResumeSourceLedgerDecision[];
}

const ACCOUNTED_STATUSES = new Set<SourceLedgerStatus>([
  'MAPPED',
  'PARTIALLY_MAPPED',
  'UNMAPPED',
  'PRIVATE_ONLY',
  'INTENTIONALLY_IGNORED',
]);

export function buildResumeSourceLedger(
  input: BuildResumeSourceLedgerInput,
): ResumeSourceLedgerResult {
  const sectionTypes = new Map<string, CareerPassportSectionTypeKey>();
  const entries: ResumeSourceLedgerEntry[] = [];

  for (const section of input.structuralDocument.sections) {
    const classification = classifyCareerSectionHeading(section.headingText ?? '');
    const semanticTypeKey = classification.typeKey;
    sectionTypes.set(section.id, semanticTypeKey);
    entries.push({
      sourceId: section.id,
      sourceKind: 'SECTION',
      status: 'CLASSIFIED',
      semanticTypeKey,
      mappedClaimIds: [],
      reviewRequired:
        classification.reviewStatus === 'NEEDS_REVIEW' || section.sectionBoundaryConfidence < 0.9,
    });
  }

  for (const record of input.structuralDocument.records) {
    const semanticTypeKey = sectionTypes.get(record.sectionId) ?? 'CUSTOM';
    const isPrivateReference = semanticTypeKey === 'REFERENCES';
    entries.push({
      sourceId: record.id,
      sourceKind: 'RECORD',
      status: isPrivateReference ? 'PRIVATE_ONLY' : 'UNPROCESSED',
      semanticTypeKey,
      mappedClaimIds: [],
      ...(isPrivateReference ? { reasonCode: 'THIRD_PARTY_REFERENCE_DATA' } : {}),
      reviewRequired: !isPrivateReference,
    });
  }

  for (const nodeId of input.structuralDocument.unsectionedNodeIds) {
    entries.push({
      sourceId: nodeId,
      sourceKind: 'NODE',
      status: 'UNPROCESSED',
      mappedClaimIds: [],
      reviewRequired: true,
    });
  }

  const entryBySourceId = new Map(entries.map((entry) => [entry.sourceId, entry]));
  for (const decision of input.decisions ?? []) {
    const current = entryBySourceId.get(decision.sourceId);
    if (!current)
      throw new Error(`RESUME_SOURCE_LEDGER_DECISION_UNKNOWN_SOURCE:${decision.sourceId}`);
    validateDecision(decision);

    const semanticTypeKey = decision.semanticTypeKey ?? current.semanticTypeKey;
    const replacement: ResumeSourceLedgerEntry = {
      ...current,
      status: decision.status,
      ...(semanticTypeKey ? { semanticTypeKey } : {}),
      mappedClaimIds: [...(decision.mappedClaimIds ?? [])],
      ...(decision.reasonCode ? { reasonCode: decision.reasonCode } : {}),
      reviewRequired: decision.reviewRequired ?? defaultReviewRequired(decision.status),
    };
    const index = entries.findIndex((entry) => entry.sourceId === decision.sourceId);
    if (index < 0) throw new Error('RESUME_SOURCE_LEDGER_INTERNAL_INDEX_MISSING');
    entries[index] = replacement;
    entryBySourceId.set(replacement.sourceId, replacement);
  }

  return {
    resumeVersionId: input.structuralDocument.resumeVersionId,
    sourceExtractionId: input.structuralDocument.sourceExtractionId,
    entries,
    diagnostics: deriveLedgerDiagnostics(input.structuralDocument.diagnostics, entries),
    sourceCoverage: deriveSourceCoverage(entries),
    reconciliations: deriveRecordReconciliations(entries),
  };
}

function validateDecision(decision: ResumeSourceLedgerDecision): void {
  const claimCount = decision.mappedClaimIds?.length ?? 0;
  if (
    (decision.status === 'MAPPED' || decision.status === 'PARTIALLY_MAPPED') &&
    claimCount === 0
  ) {
    throw new Error(`RESUME_SOURCE_LEDGER_DECISION_REQUIRES_CLAIMS:${decision.sourceId}`);
  }
  if (decision.status !== 'MAPPED' && decision.status !== 'PARTIALLY_MAPPED' && claimCount > 0) {
    throw new Error(`RESUME_SOURCE_LEDGER_DECISION_FORBIDS_CLAIMS:${decision.sourceId}`);
  }
  if (decision.status === 'INTENTIONALLY_IGNORED' && !decision.reasonCode) {
    throw new Error(`RESUME_SOURCE_LEDGER_IGNORE_REASON_REQUIRED:${decision.sourceId}`);
  }
}

function defaultReviewRequired(status: ResumeSourceLedgerDecisionStatus): boolean {
  return status === 'PARTIALLY_MAPPED' || status === 'UNMAPPED';
}

function deriveSourceCoverage(
  entries: readonly ResumeSourceLedgerEntry[],
): ResumeSourceCoverageSummary {
  const meaningfulEntries = entries.filter((entry) => entry.sourceKind !== 'SECTION');
  const accountedSourceCount = meaningfulEntries.filter((entry) =>
    ACCOUNTED_STATUSES.has(entry.status),
  ).length;
  const unprocessedSourceCount = meaningfulEntries.filter(
    (entry) => entry.status === 'UNPROCESSED',
  ).length;
  const meaningfulSourceCount = meaningfulEntries.length;

  return {
    status: unprocessedSourceCount === 0 ? 'COMPLETE' : 'INCOMPLETE',
    meaningfulSourceCount,
    accountedSourceCount,
    unprocessedSourceCount,
    ratio: meaningfulSourceCount === 0 ? 1 : accountedSourceCount / meaningfulSourceCount,
  };
}

function deriveRecordReconciliations(
  entries: readonly ResumeSourceLedgerEntry[],
): ResumeRecordReconciliation[] {
  const groups = new Map<CareerPassportSectionTypeKey, ResumeSourceLedgerEntry[]>();

  for (const entry of entries) {
    if (entry.sourceKind !== 'RECORD' || !entry.semanticTypeKey) continue;
    const group = groups.get(entry.semanticTypeKey) ?? [];
    group.push(entry);
    groups.set(entry.semanticTypeKey, group);
  }

  return [...groups.entries()].map(([sectionTypeKey, records]) => {
    const mappedRecordCount = countStatus(records, 'MAPPED');
    const partiallyMappedRecordCount = countStatus(records, 'PARTIALLY_MAPPED');
    const unmappedRecordCount = countStatus(records, 'UNMAPPED');
    const privateOnlyRecordCount = countStatus(records, 'PRIVATE_ONLY');
    const intentionallyIgnoredRecordCount = countStatus(records, 'INTENTIONALLY_IGNORED');
    const unprocessedRecordCount = countStatus(records, 'UNPROCESSED');
    const accountedRecordCount = records.filter((record) =>
      ACCOUNTED_STATUSES.has(record.status),
    ).length;

    return {
      sectionTypeKey,
      sourceRecordCount: records.length,
      mappedRecordCount,
      partiallyMappedRecordCount,
      unmappedRecordCount,
      privateOnlyRecordCount,
      intentionallyIgnoredRecordCount,
      unprocessedRecordCount,
      accountedRecordCount,
      recordCoverageRatio:
        records.length === 0
          ? 1
          : (mappedRecordCount + partiallyMappedRecordCount) / records.length,
    };
  });
}

function countStatus(
  entries: readonly ResumeSourceLedgerEntry[],
  status: SourceLedgerStatus,
): number {
  return entries.filter((entry) => entry.status === status).length;
}

function deriveLedgerDiagnostics(
  structuralDiagnostics: readonly ResumeIntelligenceDiagnostic[],
  entries: readonly ResumeSourceLedgerEntry[],
): ResumeIntelligenceDiagnostic[] {
  const diagnostics = [...structuralDiagnostics];

  for (const entry of entries) {
    if (entry.sourceKind === 'SECTION' && entry.semanticTypeKey === 'CUSTOM') {
      diagnostics.push({
        code: 'UNMAPPED_SECTION',
        severity: 'WARNING',
        sectionId: entry.sourceId,
        nodeIds: [],
        reviewRequired: true,
      });
      continue;
    }

    if (entry.sourceKind === 'RECORD' && entry.status === 'UNPROCESSED') {
      diagnostics.push({
        code: 'UNMAPPED_RECORD',
        severity: 'WARNING',
        recordId: entry.sourceId,
        nodeIds: [],
        reviewRequired: true,
      });
      continue;
    }

    if (entry.sourceKind === 'RECORD' && entry.status === 'UNMAPPED') {
      diagnostics.push({
        code: 'UNMAPPED_RECORD',
        severity: 'WARNING',
        recordId: entry.sourceId,
        nodeIds: [],
        reviewRequired: true,
      });
      continue;
    }

    if (entry.sourceKind === 'RECORD' && entry.status === 'PARTIALLY_MAPPED') {
      diagnostics.push({
        code: 'PARTIALLY_MAPPED_RECORD',
        severity: 'WARNING',
        recordId: entry.sourceId,
        nodeIds: [],
        reviewRequired: true,
      });
      continue;
    }

    if (entry.sourceKind === 'RECORD' && entry.status === 'PRIVATE_ONLY') {
      diagnostics.push({
        code: 'PRIVATE_THIRD_PARTY_DATA',
        severity: 'INFO',
        recordId: entry.sourceId,
        nodeIds: [],
        reviewRequired: false,
      });
    }
  }

  const unsectioned = entries.filter(
    (entry) => entry.sourceKind === 'NODE' && entry.status === 'UNPROCESSED',
  );
  if (unsectioned.length > 0) {
    diagnostics.push({
      code: 'UNMAPPED_SECTION',
      severity: 'WARNING',
      nodeIds: unsectioned.map((entry) => entry.sourceId),
      reviewRequired: true,
    });
  }

  return diagnostics;
}
