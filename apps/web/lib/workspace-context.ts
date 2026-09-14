import type { Route } from 'next';
import { ApiError, getCandidatePassport, type SessionResponse } from './api';

export interface WorkspaceContextState {
  hasCandidate: boolean;
  organizationCount: number;
}

export async function getWorkspaceContextState(
  session: SessionResponse,
): Promise<WorkspaceContextState> {
  let hasCandidate = false;

  try {
    await getCandidatePassport();
    hasCandidate = true;
  } catch (error) {
    if (!(error instanceof ApiError && error.code === 'CANDIDATE_PASSPORT_NOT_INITIALIZED')) {
      throw error;
    }
  }

  return {
    hasCandidate,
    organizationCount: session.memberships.length,
  };
}

export function resolveWorkspaceLanding(state: WorkspaceContextState): Route {
  if (!state.hasCandidate && state.organizationCount === 0) return '/onboarding';
  if (state.hasCandidate && state.organizationCount === 0) return '/career';
  return '/app';
}
