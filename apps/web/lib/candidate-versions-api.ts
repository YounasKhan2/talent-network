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
  nextCursor: number | null;
}

export type CandidateProfileVersionSnapshot = NonNullable<
  CandidatePassportResponse['currentProfileVersion']
> & {
  isCurrent: boolean;
  approvedAt: string | null;
  createdAt: string;
};

export function listCandidateProfileVersions(input: {
  before?: number;
  limit?: number;
} = {}): Promise<CandidateProfileVersionListResponse> {
  const query = new URLSearchParams();
  if (input.before !== undefined) query.set('before', input.before.toString());
  if (input.limit !== undefined) query.set('limit', input.limit.toString());
  const suffix = query.size ? `?${query.toString()}` : '';
  return apiRequest<CandidateProfileVersionListResponse>(`/candidate/passport/versions${suffix}`);
}

export function getCandidateProfileVersion(
  versionNumber: number,
): Promise<CandidateProfileVersionSnapshot> {
  return apiRequest<CandidateProfileVersionSnapshot>(`/candidate/passport/versions/${versionNumber}`);
}
