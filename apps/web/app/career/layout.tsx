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
  {
    href: '/career',
    label: 'Career Passport',
    description: 'Your reusable professional identity',
  },
  {
    href: '/career/evidence',
    label: 'Evidence',
    description: 'Declared and supported signals',
  },
  {
    href: '/career/history',
    label: 'Version history',
    description: 'Read-only Passport snapshots',
  },
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
        <div className={styles.sidebarTop}>
          <Link className={styles.brand} href="/career" aria-label="Talent Network Career">
            <span className={styles.brandMark}>TN</span>
            <span>
              <strong>Talent Network</strong>
              <small>Personal workspace</small>
            </span>
          </Link>

          <div className={styles.navGroup}>
            <p className={styles.navLabel}>Career</p>
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
                    <span>{item.label}</span>
                    <small>{item.description}</small>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.nextModule}>
            <span>Next module</span>
            <strong>Resume Intelligence</strong>
            <small>Activates after Phase 2B closes.</small>
          </div>
          <WorkspaceContextSwitcher activeContext={{ kind: 'career' }} contexts={contexts} />
        </div>
      </aside>

      <div className={styles.stage}>
        <header className={styles.contextBar}>
          <div>
            <span>Candidate workspace</span>
            <strong>{activePageLabel(pathname)}</strong>
          </div>
          <span className={styles.privacyNote}>Private by default · candidate controlled</span>
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
