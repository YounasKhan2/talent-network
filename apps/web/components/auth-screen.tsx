'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError, login, signup } from '../lib/api';
import { getWorkspaceContextState, resolveWorkspaceLanding } from '../lib/workspace-context';

type Mode = 'login' | 'signup';

export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';
  const nextPath = safeInternalPath(searchParams.get('next'));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const session = isSignup ? await signup(email, password) : await login(email, password);
      if (nextPath) {
        router.replace(nextPath as Route);
      } else {
        const context = await getWorkspaceContextState(session);
        router.replace(resolveWorkspaceLanding(context));
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }

  const switchHref = {
    pathname: isSignup ? '/login' : '/signup',
    ...(nextPath ? { query: { next: nextPath } } : {}),
  } as const;

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <Link className="brand-mark" href="/">
          TN
        </Link>
        <div className="auth-brand-copy">
          <p className="eyebrow">Talent Network</p>
          <h1>
            {isSignup
              ? 'Build one career identity. Reuse it everywhere.'
              : 'Return to your hiring network.'}
          </h1>
          <p>
            Structured signal for candidates. High-confidence context for hiring teams. No
            application spam, opaque scoring, or generic dashboard noise.
          </p>
        </div>
        <p className="auth-footnote">
          Editorial precision. Operational density. Human-controlled AI.
        </p>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-form-heading">
            <p className="section-kicker">{isSignup ? 'Create account' : 'Sign in'}</p>
            <h2>{isSignup ? 'Start your Talent Network profile' : 'Welcome back'}</h2>
            <p>
              {isSignup
                ? 'Use the email you want tied to your professional identity.'
                : 'Use the email attached to your Talent Network account.'}
            </p>
          </div>

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

            <label>
              <span>Password</span>
              <input
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={12}
                maxLength={128}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="12+ characters"
                required
              />
            </label>

            {!isSignup ? (
              <div className="form-helper-row">
                <span />
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
            ) : null}

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button className="primary-action" disabled={pending} type="submit">
              {pending ? 'Working…' : isSignup ? 'Create account' : 'Continue'}
            </button>
          </form>

          <div className="auth-switch-row">
            <span>{isSignup ? 'Already have an account?' : 'New to Talent Network?'}</span>
            <Link href={switchHref}>{isSignup ? 'Sign in' : 'Create account'}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function safeInternalPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}
