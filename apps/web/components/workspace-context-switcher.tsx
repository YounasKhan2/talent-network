'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { AccountContextResponse } from '../lib/api';
import { rememberCareerContext, rememberOrganizationContext } from '../lib/workspace-preference';
import styles from './workspace-context-switcher.module.css';

type ActiveContext =
  { kind: 'career' } | { kind: 'organization'; organizationId: string } | { kind: 'hiring-setup' };

export function WorkspaceContextSwitcher({
  contexts,
  activeContext,
}: {
  contexts: AccountContextResponse;
  activeContext: ActiveContext;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const activeOrganization =
    activeContext.kind === 'organization'
      ? contexts.organizations.find(
          (organization) => organization.organizationId === activeContext.organizationId,
        )
      : null;

  const activeLabel =
    activeContext.kind === 'career'
      ? 'Personal · Career'
      : activeOrganization
        ? activeOrganization.displayName
        : 'Hiring setup';

  function openCareer() {
    setOpen(false);
    if (contexts.career.available) rememberCareerContext();
    router.push(contexts.career.available ? '/career' : '/onboarding?intent=career');
  }

  function openOrganization(organizationId: string) {
    setOpen(false);
    rememberOrganizationContext(organizationId);

    if (activeContext.kind === 'organization' && activeContext.organizationId === organizationId) {
      return;
    }

    window.location.assign('/app');
  }

  function openHiringSetup() {
    setOpen(false);
    router.push('/onboarding?intent=hire');
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className={styles.triggerCopy}>
          <span className={styles.triggerLabel}>Active context</span>
          <strong>{activeLabel}</strong>
        </span>
        <span aria-hidden="true" className={styles.chevron}>
          {open ? '↑' : '↓'}
        </span>
      </button>

      {open ? (
        <div aria-label="Switch workspace context" className={styles.menu} role="menu">
          <div className={styles.account}>
            <span>Signed in as</span>
            <strong>{contexts.user.primaryEmail}</strong>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionLabel}>Personal</p>
            <button className={styles.option} onClick={openCareer} role="menuitem" type="button">
              <span>
                <strong>Career</strong>
                <small>
                  {contexts.career.available
                    ? 'Your private professional workspace'
                    : 'Create your Career Passport'}
                </small>
              </span>
              {activeContext.kind === 'career' ? (
                <span className={styles.active}>Current</span>
              ) : null}
            </button>
          </div>

          <div className={styles.section}>
            <p className={styles.sectionLabel}>Organizations</p>
            {contexts.organizations.map((organization) => {
              const isActive =
                activeContext.kind === 'organization' &&
                activeContext.organizationId === organization.organizationId;

              return (
                <button
                  className={styles.option}
                  key={organization.organizationId}
                  onClick={() => openOrganization(organization.organizationId)}
                  role="menuitem"
                  type="button"
                >
                  <span>
                    <strong>{organization.displayName}</strong>
                    <small>{formatRole(organization.roleKey)}</small>
                  </span>
                  {isActive ? <span className={styles.active}>Current</span> : null}
                </button>
              );
            })}

            {contexts.organizations.length === 0 ? (
              <p className={styles.empty}>You have not joined an organization yet.</p>
            ) : null}
          </div>

          <div className={styles.footer}>
            <button
              className={styles.footerAction}
              onClick={openHiringSetup}
              role="menuitem"
              type="button"
            >
              + Create or join organization
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatRole(roleKey: string): string {
  return roleKey
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
