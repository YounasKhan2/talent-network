import type { CandidatePassportResponse } from './api';

type Profile = NonNullable<CandidatePassportResponse['currentProfileVersion']>;

export type EvidenceLevel = 'DECLARED' | 'SUPPORTED' | 'VERIFIED';
export type EvidenceSubjectType =
  | 'SKILL'
  | 'EXPERIENCE'
  | 'PROJECT'
  | 'CERTIFICATION'
  | 'PROFESSIONAL_LINK'
  | 'CUSTOM_ENTRY';
export type EvidenceSourceType =
  | 'PROFILE'
  | 'URL'
  | 'REPOSITORY'
  | 'CREDENTIAL'
  | 'FUTURE_VERIFICATION';

export interface CandidateEvidenceIndicator {
  id: string;
  subjectType: EvidenceSubjectType;
  subjectId: string;
  subjectLabel: string;
  level: EvidenceLevel;
  sourceType: EvidenceSourceType;
  sourceRef: string | null;
  explanation: string;
}

export interface CandidateEvidenceSummary {
  declared: number;
  supported: number;
  verified: number;
  total: number;
}

export function deriveCandidateEvidence(profile: Profile): CandidateEvidenceIndicator[] {
  return [
    ...profile.skills.map((skill) =>
      declaredIndicator('SKILL', skill.id, skill.name, 'Candidate-declared skill.'),
    ),
    ...profile.employments.map((employment) =>
      declaredIndicator(
        'EXPERIENCE',
        employment.id,
        `${employment.title} at ${employment.companyName}`,
        'Candidate-declared employment history. External verification is not yet available.',
      ),
    ),
    ...profile.projects.map((project) => {
      if (project.repositoryUrl) {
        return supportedIndicator(
          'PROJECT',
          project.id,
          project.name,
          'REPOSITORY',
          project.repositoryUrl,
          'Repository link supports this project claim. The repository has not been independently verified.',
        );
      }
      if (project.url) {
        return supportedIndicator(
          'PROJECT',
          project.id,
          project.name,
          'URL',
          project.url,
          'Project link provides supporting evidence. The project has not been independently verified.',
        );
      }
      return declaredIndicator(
        'PROJECT',
        project.id,
        project.name,
        'Candidate-declared project with no evidence link attached yet.',
      );
    }),
    ...profile.certifications.map((certification) => {
      if (certification.credentialUrl) {
        return supportedIndicator(
          'CERTIFICATION',
          certification.id,
          certification.name,
          'CREDENTIAL',
          certification.credentialUrl,
          'Credential URL supports this certification claim. Issuer verification is not yet performed by Talent Network.',
        );
      }
      if (certification.credentialId) {
        return supportedIndicator(
          'CERTIFICATION',
          certification.id,
          certification.name,
          'CREDENTIAL',
          null,
          `Credential ID ${certification.credentialId} is attached as supporting evidence. Issuer verification is not yet performed by Talent Network.`,
        );
      }
      return declaredIndicator(
        'CERTIFICATION',
        certification.id,
        certification.name,
        'Candidate-declared certification with no credential evidence attached yet.',
      );
    }),
    ...profile.links.map((link) =>
      supportedIndicator(
        'PROFESSIONAL_LINK',
        link.id,
        link.label,
        'URL',
        link.url,
        'Professional link provides supporting identity or work evidence. Ownership is not yet independently verified.',
      ),
    ),
    ...profile.customSections.flatMap((section) =>
      section.items.map((item) =>
        item.url
          ? supportedIndicator(
              'CUSTOM_ENTRY',
              item.id,
              `${section.title}: ${item.title}`,
              'URL',
              item.url,
              'Custom-section entry includes a supporting link. It remains supporting evidence rather than a standardized verified signal.',
            )
          : declaredIndicator(
              'CUSTOM_ENTRY',
              item.id,
              `${section.title}: ${item.title}`,
              'Candidate-declared custom evidence. Custom sections do not automatically become standardized hiring signals.',
            ),
      ),
    ),
  ];
}

export function summarizeCandidateEvidence(
  indicators: CandidateEvidenceIndicator[],
): CandidateEvidenceSummary {
  return indicators.reduce<CandidateEvidenceSummary>(
    (summary, indicator) => {
      summary.total += 1;
      if (indicator.level === 'DECLARED') summary.declared += 1;
      if (indicator.level === 'SUPPORTED') summary.supported += 1;
      if (indicator.level === 'VERIFIED') summary.verified += 1;
      return summary;
    },
    { declared: 0, supported: 0, verified: 0, total: 0 },
  );
}

function declaredIndicator(
  subjectType: EvidenceSubjectType,
  subjectId: string,
  subjectLabel: string,
  explanation: string,
): CandidateEvidenceIndicator {
  return {
    id: `${subjectType}:${subjectId}:PROFILE`,
    subjectType,
    subjectId,
    subjectLabel,
    level: 'DECLARED',
    sourceType: 'PROFILE',
    sourceRef: null,
    explanation,
  };
}

function supportedIndicator(
  subjectType: EvidenceSubjectType,
  subjectId: string,
  subjectLabel: string,
  sourceType: Exclude<EvidenceSourceType, 'PROFILE' | 'FUTURE_VERIFICATION'>,
  sourceRef: string | null,
  explanation: string,
): CandidateEvidenceIndicator {
  return {
    id: `${subjectType}:${subjectId}:${sourceType}`,
    subjectType,
    subjectId,
    subjectLabel,
    level: 'SUPPORTED',
    sourceType,
    sourceRef,
    explanation,
  };
}
