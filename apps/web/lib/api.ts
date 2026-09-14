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

export interface SessionResponse {
  user: {
    id: string;
    primaryEmail: string;
    emailVerifiedAt: string | null;
  };
  memberships: Array<{
    organizationId: string;
    displayName: string;
    slug: string;
    roleKey: string;
    permissions: readonly Permission[];
  }>;
}

export interface OrganizationResponse {
  id: string;
  displayName: string;
  legalName?: string | null;
  slug: string;
  status: string;
  verificationStatus: string;
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

export function createOrganization(input: {
  displayName: string;
  slug?: string;
}): Promise<OrganizationResponse> {
  return apiRequest<OrganizationResponse>('/organizations', {
    method: 'POST',
    body: JSON.stringify(input),
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
