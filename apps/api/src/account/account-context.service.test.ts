import assert from 'node:assert/strict';
import test from 'node:test';
import { ROLE_PERMISSIONS, type SessionResponse } from '@talent-network/contracts';
import type { DatabaseClient } from '@talent-network/database';
import type { AuthService } from '../auth/auth.service.js';
import { AccountContextService } from './account-context.service.js';

const session: SessionResponse = {
  user: {
    id: '33333333-3333-4333-8333-333333333333',
    primaryEmail: 'person@example.com',
    emailVerifiedAt: '2026-09-14T00:00:00.000Z',
  },
  memberships: [
    {
      organizationId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Acme Talent',
      slug: 'acme-talent',
      roleKey: 'RECRUITER',
      permissions: ROLE_PERMISSIONS.RECRUITER,
    },
  ],
};

function createService(candidateId: string | null): AccountContextService {
  const database = {
    candidate: {
      findUnique: () => Promise.resolve(candidateId ? { id: candidateId } : null),
    },
  } as unknown as DatabaseClient;
  const authService = {
    getSession: () => Promise.resolve(session),
  } as unknown as AuthService;

  return new AccountContextService(database, authService);
}

void test('returns career context when candidate identity exists', async () => {
  const candidateId = '44444444-4444-4444-8444-444444444444';
  const result = await createService(candidateId).resolve('session-token');

  assert.equal(result.user.id, session.user.id);
  assert.equal(result.career.available, true);
  assert.equal(result.career.candidateId, candidateId);
  assert.deepEqual(result.organizations, session.memberships);
});

void test('returns unavailable career context without creating candidate state', async () => {
  const result = await createService(null).resolve('session-token');

  assert.equal(result.career.available, false);
  assert.equal(result.career.candidateId, null);
  assert.deepEqual(result.organizations, session.memberships);
});
