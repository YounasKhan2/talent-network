import {
  DATABASE_JSON_DB_NULL,
  type DatabaseClient,
  type PrismaInputJsonValue,
} from '@talent-network/database';
import type { ResumeDocument } from '@talent-network/resume-extraction';
import {
  PARSED_RESUME_SCHEMA_VERSION,
  RESUME_EVIDENCE_POLICY_VERSION,
  RESUME_PARSER_POLICY_VERSION,
  ResumeAiGatewayError,
  ResumeProposalValidationError,
  preprocessResumeDocument,
  validateResumeProposal,
  type ResumeParseJobData,
  type ResumeParser,
} from '@talent-network/resume-parsing';

const PARSE_RETRYABLE_FAILURE_CODES = ['RESUME_PARSE_PROVIDER_RETRYABLE'] as const;

type ResumeFailureMetadata = NonNullable<
  Parameters<DatabaseClient['resumeVersion']['updateMany']>[0]['data']['failureMetadata']
>;

export interface ResumeParseProcessorDependencies {
  database: DatabaseClient;
  parser: ResumeParser;
}

export interface ResumeParseExecutionContext {
  finalAttempt?: boolean;
  retryAttempt?: boolean;
}

export async function processResumeParseJob(
  input: ResumeParseJobData,
  dependencies: ResumeParseProcessorDependencies,
  execution: ResumeParseExecutionContext = {},
): Promise<void> {
  const { database, parser } = dependencies;
  const version = await database.resumeVersion.findUnique({
    where: { id: input.resumeVersionId },
    select: {
      id: true,
      resumeId: true,
      processingState: true,
      processingPipelineVersion: true,
    },
  });

  if (!version) throw new Error('ResumeVersion not found.');
  if (version.processingPipelineVersion !== input.processingPipelineVersion) {
    throw new Error('Resume parse pipeline version mismatch.');
  }

  const promptVersion = readParserPromptVersion(parser);
  const existingCompleted = await database.resumeParseResult.findFirst({
    where: {
      resumeVersionId: version.id,
      sourceExtractionId: input.extractionId,
      pipelineVersion: version.processingPipelineVersion,
      parserName: parser.name,
      parserVersion: parser.version,
      schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
      promptVersion,
      status: 'COMPLETED',
    },
    select: { id: true },
  });
  if (existingCompleted && version.processingState === 'READY_FOR_REVIEW') return;

  let claimed = await database.resumeVersion.updateMany({
    where: {
      id: version.id,
      processingPipelineVersion: version.processingPipelineVersion,
      processingState: 'PARSING',
    },
    data: {
      failureCode: null,
      failureMetadata: DATABASE_JSON_DB_NULL,
    },
  });

  if (claimed.count === 0 && execution.retryAttempt === true) {
    claimed = await database.resumeVersion.updateMany({
      where: {
        id: version.id,
        processingPipelineVersion: version.processingPipelineVersion,
        processingState: 'FAILED_RETRYABLE',
        failureCode: { in: [...PARSE_RETRYABLE_FAILURE_CODES] },
      },
      data: {
        processingState: 'PARSING',
        failureCode: null,
        failureMetadata: DATABASE_JSON_DB_NULL,
      },
    });
  }

  if (claimed.count === 0) {
    const current = await database.resumeVersion.findUnique({
      where: { id: version.id },
      select: { processingState: true },
    });
    if (current?.processingState === 'READY_FOR_REVIEW') return;
    throw new Error(
      `ResumeVersion is not ready for parsing: ${current?.processingState ?? 'missing'}`,
    );
  }

  const sourceExtraction = await database.resumeExtraction.findUnique({
    where: { id: input.extractionId },
    select: {
      id: true,
      resumeVersionId: true,
      pipelineVersion: true,
      status: true,
      schemaVersion: true,
      documentJson: true,
      textChecksumSha256: true,
    },
  });

  if (!sourceExtraction) {
    await markParseFailure(database, version, null, 'RESUME_PARSE_SOURCE_NOT_FOUND', false, true);
    return;
  }
  if (
    sourceExtraction.resumeVersionId !== version.id ||
    sourceExtraction.pipelineVersion !== version.processingPipelineVersion ||
    sourceExtraction.status !== 'COMPLETED'
  ) {
    await markParseFailure(database, version, null, 'RESUME_PARSE_SOURCE_INVALID', false, true);
    return;
  }

  const parseResult = await database.resumeParseResult.upsert({
    where: {
      resumeVersionId_sourceExtractionId_pipelineVersion_parserName_parserVersion_schemaVersion_promptVersion:
        {
          resumeVersionId: version.id,
          sourceExtractionId: sourceExtraction.id,
          pipelineVersion: version.processingPipelineVersion,
          parserName: parser.name,
          parserVersion: parser.version,
          schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
          promptVersion,
        },
    },
    create: {
      resumeVersionId: version.id,
      sourceExtractionId: sourceExtraction.id,
      pipelineVersion: version.processingPipelineVersion,
      parserName: parser.name,
      parserVersion: parser.version,
      schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
      parserPolicyVersion: RESUME_PARSER_POLICY_VERSION,
      evidencePolicyVersion: RESUME_EVIDENCE_POLICY_VERSION,
      promptVersion,
      inputChecksumSha256: sourceExtraction.textChecksumSha256,
    },
    update: {
      status: 'STARTED',
      failureCode: null,
      completedAt: null,
    },
  });

  try {
    const document = readResumeDocument(sourceExtraction.documentJson, version.id);
    const preprocessedDocument = preprocessResumeDocument(document);
    const draft = await parser.parse({
      resumeVersionId: version.id,
      sourceExtractionId: sourceExtraction.id,
      processingPipelineVersion: version.processingPipelineVersion,
      sourceDocumentSchemaVersion: sourceExtraction.schemaVersion,
      preprocessedDocument,
    });
    const validation = validateResumeProposal(
      draft.parsedResume,
      preprocessedDocument,
      sourceExtraction.id,
    );

    await database.$transaction(async (transaction) => {
      await transaction.resumeParseResult.update({
        where: { id: parseResult.id },
        data: {
          status: 'COMPLETED',
          provider: draft.parsedResume.parser.provider ?? null,
          model: draft.parsedResume.parser.model ?? null,
          parserPolicyVersion: draft.parsedResume.parser.parserPolicyVersion,
          evidencePolicyVersion: draft.parsedResume.parser.evidencePolicyVersion,
          parsedJson: toInputJson(draft.parsedResume),
          confidenceSummary: toInputJson(validation.confidenceSummary),
          warnings: toInputJson(draft.parsedResume.warnings),
          inputChecksumSha256: draft.inputChecksumSha256 ?? sourceExtraction.textChecksumSha256,
          failureCode: null,
          completedAt: new Date(),
        },
      });

      const advanced = await transaction.resumeVersion.updateMany({
        where: {
          id: version.id,
          processingState: 'PARSING',
          processingPipelineVersion: version.processingPipelineVersion,
        },
        data: {
          processingState: 'READY_FOR_REVIEW',
          failureCode: null,
          failureMetadata: DATABASE_JSON_DB_NULL,
        },
      });
      if (advanced.count === 0) return;

      await transaction.auditEvent.create({
        data: {
          actorType: 'SYSTEM',
          action: 'candidate.resume.parse_completed',
          resourceType: 'ResumeVersion',
          resourceId: version.id,
          metadata: {
            resumeId: version.resumeId,
            resumeParseResultId: parseResult.id,
            sourceResumeExtractionId: sourceExtraction.id,
            processingPipelineVersion: version.processingPipelineVersion,
            parserName: parser.name,
            parserVersion: parser.version,
            schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
            parserPolicyVersion: draft.parsedResume.parser.parserPolicyVersion,
            evidencePolicyVersion: draft.parsedResume.parser.evidencePolicyVersion,
            promptVersion,
            provider: draft.parsedResume.parser.provider ?? null,
            model: draft.parsedResume.parser.model ?? null,
            nextStage: 'READY_FOR_REVIEW',
          },
        },
      });

      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'ResumeVersion',
          aggregateId: version.id,
          eventType: 'candidate.resume.parse_completed',
          payload: {
            resumeId: version.resumeId,
            resumeVersionId: version.id,
            resumeParseResultId: parseResult.id,
            sourceResumeExtractionId: sourceExtraction.id,
            processingPipelineVersion: version.processingPipelineVersion,
            nextStage: 'READY_FOR_REVIEW',
          },
        },
      });
    });
  } catch (error: unknown) {
    const retryable = error instanceof ResumeAiGatewayError && error.retryable;
    const failureCode = safeParseFailureCode(error);
    await database.resumeParseResult.update({
      where: { id: parseResult.id },
      data: {
        status: 'FAILED',
        failureCode,
        completedAt: new Date(),
      },
    });
    await markParseFailure(
      database,
      version,
      parseResult.id,
      failureCode,
      retryable,
      retryable ? execution.finalAttempt === true : true,
    );
    if (retryable && execution.finalAttempt !== true) throw error;
  }
}

