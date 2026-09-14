'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, getAccountContexts } from '../../lib/api';
import { rememberOrganizationContext } from '../../lib/workspace-preference';
import styles from '../career/context-bar.module.css';

const workspaceStorageKey = 'tn_active_organization';

type LoadState = 'loading' | 'ready' | 'redirecting' | 'error';

export default function HiringWorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
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
          rememberOrganizationContext(selectedOrganization.organizationId);
        } else {
          window.localStorage.removeItem(workspaceStorageKey);
        }

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

  if (state === 'error') {
    return (
      <main className={styles.gate}>
        <p className="eyebrow">Talent Network</p>
        <h1>We could not resolve your Hiring workspace.</h1>
        <p>{error ?? 'Please try again.'}</p>
      </main>
    );
  }

  return children;
}
