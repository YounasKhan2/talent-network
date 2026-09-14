'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { WorkspaceContextSwitcher } from '../../components/workspace-context-switcher';
import { ApiError, getAccountContexts, type AccountContextResponse } from '../../lib/api';
import { rememberCareerContext } from '../../lib/workspace-preference';
import styles from './context-bar.module.css';

type GuardState = 'loading' | 'ready' | 'redirecting' | 'error';

const CAREER_NAVIGATION = [
  { href: '/career', label: 'Career Passport' },
  { href: '/career/evidence', label: 'Evidence' },
  { href: '/career/history', label: 'Version history' },
] as const;

export default function CareerWorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
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
  }, [pathname, router]);

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
    <div className={styles.workspace}>
      <aside className={styles.sidebar} aria-label="Candidate workspace navigation">
        <Link className={styles.brandMark} href="/career" aria-label="Talent Network Career">
          TN
        </Link>

        <div className={styles.workspaceLabel}>
          <span>Workspace</span>
          <strong>Career</strong>
        </div>

        <nav className={styles.navigation}>
          {CAREER_NAVIGATION.map((item) => {
            const active =
              item.href === '/career' ? pathname === '/career' : pathname.startsWith(item.href);

            return (
              <Link
                aria-current={active ? 'page' : undefined}
                className={active ? styles.navItemActive : styles.navItem}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <WorkspaceContextSwitcher activeContext={{ kind: 'career' }} contexts={contexts} />
        </div>
      </aside>

      <div className={styles.stage}>
        <header className={styles.workspaceTopbar}>
          <div>
            <p className={styles.topbarKicker}>Active workspace</p>
            <h1>Career</h1>
          </div>
          <div className={styles.workspaceRole}>{activePageLabel(pathname)}</div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}

function activePageLabel(pathname: string): string {
  if (pathname.startsWith('/career/evidence')) return 'Evidence';
  if (pathname.startsWith('/career/history')) return 'Version history';
  return 'Career Passport';
}
