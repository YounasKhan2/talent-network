import { apiRequest, type CandidatePassportResponse } from './api';

export interface CandidateProfileVersionSummary {
  id: string;
  versionNumber: number;
  status: string;
  source: string;
  approvedAt: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export interface CandidateProfileVersionListResponse {
  currentProfileVersionId: string | null;
  versions: CandidateProfileVersionSummary[];
}

export type CandidateProfileVersionSnapshot = NonNullable<
  CandidatePassportResponse['currentProfileVersion']
> & {
  isCurrent: boolean;
  approvedAt: string | null;
  createdAt: string;
};

export function listCandidateProfileVersions(): Promise<CandidateProfileVersionListResponse> {
  return apiRequest<CandidateProfileVersionListResponse>('/candidate/passport/versions');
}

export function getCandidateProfileVersion(
  versionNumber: number,
): Promise<CandidateProfileVersionSnapshot> {
  return apiRequest<CandidateProfileVersionSnapshot>(`/candidate/passport/versions/${versionNumber}`);
}
