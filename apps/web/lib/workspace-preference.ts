import type { Route } from 'next';
import type { AccountContextResponse } from './api';

const lastContextStorageKey = 'tn_last_context_v1';
const activeOrganizationStorageKey = 'tn_active_organization';

export type WorkspacePreference =
  | { kind: 'career' }
  | { kind: 'organization'; organizationId: string };

export function readWorkspacePreference(): WorkspacePreference | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(lastContextStorageKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspacePreference>;
    if (parsed.kind === 'career') return { kind: 'career' };
    if (
      parsed.kind === 'organization' &&
      typeof parsed.organizationId === 'string' &&
      parsed.organizationId.length > 0
    ) {
      return { kind: 'organization', organizationId: parsed.organizationId };
    }
  } catch {
    // Invalid local preference is treated as absent and removed below.
  }

  window.localStorage.removeItem(lastContextStorageKey);
  return null;
}

export function rememberCareerContext(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(lastContextStorageKey, JSON.stringify({ kind: 'career' }));
}

export function rememberOrganizationContext(organizationId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    lastContextStorageKey,
    JSON.stringify({ kind: 'organization', organizationId }),
  );
  window.localStorage.setItem(activeOrganizationStorageKey, organizationId);
}

export function resolvePreferredWorkspaceLanding(contexts: AccountContextResponse): Route {
  const preference = readWorkspacePreference();

  if (preference?.kind === 'career' && contexts.career.available) {
    return '/career';
  }

  if (preference?.kind === 'organization') {
    const organization = contexts.organizations.find(
      (membership) => membership.organizationId === preference.organizationId,
    );

    if (organization) {
      rememberOrganizationContext(organization.organizationId);
      return '/app';
    }

    if (contexts.organizations[0]) {
      rememberOrganizationContext(contexts.organizations[0].organizationId);
      return '/app';
    }

    if (contexts.career.available) {
      rememberCareerContext();
      return '/career';
    }

    return '/onboarding';
  }

  if (contexts.organizations[0]) {
    rememberOrganizationContext(contexts.organizations[0].organizationId);
    return '/app';
  }

  if (contexts.career.available) {
    rememberCareerContext();
    return '/career';
  }

  return '/onboarding';
}