function readResumeDocument(value: unknown, resumeVersionId: string): ResumeDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResumeProposalValidationError('Resume extraction document is missing.');
  }
  const document = value as unknown as ResumeDocument;
  if (document.resumeVersionId !== resumeVersionId) {
    throw new ResumeProposalValidationError('Resume extraction document identity mismatch.');
  }
  return document;
}

function readParserPromptVersion(parser: ResumeParser): string {
  const value =
    'promptVersion' in parser ? (parser as { promptVersion?: unknown }).promptVersion : null;
  return typeof value === 'string' && value.length > 0 ? value : 'none';
}

function safeParseFailureCode(error: unknown): string {
  if (error instanceof ResumeAiGatewayError) {
    return error.retryable ? 'RESUME_PARSE_PROVIDER_RETRYABLE' : 'RESUME_PARSE_PROVIDER_TERMINAL';
  }
  if (error instanceof ResumeProposalValidationError) return 'RESUME_PARSE_PROPOSAL_INVALID';
  return 'RESUME_PARSE_FAILED';
}

async function markParseFailure(
  database: DatabaseClient,
  version: { id: string; resumeId: string; processingPipelineVersion: string },
  parseResultId: string | null,
  failureCode: string,
  retryable: boolean,
  finalAttempt: boolean,
): Promise<void> {
  const failureMetadata: ResumeFailureMetadata = {
    stage: 'PARSING',
    reason: failureCode,
    ...(parseResultId ? { resumeParseResultId: parseResultId } : {}),
  };

  if (retryable && !finalAttempt) {
    await database.resumeVersion.updateMany({
      where: { id: version.id, processingState: 'PARSING' },
      data: {
        processingState: 'FAILED_RETRYABLE',
        failureCode,
        failureMetadata,
      },
    });
    return;
  }

  await database.$transaction(async (transaction) => {
    const failed = await transaction.resumeVersion.updateMany({
      where: {
        id: version.id,
        processingState: { in: ['PARSING', 'FAILED_RETRYABLE'] },
      },
      data: {
        processingState: 'FAILED_TERMINAL',
        failureCode,
        failureMetadata,
      },
    });
    if (failed.count === 0) return;

    await transaction.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'candidate.resume.parse_failed_terminal',
        resourceType: 'ResumeVersion',
        resourceId: version.id,
        metadata: {
          resumeId: version.resumeId,
          resumeParseResultId: parseResultId,
          failureCode,
          processingPipelineVersion: version.processingPipelineVersion,
        },
      },
    });

    await transaction.outboxEvent.create({
      data: {
        aggregateType: 'ResumeVersion',
        aggregateId: version.id,
        eventType: 'candidate.resume.parse_failed_terminal',
        payload: {
          resumeId: version.resumeId,
          resumeVersionId: version.id,
          resumeParseResultId: parseResultId,
          failureCode,
        },
      },
    });
  });
}

function toInputJson(value: unknown): PrismaInputJsonValue {
  return value as PrismaInputJsonValue;
}
