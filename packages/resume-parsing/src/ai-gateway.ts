import type { PreprocessedResumeDocument } from './preprocessing.js';
import type { ParsedResumeSchemaVersion } from './versions.js';

export const RESUME_PARSE_AI_CAPABILITY = 'parseResume' as const;

export type ResumeAiGatewayFailureKind =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'TRANSIENT_PROVIDER'
  | 'INVALID_STRUCTURED_OUTPUT'
  | 'CONTEXT_TOO_LARGE'
  | 'POLICY_REFUSAL'
  | 'PERMANENT_CONFIGURATION';

export interface ResumeAiGatewayParseRequest {
  capability: typeof RESUME_PARSE_AI_CAPABILITY;
  resumeVersionId: string;
  sourceExtractionId: string;
  processingPipelineVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: ParsedResumeSchemaVersion;
  promptVersion: string;
  preprocessedDocument: PreprocessedResumeDocument;
}

export interface ResumeAiGatewayUsage {
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  durationMs?: number;
}

export interface ResumeAiGatewayParseResponse {
  output: unknown;
  provider: string;
  model: string;
  usage?: ResumeAiGatewayUsage;
}

export interface ResumeAiGateway {
  parseResume(request: ResumeAiGatewayParseRequest): Promise<ResumeAiGatewayParseResponse>;
}

export class ResumeAiGatewayError extends Error {
  constructor(
    readonly kind: ResumeAiGatewayFailureKind,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = 'ResumeAiGatewayError';
  }
}

export interface PrivacySafeResumeAiInvocationMetadata {
  capability: typeof RESUME_PARSE_AI_CAPABILITY;
  resumeVersionId: string;
  sourceExtractionId: string;
  processingPipelineVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: ParsedResumeSchemaVersion;
  promptVersion: string;
  provider: string;
  model: string;
  usage?: ResumeAiGatewayUsage;
}

export function toPrivacySafeResumeAiInvocationMetadata(
  request: ResumeAiGatewayParseRequest,
  response: ResumeAiGatewayParseResponse,
): PrivacySafeResumeAiInvocationMetadata {
  return {
    capability: request.capability,
    resumeVersionId: request.resumeVersionId,
    sourceExtractionId: request.sourceExtractionId,
    processingPipelineVersion: request.processingPipelineVersion,
    inputSchemaVersion: request.inputSchemaVersion,
    outputSchemaVersion: request.outputSchemaVersion,
    promptVersion: request.promptVersion,
    provider: response.provider,
    model: response.model,
    ...(response.usage ? { usage: response.usage } : {}),
  };
}
