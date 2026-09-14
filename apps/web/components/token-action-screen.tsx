'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ApiError,
  acceptOrganizationInvitation,
  confirmEmailVerification,
  getSession,
} from '../lib/api';

type TokenState = 'idle' | 'checking' | 'ready' | 'success' | 'error' | 'auth-required';

export function EmailVerificationScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<TokenState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function verify() {
    if (!token) {
      setState('error');
      setMessage('This verification link is missing its token. Request a new verification email.');
      return;
    }

    setState('checking');
    setMessage(null);
    try {
      await confirmEmailVerification(token);
      setState('success');
      setMessage('Your email is verified. You can return to your workspace.');
    } catch (caught) {
      setState('error');
      setMessage(caught instanceof ApiError ? caught.message : 'Unable to verify this email link.');
    }
  }

  return (
    <TokenActionLayout
      kicker="Email verification"
      title="Confirm the email behind your professional identity."
      description="Verification links are one-time credentials. Talent Network never stores the raw link token."
    >
      <div className="token-action-stack">
        <p className="token-action-note">
          {message ?? 'Use the verification link issued to your email address.'}
        </p>
        {state !== 'success' ? (
          <button
            className="primary-action"
            disabled={state === 'checking'}
            onClick={() => void verify()}
            type="button"
          >
            {state === 'checking' ? 'Verifying…' : 'Verify email'}
          </button>
        ) : (
          <button
            className="primary-action"
            onClick={() => {
              router.replace('/app');
              router.refresh();
            }}
            type="button"
          >
            Return to workspace
          </button>
        )}
      </div>
    </TokenActionLayout>
  );
}

export function InvitationAcceptanceScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<TokenState>('checking');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void getSession()
      .then(() => {
        if (!active) return;
        setState('ready');
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          setState('auth-required');
          return;
        }
        setState('error');
        setMessage(caught instanceof Error ? caught.message : 'Unable to load your account.');
      });

    return () => {
      active = false;
    };
  }, []);

  const returnPath = token ? `/invite?token=${encodeURIComponent(token)}` : '/invite';

  async function accept() {
    if (!token) {
      setState('error');
      setMessage('This invitation link is missing its token. Ask the organization to send a new invite.');
      return;
    }

    setState('checking');
    setMessage(null);
    try {
      await acceptOrganizationInvitation(token);
      setState('success');
      setMessage('Invitation accepted. Your organization membership is now active.');
    } catch (caught) {
      setState('error');
      setMessage(caught instanceof ApiError ? caught.message : 'Unable to accept this invitation.');
    }
  }

  return (
    <TokenActionLayout
      kicker="Organization invitation"
      title="Join the hiring workspace you were invited to."
      description="Invitation acceptance is tied to the signed-in account email and establishes a tenant-scoped membership."
    >
      {state === 'auth-required' ? (
        <div className="token-action-stack">
          <p className="token-action-note">Sign in or create an account with the invited email first.</p>
          <Link
            className="primary-link"
            href={{ pathname: '/login', query: { next: returnPath } }}
          >
            Sign in to continue
          </Link>
          <Link
            className="secondary-link"
            href={{ pathname: '/signup', query: { next: returnPath } }}
          >
            Create account
          </Link>
        </div>
      ) : state === 'success' ? (
        <div className="token-action-stack">
          <p className="token-action-note">{message}</p>
          <button
            className="primary-action"
            onClick={() => {
              router.replace('/app');
              router.refresh();
            }}
            type="button"
          >
            Open workspace
          </button>
        </div>
      ) : (
        <div className="token-action-stack">
          <p className="token-action-note">
            {message ??
              (state === 'checking'
                ? 'Checking your account…'
                : 'Your account is ready to accept this organization invitation.')}
          </p>
          <button
            className="primary-action"
            disabled={state === 'checking'}
            onClick={() => void accept()}
            type="button"
          >
            {state === 'checking' ? 'Working…' : 'Accept invitation'}
          </button>
        </div>
      )}
    </TokenActionLayout>
  );
}

function TokenActionLayout({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="account-action-shell">
      <header className="account-action-header">
        <Link className="brand-mark" href="/">
          TN
        </Link>
        <Link className="text-action-link" href="/app">
          Workspace
        </Link>
      </header>
      <section className="account-action-grid">
        <div className="account-action-copy">
          <p className="eyebrow">Talent Network</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="account-action-form">
          <p className="section-kicker">{kicker}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
