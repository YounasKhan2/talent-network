'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, getCandidatePassport, getSession, type MembershipResponse } from '../../lib/api';

type GuardState = 'loading' | 'ready' | 'redirecting' | 'error';

export default function CareerWorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GuardState>('loading');
  const [memberships, setMemberships] = useState<MembershipResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function resolveCareerContext() {
      try {
        const session = await getSession();
        if (!active) return;
        setMemberships(session.memberships);

        try {
          await getCandidatePassport();
        } catch (caught) {
          if (
            caught instanceof ApiError &&
            caught.code === 'CANDIDATE_PASSPORT_NOT_INITIALIZED'
          ) {
            setState('redirecting');
            router.replace('/onboarding?intent=career');
            return;
          }
          throw caught;
        }

        if (active) setState('ready');
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
      <main className="workspace-context-gate">
        <p className="eyebrow">Talent Network</p>
        <p>{state === 'loading' ? 'Resolving your Career workspace…' : 'Opening onboarding…'}</p>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="workspace-context-gate">
        <p className="eyebrow">Talent Network</p>
        <h1>We could not resolve your Career workspace.</h1>
        <p>{error ?? 'Please try again.'}</p>
      </main>
    );
  }

  return (
    <>
      <div className="workspace-context-bar" aria-label="Workspace context">
        <div>
          <span className="workspace-context-label">Active context</span>
          <strong>Personal · Career</strong>
        </div>
        <div className="workspace-context-actions">
          {memberships.length > 0 ? (
            <button
              className="workspace-context-button"
              onClick={() => router.push('/app' as Route)}
              type="button"
            >
              Switch to hiring ({memberships.length})
            </button>
          ) : (
            <button
              className="workspace-context-button"
              onClick={() => router.push('/onboarding?intent=hire' as Route)}
              type="button"
            >
              Add hiring workspace
            </button>
          )}
        </div>
      </div>
      {children}
    </>
  );
}
