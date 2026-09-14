export type Permission =
  | 'organization.read'
  | 'organization.update'
  | 'organization.members.read'
  | 'organization.members.manage'
  | 'organization.billing.manage'
  | 'jobs.read'
  | 'jobs.create'
  | 'jobs.update'
  | 'jobs.publish'
  | 'applications.read'
  | 'applications.evaluate'
  | 'applications.move_stage'
  | 'interviews.read'
  | 'interviews.manage'
  | 'scorecards.submit'
  | 'audit.read';

export type OrganizationRoleKey =
  'ORG_OWNER' | 'ORG_ADMIN' | 'RECRUITER' | 'HIRING_MANAGER' | 'INTERVIEWER' | 'VIEWER';

export type CandidateWorkMode = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'FLEXIBLE';
export type CandidateAvailabilityStatus =
  'IMMEDIATE' | 'NOTICE_PERIOD' | 'OPEN_TO_OFFERS' | 'NOT_LOOKING';

export interface MembershipResponse {
  organizationId: string;
  displayName: string;
  slug: string;
  roleKey: string;
  permissions: readonly Permission[];
}

export interface SessionResponse {
  user: {
    id: string;
    primaryEmail: string;
    emailVerifiedAt: string | null;
  };
  memberships: MembershipResponse[];
}

export interface AccountContextResponse {
  user: SessionResponse['user'];
  career: {
    available: boolean;
    candidateId: string | null;
  };
  organizations: MembershipResponse[];
}

export interface OrganizationResponse {
  id: string;
  displayName: string;
  legalName?: string | null;
  slug: string;
  status: string;
  verificationStatus: string;
}

export interface ActiveOrganizationContextResponse {
  organization: OrganizationResponse;
  membership: MembershipResponse;
}

