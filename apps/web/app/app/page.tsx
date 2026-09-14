'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  createOrganization,
  getActiveOrganizationContext,
  getSession,
  logout,
  requestEmailVerification,
  type MembershipResponse,
  type Permission,
  type SessionResponse,
} from '../../lib/api';

type LoadState = 'loading' | 'ready' | 'error';

const workspaceStorageKey = 'tn_active_organization';

export default function WorkspaceEntryPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [activeMembership, setActiveMembership] = useState<MembershipResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [displayName, setDisplayName] = useState('');
  const [organizationPending, setOrganizationPending] = useState(false);
  const [workspacePending, setWorkspacePending] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadWorkspace() {
      try {
        const result = await getSession();
        if (!active) return;
        setSession(result);

        if (result.memberships.length > 0) {
          const storedOrganizationId = window.localStorage.getItem(workspaceStorageKey);
          const selected =
            result.memberships.find(
              (membership) => membership.organizationId === storedOrganizationId,
            ) ?? result.memberships[0];

          if (selected) {
            const context = await getActiveOrganizationContext(selected.organizationId);
            if (!active) return;
            setActiveMembership(context.membership);
            window.localStorage.setItem(workspaceStorageKey, selected.organizationId);
          }
        }

        if (active) setLoadState('ready');
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace('/login');
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load your workspace.');
        setLoadState('error');
      }
    }

    void loadWorkspace();
    return () => {
      active = false;
    };
  }, [router]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrganizationPending(true);
    setError(null);

    try {
      const organization = await createOrganization({ displayName });
      const refreshedSession = await getSession();
      const context = await getActiveOrganizationContext(organization.id);
      setSession(refreshedSession);
      setActiveMembership(context.membership);
      window.localStorage.setItem(workspaceStorageKey, organization.id);
      setDisplayName('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to create the workspace.');
    } finally {
      setOrganizationPending(false);
    }
  }

  async function switchWorkspace(organizationId: string) {
    if (organizationId === activeMembership?.organizationId) return;
    setWorkspacePending(true);
    setError(null);

    try {
      const context = await getActiveOrganizationContext(organizationId);
      setActiveMembership(context.membership);
      window.localStorage.setItem(workspaceStorageKey, organizationId);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to switch workspace.');
    } finally {
      setWorkspacePending(false);
    }
  }

  async function sendVerification() {
    setVerificationPending(true);
    setVerificationMessage(null);
    try {
      await requestEmailVerification();
      setVerificationMessage('Verification link sent. Check your inbox.');
    } catch (caught) {
      setVerificationMessage(
        caught instanceof ApiError ? caught.message : 'Unable to send a verification link.',
      );
    } finally {
      setVerificationPending(false);
    }
  }

  async function signOut() {
    try {
      await logout();
    } finally {
      window.localStorage.removeItem(workspaceStorageKey);
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

  if (session.memberships.length === 0) {
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

          <form className="workspace-create-form" onSubmit={(event) => void createWorkspace(event)}>
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
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="primary-action" disabled={organizationPending} type="submit">
              {organizationPending ? 'Creating…' : 'Create workspace'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (!activeMembership) {
    return (
      <main className="workspace-loading">
        <p className="eyebrow">Talent Network</p>
        <p>Resolving your active organization…</p>
      </main>
    );
  }

  const permissions = activeMembership.permissions;

  return (
    <main className="product-shell">
      <aside className="product-sidebar">
        <div className="sidebar-brand">TN</div>

        <div className="workspace-switcher">
          <span>Workspace</span>
          <select
            aria-label="Active workspace"
            disabled={workspacePending}
            onChange={(event) => void switchWorkspace(event.target.value)}
            value={activeMembership.organizationId}
          >
            {session.memberships.map((membership) => (
              <option key={membership.organizationId} value={membership.organizationId}>
                {membership.displayName}
              </option>
            ))}
          </select>
        </div>

        <nav aria-label="Workspace navigation">
          <a className="nav-item nav-item-active" href="#overview">
            Overview
          </a>
          {hasPermission(permissions, 'jobs.read') ? (
            <a className="nav-item" href="#capabilities">
              Jobs
            </a>
          ) : null}
          {hasPermission(permissions, 'applications.read') ? (
            <a className="nav-item" href="#capabilities">
              Candidates
            </a>
          ) : null}
          {hasPermission(permissions, 'interviews.read') ? (
            <a className="nav-item" href="#capabilities">
              Interviews
            </a>
          ) : null}
          {hasPermission(permissions, 'organization.members.read') ? (
            <a className="nav-item" href="#capabilities">
              Team
            </a>
          ) : null}
          {hasPermission(permissions, 'audit.read') ? (
            <a className="nav-item" href="#capabilities">
              Audit
            </a>
          ) : null}
          <a className="nav-item" href="#account">
            Account
          </a>
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
            <h1>{activeMembership.displayName}</h1>
          </div>
          <div className="workspace-role">{activeMembership.roleKey.replaceAll('_', ' ')}</div>
        </header>

        {!session.user.emailVerifiedAt ? (
          <section className="verification-strip" aria-label="Email verification required">
            <div>
              <strong>Verify your account email</strong>
              <p>
                Verification strengthens account trust and is required before sensitive workflows
                expand.
              </p>
            </div>
            <div className="verification-actions">
              {verificationMessage ? <span>{verificationMessage}</span> : null}
              <button
                className="compact-action"
                disabled={verificationPending}
                onClick={() => void sendVerification()}
                type="button"
              >
                {verificationPending ? 'Sending…' : 'Send verification link'}
              </button>
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="form-error workspace-error" role="alert">
            {error}
          </p>
        ) : null}

        <section className="workspace-intro">
          <p className="eyebrow">Phase 1 connected</p>
          <h2>Your authenticated workspace is live.</h2>
          <p>
            The active organization is resolved server-side on every switch. Navigation is derived
            from the current role permission bundle instead of client-side role conditionals.
          </p>
        </section>

        <section className="workspace-metrics" aria-label="Workspace foundation status">
          <article>
            <span>Identity</span>
            <strong>{session.user.emailVerifiedAt ? 'Verified' : 'Verification pending'}</strong>
            <small>HttpOnly session + CSRF protection</small>
          </article>
          <article>
            <span>Tenant</span>
            <strong>{activeMembership.slug}</strong>
            <small>Server-authorized workspace context</small>
          </article>
          <article>
            <span>Access</span>
            <strong>{permissions.length} permissions</strong>
            <small>Resolved from the active membership bundle</small>
          </article>
        </section>

        <section className="capability-panel" id="capabilities">
          <div>
            <p className="section-kicker">Permission-aware surface</p>
            <h2>Only tools available to this membership appear in navigation.</h2>
          </div>
          <div className="permission-list">
            {permissions.map((permission) => (
              <div key={permission}>
                <span>{permission}</span>
                <strong>Granted</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="account-panel" id="account">
          <div>
            <p className="section-kicker">Account</p>
            <h2>Identity and workspace context</h2>
          </div>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{session.user.primaryEmail}</dd>
            </div>
            <div>
              <dt>Email status</dt>
              <dd>{session.user.emailVerifiedAt ? 'Verified' : 'Pending verification'}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{activeMembership.roleKey.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt>Organization ID</dt>
              <dd>{activeMembership.organizationId}</dd>
            </div>
          </dl>
        </section>
      </section>
    </main>
  );
}

function hasPermission(permissions: readonly Permission[], permission: Permission): boolean {
  return permissions.includes(permission);
}
