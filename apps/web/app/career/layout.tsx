'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { WorkspaceContextSwitcher } from '../../components/workspace-context-switcher';
import { ApiError, getAccountContexts, type AccountContextResponse } from '../../lib/api';
import { rememberCareerContext } from '../../lib/workspace-preference';
import styles from './context-bar.module.css';

type GuardState = 'loading' | 'ready' | 'redirecting' | 'error';

export default function CareerWorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>('loading');
  const [contexts, setContexts] = useState<AccountContextResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function resolveCareerContext() {
      try {
        const nextContexts = await getAccountContexts();
        if (!active) return;

        if (!nextContexts.career.available) {
          setState('redirecting');
          router.replace('/onboarding?intent=career');
          return;
        }

        rememberCareerContext();
        setContexts(nextContexts);
        setState('ready');
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          setState('redirecting');
          router.replace('/login?next=/career');
          return;
        }

        setError(caught instanceof Error ? caught.message : 'Unable to resolve Career workspace.');
        setState('error');
      }
    }

    void resolveCareerContext();
    return () => {
      active = false;
    };
  }, [router]);

  if (state === 'loading' || state === 'redirecting') {
    return (
      <main className={styles.gate}>
        <p className="eyebrow">Talent Network</p>
        <p>{state === 'loading' ? 'Resolving your Career workspace…' : 'Opening onboarding…'}</p>
      </main>
    );
  }

  if (state === 'error' || !contexts) {
    return (
      <main className={styles.gate}>
        <p className="eyebrow">Talent Network</p>
        <h1>We could not resolve your Career workspace.</h1>
        <p>{error ?? 'Please try again.'}</p>
      </main>
    );
  }

  return (
    <>
      <div className={styles.bar} aria-label="Workspace context">
        <span className={styles.contextHint}>Talent Network workspace</span>
        <WorkspaceContextSwitcher activeContext={{ kind: 'career' }} contexts={contexts} />
      </div>
      {children}
    </>
  );
}
