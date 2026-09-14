import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { ROLE_PERMISSIONS, type SessionResponse } from '@talent-network/contracts';
import type { AuthService } from '../auth/auth.service.js';
import { AuthorizationService } from './authorization.service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const otherOrganizationId = '22222222-2222-4222-8222-222222222222';

function createSession(roleKey: keyof typeof ROLE_PERMISSIONS): SessionResponse {
  return {
    user: {
      id: '33333333-3333-4333-8333-333333333333',
      primaryEmail: 'recruiter@example.com',
      emailVerifiedAt: '2026-09-14T00:00:00.000Z',
    },
    memberships: [
      {
        organizationId,
        displayName: 'Acme Talent',
        slug: 'acme-talent',
        roleKey,
        permissions: ROLE_PERMISSIONS[roleKey],
      },
    ],
  };
}

function createAuthorizationService(session: SessionResponse): AuthorizationService {
  const authService = {
    getSession: () => Promise.resolve(session),
  } as unknown as AuthService;
  return new AuthorizationService(authService);
}

void test('allows a recruiter to use permissions included in the recruiter bundle', async () => {
  const session = createSession('RECRUITER');
  const service = createAuthorizationService(session);

  const result = await service.authorizeOrganization(
    'session-token',
    organizationId,
    'organization.members.read',
  );

  assert.equal(result, session);
});

void test('denies a recruiter a permission outside the recruiter bundle', async () => {
  const service = createAuthorizationService(createSession('RECRUITER'));

  await assert.rejects(
    () =>
      service.authorizeOrganization('session-token', organizationId, 'organization.members.manage'),
    ForbiddenException,
  );
});

void test('denies access when membership belongs to a different organization', async () => {
  const service = createAuthorizationService(createSession('ORG_OWNER'));

  await assert.rejects(
    () => service.authorizeOrganization('session-token', otherOrganizationId, 'organization.read'),
    ForbiddenException,
  );
});

void test('returns the resolved membership in organization context', async () => {
  const session = createSession('VIEWER');
  const service = createAuthorizationService(session);

  const context = await service.authorizeOrganizationContext(
    'session-token',
    organizationId,
    'organization.read',
  );

  assert.equal(context.session, session);
  assert.equal(context.membership.roleKey, 'VIEWER');
  assert.equal(context.membership.organizationId, organizationId);
});
