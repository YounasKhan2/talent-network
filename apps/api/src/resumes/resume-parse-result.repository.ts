import type { DatabaseClient } from '@talent-network/database';

export interface ResumeParseExecutionIdentity {
  candidateId: string;
  resumeVersionId: string;
  sourceExtractionId: string;
  pipelineVersion: string;
  parserName: string;
  parserVersion: string;
  schemaVersion: string;
  promptVersion?: string;
}

export class ResumeParseSourceError extends Error {
  constructor(
    readonly code:
      | 'RESUME_VERSION_NOT_FOUND'
      | 'RESUME_NOT_PARSING'
      | 'SOURCE_EXTRACTION_NOT_FOUND'
      | 'SOURCE_EXTRACTION_NOT_COMPLETED',
  ) {
    super(code);
    this.name = 'ResumeParseSourceError';
  }
}

export class ResumeParseResultRepository {
  constructor(private readonly database: DatabaseClient) {}

  async resolveOwnedSource(input: {
    candidateId: string;
    resumeVersionId: string;
    sourceExtractionId: string;
  }) {
    const resumeVersion = await this.database.resumeVersion.findFirst({
      where: {
        id: input.resumeVersionId,
        resume: { candidateId: input.candidateId },
      },
      select: {
        id: true,
        processingState: true,
        processingPipelineVersion: true,
      },
    });

    if (!resumeVersion) {
      throw new ResumeParseSourceError('RESUME_VERSION_NOT_FOUND');
    }
    if (resumeVersion.processingState !== 'PARSING') {
      throw new ResumeParseSourceError('RESUME_NOT_PARSING');
    }

    const sourceExtraction = await this.database.resumeExtraction.findFirst({
      where: {
        id: input.sourceExtractionId,
        resumeVersionId: resumeVersion.id,
      },
      select: {
        id: true,
        resumeVersionId: true,
        status: true,
        schemaVersion: true,
        textChecksumSha256: true,
      },
    });

    if (!sourceExtraction) {
      throw new ResumeParseSourceError('SOURCE_EXTRACTION_NOT_FOUND');
    }
    if (sourceExtraction.status !== 'COMPLETED') {
      throw new ResumeParseSourceError('SOURCE_EXTRACTION_NOT_COMPLETED');
    }

    return { resumeVersion, sourceExtraction };
  }

  async getOrCreateStartedExecution(input: ResumeParseExecutionIdentity) {
    await this.resolveOwnedSource(input);

    const promptVersion = input.promptVersion ?? 'none';
    return this.database.resumeParseResult.upsert({
      where: {
        resumeVersionId_sourceExtractionId_pipelineVersion_parserName_parserVersion_schemaVersion_promptVersion:
          {
            resumeVersionId: input.resumeVersionId,
            sourceExtractionId: input.sourceExtractionId,
            pipelineVersion: input.pipelineVersion,
            parserName: input.parserName,
            parserVersion: input.parserVersion,
            schemaVersion: input.schemaVersion,
            promptVersion,
          },
      },
      create: {
        resumeVersionId: input.resumeVersionId,
        sourceExtractionId: input.sourceExtractionId,
        pipelineVersion: input.pipelineVersion,
        parserName: input.parserName,
        parserVersion: input.parserVersion,
        schemaVersion: input.schemaVersion,
        promptVersion,
      },
      update: {},
    });
  }

  async findOwnedParseResult(input: { candidateId: string; parseResultId: string }) {
    return this.database.resumeParseResult.findFirst({
      where: {
        id: input.parseResultId,
        resumeVersion: undefined,
        resumeVersionId: {
          in: await this.database.resumeVersion
            .findMany({
              where: { resume: { candidateId: input.candidateId } },
              select: { id: true },
            })
            .then((rows) => rows.map((row) => row.id)),
        },
      },
    });
  }
}
