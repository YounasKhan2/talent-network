import {
  RESUME_PARSE_AI_CAPABILITY,
  ResumeAiGatewayError,
  type PrivacySafeResumeAiInvocationMetadata,
  type ResumeAiGateway,
  toPrivacySafeResumeAiInvocationMetadata,
} from './ai-gateway.js';
import type { ParsedResume, ParsedResumeDraft, ResumeParseInput, ResumeParser } from './contracts.js';
import { ResumeStructuredOutputError, validateParsedResume } from './schema.js';
import {
  PARSED_RESUME_SCHEMA_VERSION,
  RESUME_EVIDENCE_POLICY_VERSION,
  RESUME_PARSE_PROMPT_VERSION,
  RESUME_PARSER_POLICY_VERSION,
} from './versions.js';

export interface GatewayResumeParserOptions {
  name?: string;
  version?: string;
  promptVersion?: string;
}

export interface GatewayParsedResumeDraft extends ParsedResumeDraft {
  invocationMetadata: PrivacySafeResumeAiInvocationMetadata;
}

export class GatewayResumeParser implements ResumeParser {
  readonly name: string;
  readonly version: string;
  readonly promptVersion: string;

  constructor(
    private readonly gateway: ResumeAiGateway,
    options: GatewayResumeParserOptions = {},
  ) {
    this.name = options.name ?? 'ai-gateway-resume-parser';
    this.version = options.version ?? '1';
    this.promptVersion = options.promptVersion ?? RESUME_PARSE_PROMPT_VERSION;
  }

  async parse(input: ResumeParseInput): Promise<GatewayParsedResumeDraft> {
    const request = {
      capability: RESUME_PARSE_AI_CAPABILITY,
      resumeVersionId: input.resumeVersionId,
      sourceExtractionId: input.sourceExtractionId,
      processingPipelineVersion: input.processingPipelineVersion,
      inputSchemaVersion: input.sourceDocumentSchemaVersion,
      outputSchemaVersion: PARSED_RESUME_SCHEMA_VERSION,
      promptVersion: this.promptVersion,
      preprocessedDocument: input.preprocessedDocument,
    } as const;

    const response = await this.gateway.parseResume(request);
    const trustedOutput = attachTrustedExecutionMetadata(response.output, {
      resumeVersionId: input.resumeVersionId,
      sourceExtractionId: input.sourceExtractionId,
      parserName: this.name,
      parserVersion: this.version,
      promptVersion: this.promptVersion,
      provider: response.provider,
      model: response.model,
    });

    let parsedResume: ParsedResume;
    try {
      parsedResume = validateParsedResume(trustedOutput, {
        resumeVersionId: input.resumeVersionId,
        sourceExtractionId: input.sourceExtractionId,
      });
    } catch (error) {
      if (error instanceof ResumeStructuredOutputError) {
        throw new ResumeAiGatewayError(
          'INVALID_STRUCTURED_OUTPUT',
          false,
          'Resume parser returned schema-invalid structured output.',
        );
      }
      throw error;
    }

    return {
      parsedResume,
      invocationMetadata: toPrivacySafeResumeAiInvocationMetadata(request, response),
    };
  }
}

export class DeterministicResumeParser implements ResumeParser {
  readonly name = 'deterministic-fixture-resume-parser';
  readonly version = '1';

  constructor(private readonly outputFactory: (input: ResumeParseInput) => unknown) {}

  async parse(input: ResumeParseInput): Promise<ParsedResumeDraft> {
    const output = attachTrustedExecutionMetadata(this.outputFactory(input), {
      resumeVersionId: input.resumeVersionId,
      sourceExtractionId: input.sourceExtractionId,
      parserName: this.name,
      parserVersion: this.version,
    });

    return {
      parsedResume: validateParsedResume(output, {
        resumeVersionId: input.resumeVersionId,
        sourceExtractionId: input.sourceExtractionId,
      }),
    };
  }
}

interface TrustedParserMetadata {
  resumeVersionId: string;
  sourceExtractionId: string;
  parserName: string;
  parserVersion: string;
  promptVersion?: string;
  provider?: string;
  model?: string;
}

function attachTrustedExecutionMetadata(output: unknown, metadata: TrustedParserMetadata): unknown {
  if (output === null || typeof output !== 'object' || Array.isArray(output)) {
    throw new ResumeAiGatewayError(
      'INVALID_STRUCTURED_OUTPUT',
      false,
      'Resume parser returned a non-object structured output.',
    );
  }

  return {
    ...(output as Record<string, unknown>),
    schemaVersion: PARSED_RESUME_SCHEMA_VERSION,
    resumeVersionId: metadata.resumeVersionId,
    sourceExtractionId: metadata.sourceExtractionId,
    parser: {
      name: metadata.parserName,
      version: metadata.parserVersion,
      parserPolicyVersion: RESUME_PARSER_POLICY_VERSION,
      evidencePolicyVersion: RESUME_EVIDENCE_POLICY_VERSION,
      ...(metadata.promptVersion ? { promptVersion: metadata.promptVersion } : {}),
      ...(metadata.provider ? { provider: metadata.provider } : {}),
      ...(metadata.model ? { model: metadata.model } : {}),
    },
  };
}
