export type ServiceStatus = 'ok' | 'degraded' | 'unavailable';

export interface HealthResponse {
  service: string;
  status: ServiceStatus;
  timestamp: string;
  version?: string;
}

export interface ReadinessDependency {
  name: string;
  status: ServiceStatus;
  latencyMs?: number;
}

export interface ReadinessResponse extends HealthResponse {
  dependencies: ReadinessDependency[];
}

export interface ApiErrorShape {
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export const ORGANIZATION_ROLE_KEYS = [
  'ORG_OWNER',
  'ORG_ADMIN',
  'RECRUITER',
  'HIRING_MANAGER',
  'INTERVIEWER',
  'VIEWER',
] as const;

export type OrganizationRoleKey = (typeof ORGANIZATION_ROLE_KEYS)[number];

export const PERMISSIONS = [
  'organization.read',
  'organization.update',
  'organization.members.read',
  'organization.members.manage',
  'organization.billing.manage',
  'jobs.read',
  'jobs.create',
  'jobs.update',
  'jobs.publish',
  'applications.read',
  'applications.evaluate',
  'applications.move_stage',
  'interviews.read',
  'interviews.manage',
  'scorecards.submit',
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<OrganizationRoleKey, readonly Permission[]>> = {
  ORG_OWNER: PERMISSIONS,
  ORG_ADMIN: PERMISSIONS.filter((permission) => permission !== 'organization.billing.manage'),
  RECRUITER: [
    'organization.read',
    'organization.members.read',
    'jobs.read',
    'jobs.create',
    'jobs.update',
    'jobs.publish',
    'applications.read',
    'applications.evaluate',
    'applications.move_stage',
    'interviews.read',
    'interviews.manage',
    'scorecards.submit',
  ],
  HIRING_MANAGER: [
    'organization.read',
    'organization.members.read',
    'jobs.read',
    'jobs.update',
    'applications.read',
    'applications.evaluate',
    'applications.move_stage',
    'interviews.read',
    'interviews.manage',
    'scorecards.submit',
  ],
  INTERVIEWER: [
    'organization.read',
    'jobs.read',
    'applications.read',
    'interviews.read',
    'scorecards.submit',
  ],
  VIEWER: ['organization.read', 'jobs.read', 'applications.read', 'interviews.read'],
};

export interface AuthenticatedUser {
  id: string;
  primaryEmail: string;
  emailVerifiedAt: string | null;
}

export interface OrganizationMembershipSummary {
  organizationId: string;
  displayName: string;
  slug: string;
  roleKey: OrganizationRoleKey;
  permissions: readonly Permission[];
}

export interface SessionResponse {
  user: AuthenticatedUser;
  memberships: OrganizationMembershipSummary[];
}

export interface AccountContextResponse {
  user: AuthenticatedUser;
  career: {
    available: boolean;
    candidateId: string | null;
  };
  organizations: OrganizationMembershipSummary[];
}