export interface OrganizationInvitationResponse {
  id: string;
  organizationId?: string;
  email: string;
  roleKey: OrganizationRoleKey;
  status: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface CandidateProjectResponse {
  id: string;
  name: string;
  description: string | null;
  role: string | null;
  url: string | null;
  repositoryUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
}

export interface CandidateCertificationResponse {
  id: string;
  name: string;
  issuer: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  sortOrder: number;
}

export interface CandidateLanguageResponse {
  id: string;
  name: string;
  proficiency: string | null;
  sortOrder: number;
}

export interface CandidateLinkResponse {
  id: string;
  label: string;
  url: string;
  kind: string | null;
  sortOrder: number;
}

export interface CandidateLocationPreferenceResponse {
  id: string;
  label: string;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  remoteOnly: boolean;
  sortOrder: number;
}

export interface CandidatePassportResponse {
  id: string;
  userId: string;
  visibility: 'PRIVATE' | 'NETWORK' | 'VERIFIED_RECRUITERS';
  discoverability: 'HIDDEN' | 'SEARCHABLE';
  primaryLocale: string;
  timezone: string;
  currentProfileVersionId: string | null;
  currentProfileVersion: {
    id: string;
    versionNumber: number;
    status: string;
    source: string;
    headline: string | null;
    summary: string | null;
    availabilityStatus: CandidateAvailabilityStatus | null;
    availableFrom: string | null;
    compensationCurrency: string | null;
    compensationMinimum: number | null;
    compensationTarget: number | null;
    compensationPeriod: string | null;
    preferredWorkModes: CandidateWorkMode[];
    preferredEmploymentTypes: string[];
    employments: Array<{
      id: string;
      companyName: string;
      title: string;
      employmentType: string | null;
      location: string | null;
      workMode: CandidateWorkMode | null;
      startDate: string | null;
      endDate: string | null;
      isCurrent: boolean;
      summary: string | null;
      sortOrder: number;
    }>;
    education: Array<{
      id: string;
      institutionName: string;
      degree: string | null;
      fieldOfStudy: string | null;
      location: string | null;
      startDate: string | null;
      endDate: string | null;
      isCurrent: boolean;
      description: string | null;
      sortOrder: number;
    }>;
    skills: Array<{
      id: string;
      name: string;
      normalizedName: string;
      proficiency: string | null;
      experienceMonths: number | null;
      lastUsedAt: string | null;
      sortOrder: number;
    }>;
    projects: CandidateProjectResponse[];
    certifications: CandidateCertificationResponse[];
    languages: CandidateLanguageResponse[];
    links: CandidateLinkResponse[];
    locationPreferences: CandidateLocationPreferenceResponse[];
  } | null;
}

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';
const apiBase = `${apiOrigin.replace(/\/$/, '')}/api/v1`;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit & { organizationId?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCookie('tn_csrf');
    if (csrf) headers.set('x-csrf-token', csrf);
  }
  if (init.organizationId) headers.set('x-organization-id', init.organizationId);

  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const payload = await readJson(response);
    const message =
      readString(payload, 'message') ?? `Request failed with status ${response.status}.`;
    const code = readString(payload, 'code');
    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getSession(): Promise<SessionResponse> {
  return apiRequest<SessionResponse>('/auth/me');
}

export function getAccountContexts(): Promise<AccountContextResponse> {
  return apiRequest<AccountContextResponse>('/account/contexts');
}

export function login(email: string, password: string): Promise<SessionResponse> {
  return apiRequest<SessionResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function signup(email: string, password: string): Promise<SessionResponse> {
  return apiRequest<SessionResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' });
}

export function requestEmailVerification(): Promise<{ status: 'accepted' }> {
  return apiRequest<{ status: 'accepted' }>('/auth/email-verification/request', { method: 'POST' });
}

export function confirmEmailVerification(token: string): Promise<{ status: 'verified' }> {
  return apiRequest<{ status: 'verified' }>('/auth/email-verification/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function requestPasswordReset(email: string): Promise<{ status: 'accepted' }> {
  return apiRequest<{ status: 'accepted' }>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function confirmPasswordReset(token: string, password: string): Promise<void> {
  return apiRequest<void>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function createOrganization(input: {
  displayName: string;
  slug?: string;
}): Promise<OrganizationResponse> {
  return apiRequest<OrganizationResponse>('/organizations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getActiveOrganizationContext(
  organizationId: string,
): Promise<ActiveOrganizationContextResponse> {
  return apiRequest<ActiveOrganizationContextResponse>('/organizations/active-context', {
    organizationId,
  });
}

export function createOrganizationInvitation(
  organizationId: string,
  input: { email: string; roleKey: Exclude<OrganizationRoleKey, 'ORG_OWNER'> },
): Promise<OrganizationInvitationResponse> {
  return apiRequest<OrganizationInvitationResponse>(
    `/organizations/${organizationId}/invitations`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function listOrganizationInvitations(
  organizationId: string,
): Promise<OrganizationInvitationResponse[]> {
  return apiRequest<OrganizationInvitationResponse[]>(
    `/organizations/${organizationId}/invitations`,
  );
}

export function revokeOrganizationInvitation(
  organizationId: string,
  invitationId: string,
): Promise<void> {
  return apiRequest<void>(`/organizations/${organizationId}/invitations/${invitationId}`, {
    method: 'DELETE',
  });
}

export function acceptOrganizationInvitation(token: string): Promise<unknown> {
  return apiRequest<unknown>('/organizations/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function initializeCandidatePassport(): Promise<CandidatePassportResponse> {
  return apiRequest<CandidatePassportResponse>('/candidate/passport/initialize', {
    method: 'POST',
  });
}

export function getCandidatePassport(): Promise<CandidatePassportResponse> {
  return apiRequest<CandidatePassportResponse>('/candidate/passport');
}

export function updateCandidateOverview(input: {
  headline?: string | null;
  summary?: string | null;
  availabilityStatus?: CandidateAvailabilityStatus | null;
  availableFrom?: string | null;
  compensationCurrency?: string | null;
  compensationMinimum?: number | null;
  compensationTarget?: number | null;
  compensationPeriod?: string | null;
  preferredWorkModes?: CandidateWorkMode[];
  preferredEmploymentTypes?: string[];
}): Promise<CandidatePassportResponse> {
  return apiRequest<CandidatePassportResponse>('/candidate/passport/overview', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function replaceCandidateSkills(
  skills: Array<{
    name: string;
    proficiency?: string | null;
    experienceMonths?: number | null;
    lastUsedAt?: string | null;
  }>,
): Promise<CandidatePassportResponse> {
  return replaceCandidateSection('/candidate/passport/skills', { skills });
}

export function replaceCandidateEmployment(
  employments: Array<{
    companyName: string;
    title: string;
    employmentType?: string | null;
    location?: string | null;
    workMode?: CandidateWorkMode | null;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean;
    summary?: string | null;
  }>,
): Promise<CandidatePassportResponse> {
  return replaceCandidateSection('/candidate/passport/experience', { employments });
}

export function replaceCandidateEducation(
  education: Array<{
    institutionName: string;
    degree?: string | null;
    fieldOfStudy?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean;
    description?: string | null;
  }>,
): Promise<CandidatePassportResponse> {
  return replaceCandidateSection('/candidate/passport/education', { education });
}

export function replaceCandidateProjects(
  projects: Array<{
    name: string;
    description?: string | null;
    role?: string | null;
    url?: string | null;
    repositoryUrl?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>,
): Promise<CandidatePassportResponse> {
  return replaceCandidateSection('/candidate/passport/projects', { projects });
}

export function replaceCandidateCertifications(
  certifications: Array<{
    name: string;
    issuer?: string | null;
    credentialId?: string | null;
    credentialUrl?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
  }>,
): Promise<CandidatePassportResponse> {
  return replaceCandidateSection('/candidate/passport/certifications', { certifications });
}

export function replaceCandidateLanguages(
  languages: Array<{
    name: string;
    proficiency?: string | null;
  }>,
): Promise<CandidatePassportResponse> {
  return replaceCandidateSection('/candidate/passport/languages', { languages });
}

export function replaceCandidateLinks(
  links: Array<{
    label: string;
    url: string;
    kind?: string | null;
  }>,
): Promise<CandidatePassportResponse> {
  return replaceCandidateSection('/candidate/passport/links', { links });
}

export function replaceCandidateLocations(
  locationPreferences: Array<{
    label: string;
    countryCode?: string | null;
    region?: string | null;
    city?: string | null;
    remoteOnly?: boolean;
  }>,
): Promise<CandidatePassportResponse> {
  return replaceCandidateSection('/candidate/passport/locations', { locationPreferences });
}

export function updateCandidateSettings(input: {
  visibility?: 'PRIVATE' | 'NETWORK' | 'VERIFIED_RECRUITERS';
  discoverability?: 'HIDDEN' | 'SEARCHABLE';
  primaryLocale?: string;
  timezone?: string;
}): Promise<CandidatePassportResponse> {
  return apiRequest<CandidatePassportResponse>('/candidate/settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

function replaceCandidateSection(
  path: string,
  payload: Record<string, unknown>,
): Promise<CandidatePassportResponse> {
  return apiRequest<CandidatePassportResponse>(path, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  for (const entry of document.cookie.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(entry.slice(separator + 1).trim());
  }
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate : undefined;
}
