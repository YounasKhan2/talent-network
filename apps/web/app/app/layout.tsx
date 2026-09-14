'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { getWorkspaceContextState, type WorkspaceContextState } from '../../lib/workspace-context';
import styles from '../career/context-bar.module.css';

type LoadState = 'loading' | 'ready' | 'redirecting' | 'error';

export default function HiringWorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [context, setContext] = useState<WorkspaceContextState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function resolveHiringContext() {
      try {
        const nextContext = await getWorkspaceContextState();
        if (!active) return;
        setContext(nextContext);
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

  return (
    <>
      <div className={styles.bar} aria-label="Workspace context">
        <div className={styles.identity}>
          <span className={styles.label}>Active context</span>
          <strong>
            {context && context.organizationCount > 0 ? 'Organization · Hiring' : 'Hiring setup'}
          </strong>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.button}
            onClick={() =>
              router.push(
                (context?.hasCandidate ? '/career' : '/onboarding?intent=career') as Route,
              )
            }
            type="button"
          >
            {context?.hasCandidate ? 'Switch to Personal · Career' : 'Add Career workspace'}
          </button>
        </div>
      </div>
      {children}
    </>
  );
}
