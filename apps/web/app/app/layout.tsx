'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { WorkspaceContextSwitcher } from '../../components/workspace-context-switcher';
import { ApiError, getAccountContexts, type AccountContextResponse } from '../../lib/api';
import styles from '../career/context-bar.module.css';

const workspaceStorageKey = 'tn_active_organization';

type LoadState = 'loading' | 'ready' | 'redirecting' | 'error';

export default function HiringWorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [contexts, setContexts] = useState<AccountContextResponse | null>(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function resolveHiringContext() {
      try {
        const nextContexts = await getAccountContexts();
        if (!active) return;

        const storedOrganizationId = window.localStorage.getItem(workspaceStorageKey);
        const selectedOrganization =
          nextContexts.organizations.find(
            (organization) => organization.organizationId === storedOrganizationId,
          ) ?? nextContexts.organizations[0];

        if (selectedOrganization) {
          window.localStorage.setItem(workspaceStorageKey, selectedOrganization.organizationId);
          setActiveOrganizationId(selectedOrganization.organizationId);
        } else {
          window.localStorage.removeItem(workspaceStorageKey);
          setActiveOrganizationId(null);
        }

        setContexts(nextContexts);
        setState('ready');
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          setState('redirecting');
          router.replace('/login?next=/app');
          return;
        }

        setError(caught instanceof Error ? caught.message : 'Unable to resolve Hiring workspace.');
        setState('error');
      }
    }

    void resolveHiringContext();
    return () => {
      active = false;
    };
  }, [router]);

  if (state === 'loading' || state === 'redirecting') {
    return (
      <main className={styles.gate}>
        <p className="eyebrow">Talent Network</p>
        <p>{state === 'loading' ? 'Resolving your Hiring workspace…' : 'Opening sign in…'}</p>
      </main>
    );
  }

  if (state === 'error' || !contexts) {
    return (
      <main className={styles.gate}>
        <p className="eyebrow">Talent Network</p>
        <h1>We could not resolve your Hiring workspace.</h1>
        <p>{error ?? 'Please try again.'}</p>
      </main>
    );
  }

  return (
    <>
      <div className={styles.bar} aria-label="Workspace context">
        <span className={styles.contextHint}>Talent Network workspace</span>
        <WorkspaceContextSwitcher
          activeContext={
            activeOrganizationId
              ? { kind: 'organization', organizationId: activeOrganizationId }
              : { kind: 'hiring-setup' }
          }
          contexts={contexts}
        />
      </div>
      {children}
    </>
  );
}
