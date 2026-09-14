import type { Route } from 'next';
import { getAccountContexts, type AccountContextResponse } from './api';

export interface WorkspaceContextState {
  hasCandidate: boolean;
  organizationCount: number;
}

export async function getWorkspaceContextState(): Promise<WorkspaceContextState> {
  const contexts = await getAccountContexts();
  return workspaceContextStateFromAccountContexts(contexts);
}

export function workspaceContextStateFromAccountContexts(
  contexts: AccountContextResponse,
): WorkspaceContextState {
  return {
    hasCandidate: contexts.career.available,
    organizationCount: contexts.organizations.length,
  };
}

export function resolveWorkspaceLanding(state: WorkspaceContextState): Route {
  if (!state.hasCandidate && state.organizationCount === 0) return '/onboarding';
  if (state.hasCandidate && state.organizationCount === 0) return '/career';
  return '/app';
}
