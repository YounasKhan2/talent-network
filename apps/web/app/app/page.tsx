'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  createOrganization,
  getSession,
  logout,
  type SessionResponse,
} from '../../lib/api';

type LoadState = 'loading' | 'ready' | 'error';

export default function WorkspaceEntryPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [displayName, setDisplayName] = useState('');
  const [organizationPending, setOrganizationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getSession()
      .then((result) => {
        if (!active) return;
        setSession(result);
        setLoadState('ready');
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace('/login');
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load your workspace.');
        setLoadState('error');
      });

    return () => {
      active = false;
    };
  }, [router]);

  const primaryMembership = useMemo(() => session?.memberships[0] ?? null, [session]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrganizationPending(true);
    setError(null);

    try {
      await createOrganization({ displayName });
      setSession(await getSession());
      setDisplayName('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to create the workspace.');
    } finally {
      setOrganizationPending(false);
    }
  }

  async function signOut() {
    try {
      await logout();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  if (loadState === 'loading') {
    return (
      <main className="workspace-loading">
        <p className="eyebrow">Talent Network</p>
        <p>Loading your workspace…</p>
      </main>
    );
  }

  if (loadState === 'error' || !session) {
    return (
      <main className="workspace-loading">
        <p className="eyebrow">Talent Network</p>
        <h1>We could not load your workspace.</h1>
        <p>{error ?? 'Please try again.'}</p>
      </main>
    );
  }

  if (!primaryMembership) {
    return (
      <main className="onboarding-shell">
        <header className="onboarding-header">
          <div>
            <p className="eyebrow">Workspace setup</p>
            <p className="muted-line">Signed in as {session.user.primaryEmail}</p>
          </div>
          <button className="text-action" onClick={() => void signOut()} type="button">
            Sign out
          </button>
        </header>

        <section className="onboarding-grid">
          <div className="onboarding-copy">
            <p className="section-kicker">Employer workspace</p>
            <h1>Create the place where your hiring team works.</h1>
            <p>
              Your organization becomes the tenancy boundary for jobs, applicants, interviews,
              permissions, audit history, and future billing.
            </p>
          </div>

          <form className="workspace-create-form" onSubmit={createWorkspace}>
            <div className="form-index">01</div>
            <label>
              <span>Organization name</span>
              <input
                minLength={2}
                maxLength={120}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Acme Technologies"
                required
                value={displayName}
              />
            </label>
            <p className="field-note">
              We will create you as the owner. You can invite recruiters and hiring managers next.
            </p>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="primary-action" disabled={organizationPending} type="submit">
              {organizationPending ? 'Creating…' : 'Create workspace'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="product-shell">
      <aside className="product-sidebar">
        <div className="sidebar-brand">TN</div>
        <nav aria-label="Workspace navigation">
          <a className="nav-item nav-item-active" href="#overview">Overview</a>
          <a className="nav-item" href="#jobs">Jobs</a>
          <a className="nav-item" href="#candidates">Candidates</a>
          <a className="nav-item" href="#interviews">Interviews</a>
        </nav>
        <button className="sidebar-account" onClick={() => void signOut()} type="button">
          <span>{session.user.primaryEmail}</span>
          <small>Sign out</small>
        </button>
      </aside>

      <section className="workspace-main" id="overview">
        <header className="workspace-topbar">
          <div>
            <p className="section-kicker">Active workspace</p>
            <h1>{primaryMembership.displayName}</h1>
          </div>
          <div className="workspace-role">{primaryMembership.roleKey.replaceAll('_', ' ')}</div>
        </header>

        <section className="workspace-intro">
          <p className="eyebrow">Phase 1 connected</p>
          <h2>Your authenticated workspace is live.</h2>
          <p>
            Identity, tenant membership, permissions, sessions, audit events, and transactional
            outbox behavior are now connected to the product surface. Jobs and candidate workflows
            arrive in the next implementation phases.
          </p>
        </section>

        <section className="workspace-metrics" aria-label="Workspace foundation status">
          <article>
            <span>Identity</span>
            <strong>Session-backed</strong>
            <small>HttpOnly session + CSRF protection</small>
          </article>
          <article>
            <span>Tenant</span>
            <strong>{primaryMembership.slug}</strong>
            <small>Organization-scoped authorization</small>
          </article>
          <article>
            <span>Access</span>
            <strong>{primaryMembership.permissions.length} permissions</strong>
            <small>Resolved server-side from role bundle</small>
          </article>
        </section>
      </section>
    </main>
  );
}
