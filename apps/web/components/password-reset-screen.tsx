'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError, confirmPasswordReset, requestPasswordReset } from '../lib/api';

export function PasswordResetRequestScreen() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Unable to request a reset right now.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AccountActionLayout
      kicker="Account recovery"
      title="Reset access without weakening account security."
      description="Enter your account email. If it exists, we will send a time-limited reset link."
    >
      {sent ? (
        <div className="action-success" role="status">
          <strong>Check your inbox.</strong>
          <p>If an account exists for that email, a reset link has been issued.</p>
          <Link className="text-action-link" href="/login">
            Return to sign in
          </Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>Email address</span>
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-action" disabled={pending} type="submit">
            {pending ? 'Sending…' : 'Send reset link'}
          </button>
          <Link className="text-action-link" href="/login">
            Back to sign in
          </Link>
        </form>
      )}
    </AccountActionLayout>
  );
}

export function PasswordResetConfirmScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is missing its token. Request a new password reset link.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    try {
      await confirmPasswordReset(token, password);
      router.replace('/login');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to reset your password.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AccountActionLayout
      kicker="Choose a new password"
      title="Create a fresh credential for your account."
      description="Reset links are single-use and expire. Successful reset signs out existing sessions."
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>New password</span>
          <input
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="12+ characters"
            required
          />
        </label>
        <label>
          <span>Confirm password</span>
          <input
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat password"
            required
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary-action" disabled={pending} type="submit">
          {pending ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </AccountActionLayout>
  );
}

function AccountActionLayout({
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
        <Link className="text-action-link" href="/login">
          Sign in
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
