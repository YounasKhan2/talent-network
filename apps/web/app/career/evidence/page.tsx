'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, getCandidatePassport, type CandidatePassportResponse } from '../../../lib/api';
import {
  deriveCandidateEvidence,
  summarizeCandidateEvidence,
  type CandidateEvidenceIndicator,
  type EvidenceLevel,
} from '../../../lib/candidate-evidence';
import styles from './evidence.module.css';

type LoadState = 'loading' | 'ready' | 'error';

type Profile = NonNullable<CandidatePassportResponse['currentProfileVersion']>;

export default function CareerEvidencePage() {
  const [state, setState] = useState<LoadState>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [filter, setFilter] = useState<EvidenceLevel | 'ALL'>('ALL');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const passport = await getCandidatePassport();
        if (!active) return;
        if (!passport.currentProfileVersion) {
          setError('Your Career Passport has no active professional profile version.');
          setState('error');
          return;
        }
        setProfile(passport.currentProfileVersion);
        setState('ready');
      } catch (caught) {
        if (!active) return;
        setError(readError(caught));
        setState('error');
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const indicators = useMemo(() => (profile ? deriveCandidateEvidence(profile) : []), [profile]);
  const summary = useMemo(() => summarizeCandidateEvidence(indicators), [indicators]);
  const visible =
    filter === 'ALL' ? indicators : indicators.filter((indicator) => indicator.level === filter);

  if (state === 'loading') return <EvidenceState title="Loading evidence indicators…" />;
  if (state === 'error' || !profile) {
    return <EvidenceState title="We could not load your evidence indicators." detail={error} />;
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Career Passport</p>
          <h1>Evidence indicators</h1>
          <p>
            Evidence indicators explain what is candidate-declared, what has supporting material,
            and what may be independently verified in future phases. A supporting link is not the
            same as Talent Network verification.
          </p>
        </div>
        <Link className={styles.backLink} href="/career">
          Back to Career Passport
        </Link>
      </header>

      <section className={styles.summary} aria-label="Evidence summary">
        <EvidenceMetric
          label="Total signals"
          value={summary.total}
          note="Current Passport version"
        />
        <EvidenceMetric
          label="Declared"
          value={summary.declared}
          note="Candidate-provided claims"
        />
        <EvidenceMetric
          label="Supported"
          value={summary.supported}
          note="Evidence link or credential attached"
        />
        <EvidenceMetric
          label="Verified"
          value={summary.verified}
          note="Independent verification not enabled yet"
        />
      </section>

      <section className={styles.policy}>
        <div>
          <strong>Evidence semantics</strong>
          <p>
            Matching must keep declared, supported, and verified evidence separate. Missing evidence
            is not negative evidence, and a candidate is never marked verified merely because a URL
            exists.
          </p>
        </div>
        <div className={styles.legend}>
          <EvidenceBadge level="DECLARED" />
          <EvidenceBadge level="SUPPORTED" />
          <EvidenceBadge level="VERIFIED" />
        </div>
      </section>

      <div className={styles.toolbar}>
        <div>
          <strong>{visible.length}</strong>
          <span> indicators shown</span>
        </div>
        <div className={styles.filters} aria-label="Filter evidence indicators">
          {(['ALL', 'DECLARED', 'SUPPORTED', 'VERIFIED'] as const).map((value) => (
            <button
              className={filter === value ? styles.filterActive : undefined}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {readable(value)}
            </button>
          ))}
        </div>
      </div>

      <section className={styles.list}>
        {visible.length ? (
          visible.map((indicator) => <EvidenceRow indicator={indicator} key={indicator.id} />)
        ) : (
          <div className={styles.empty}>No evidence indicators match this filter.</div>
        )}
      </section>

      <footer className={styles.footerNote}>
        <strong>Version {profile.versionNumber}</strong>
        <span>
          Indicators are derived from this Career Passport snapshot. They do not create another
          professional profile version.
        </span>
      </footer>
    </main>
  );
}

function EvidenceMetric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function EvidenceRow({ indicator }: { indicator: CandidateEvidenceIndicator }) {
  return (
    <article className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowHeading}>
          <span>{readable(indicator.subjectType)}</span>
          <EvidenceBadge level={indicator.level} />
        </div>
        <strong>{indicator.subjectLabel}</strong>
        <p>{indicator.explanation}</p>
      </div>
      <div className={styles.rowSource}>
        <span>Source</span>
        <strong>{readable(indicator.sourceType)}</strong>
        {indicator.sourceRef ? (
          <a href={indicator.sourceRef} rel="noreferrer" target="_blank">
            Open supporting evidence
          </a>
        ) : (
          <small>No external evidence link</small>
        )}
      </div>
    </article>
  );
}

function EvidenceBadge({ level }: { level: EvidenceLevel }) {
  return (
    <span className={`${styles.badge} ${styles[`badge${level}`]}`}>{readable(level)}</span>
  );
}

function EvidenceState({ title, detail }: { title: string; detail?: string | null }) {
  return (
    <main className={styles.state}>
      <p className="eyebrow">Talent Network</p>
      <h1>{title}</h1>
      {detail ? <p>{detail}</p> : null}
      <Link href="/career">Back to Career Passport</Link>
    </main>
  );
}

function readable(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readError(caught: unknown): string {
  if (caught instanceof ApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return 'Unable to load Career Passport evidence indicators.';
}
