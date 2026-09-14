'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ApiError,
  getSession,
  initializeCandidatePassport,
  type SessionResponse,
} from '../../lib/api';
import { getWorkspaceContextState, type WorkspaceContextState } from '../../lib/workspace-context';
import styles from './onboarding.module.css';

type LoadState = 'loading' | 'ready' | 'error';

export default function OnboardingPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [context, setContext] = useState<WorkspaceContextState | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [pending, setPending] = useState<'career' | 'hire' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const nextSession = await getSession();
        const nextContext = await getWorkspaceContextState(nextSession);
        if (!active) return;
        setSession(nextSession);
        setContext(nextContext);
        setLoadState('ready');
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace('/login?next=/onboarding');
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load onboarding.');
        setLoadState('error');
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [router]);

  async function chooseCareer() {
    if (!context) return;
    setPending('career');
    setError(null);
    try {
      if (!context.hasCandidate) await initializeCandidatePassport();
      router.replace('/career');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to create your Career Passport.',
      );
      setPending(null);
    }
  }

  function chooseHiring() {
    setPending('hire');
    router.replace('/app');
  }

  if (loadState === 'loading') {
    return (
      <main className={styles.shell}>
        <p className={styles.loading}>Preparing your Talent Network workspace…</p>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <p className={styles.kicker}>Account setup</p>
          <h1>What are you here to do?</h1>
          <p>
            Your account represents you as a person. Career and hiring are separate workspaces, and
            you can use both without creating another account.
          </p>
        </header>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {loadState === 'error' || !session || !context ? null : (
          <section className={styles.grid} aria-label="Choose a Talent Network workspace">
            <article className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.index}>01 / PERSONAL</span>
                <h2>Build my career</h2>
                <p>
                  Create your reusable Career Passport, discover relevant opportunities and manage
                  your professional identity.
                </p>
                <ul className={styles.guide}>
                  <li>Job seekers and people exploring better roles</li>
                  <li>Students and fresh graduates</li>
                  <li>Employed professionals, freelancers and contractors</li>
                  <li>Anyone managing resumes, applications or career data</li>
                </ul>
              </div>
              <div>
                <button
                  className={styles.action}
                  disabled={pending !== null}
                  onClick={() => void chooseCareer()}
                  type="button"
                >
                  {pending === 'career'
                    ? 'Preparing Career…'
                    : context.hasCandidate
                      ? 'Open Career workspace →'
                      : 'Create my Career Passport →'}
                </button>
                {context.hasCandidate ? (
                  <p className={styles.existing}>Your Career workspace already exists.</p>
                ) : null}
              </div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.index}>02 / ORGANIZATION</span>
                <h2>Hire talent</h2>
                <p>
                  Create or join an organization workspace to publish jobs, review candidates and
                  collaborate on hiring.
                </p>
                <ul className={styles.guide}>
                  <li>Founders and company owners</li>
                  <li>Recruiters, HR and talent acquisition teams</li>
                  <li>Hiring managers and interviewers</li>
                  <li>Recruitment and staffing professionals</li>
                </ul>
              </div>
              <div>
                <button
                  className={styles.action}
                  disabled={pending !== null}
                  onClick={chooseHiring}
                  type="button"
                >
                  {pending === 'hire'
                    ? 'Opening Hiring…'
                    : context.organizationCount > 0
                      ? 'Open Hiring workspace →'
                      : 'Create or join an organization →'}
                </button>
                {context.organizationCount > 0 ? (
                  <p className={styles.existing}>
                    You belong to {context.organizationCount}{' '}
                    {context.organizationCount === 1 ? 'organization' : 'organizations'}.
                  </p>
                ) : null}
              </div>
            </article>
          </section>
        )}

        <p className={styles.note}>
          <strong>Need both?</strong> Start with the workspace that matches what you want to do now.
          You can add or switch to the other context later. Organization membership never exposes
          your private Career activity to that organization.
        </p>
      </div>
    </main>
  );
}
