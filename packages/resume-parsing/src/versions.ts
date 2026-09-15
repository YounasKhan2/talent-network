export const PARSED_RESUME_SCHEMA_VERSION = 'parsed-resume-v1' as const;
export const RESUME_PARSER_POLICY_VERSION = 'resume-parser-policy-v1' as const;
export const RESUME_EVIDENCE_POLICY_VERSION = 'resume-evidence-policy-v1' as const;

export type ParsedResumeSchemaVersion = typeof PARSED_RESUME_SCHEMA_VERSION;
export type ResumeParserPolicyVersion = typeof RESUME_PARSER_POLICY_VERSION;
export type ResumeEvidencePolicyVersion = typeof RESUME_EVIDENCE_POLICY_VERSION;
