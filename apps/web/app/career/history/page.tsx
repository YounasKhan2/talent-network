'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError } from '../../../lib/api';
import {
  getCandidateProfileVersion,
  listCandidateProfileVersions,
  type CandidateProfileVersionSnapshot,
  type CandidateProfileVersionSummary,
} from '../../../lib/candidate-versions-api';
import styles from './version-history.module.css';

type LoadState = 'loading' | 'ready' | 'error';

export default function CareerVersionHistoryPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [versions, setVersions] = useState<CandidateProfileVersionSummary[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<CandidateProfileVersionSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await listCandidateProfileVersions();
        if (!active) return;
        setVersions(result.versions);
        const initial = result.versions.find((version) => version.isCurrent) ?? result.versions[0];
        if (!initial) {
          setState('ready');
          return;
        }
        setSelectedVersion(initial.versionNumber);
        setSnapshot(await getCandidateProfileVersion(initial.versionNumber));
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

  async function selectVersion(versionNumber: number) {
    if (versionNumber === selectedVersion || snapshotLoading) return;
    setSnapshotLoading(true);
    setError(null);
    try {
      const next = await getCandidateProfileVersion(versionNumber);
      setSelectedVersion(versionNumber);
      setSnapshot(next);
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setSnapshotLoading(false);
    }
  }

  if (state === 'loading') {
    return <HistoryState title="Loading Career Passport history…" />;
  }
  if (state === 'error') {
    return <HistoryState title="We could not load your Career Passport history." detail={error} />;
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Career Passport</p>
          <h1>Version history</h1>
          <p>
            Inspect the exact professional snapshot preserved at each point in time. Historical
            versions are read-only and never change when your current Passport evolves.
          </p>
        </div>
        <Link className={styles.backLink} href="/career">
          Back to Career Passport
        </Link>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.workspace}>
        <aside className={styles.timeline} aria-label="Career Passport versions">
          <div className={styles.timelineHeading}>
            <strong>{versions.length}</strong>
            <span>saved versions</span>
          </div>
          <div className={styles.versionList}>
            {versions.map((version) => (
              <button
                className={
                  selectedVersion === version.versionNumber
                    ? `${styles.versionButton} ${styles.versionButtonActive}`
                    : styles.versionButton
                }
                disabled={snapshotLoading}
                key={version.id}
                onClick={() => void selectVersion(version.versionNumber)}
                type="button"
              >
                <span className={styles.versionTopline}>
                  <strong>Version {version.versionNumber}</strong>
                  {version.isCurrent ? <em>Current</em> : null}
                </span>
                <span>{formatTimestamp(version.approvedAt ?? version.createdAt)}</span>
                <small>{formatSource(version.source)}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className={styles.snapshot} aria-live="polite">
          {snapshotLoading ? (
            <div className={styles.snapshotLoading}>Loading snapshot…</div>
          ) : snapshot ? (
            <SnapshotView snapshot={snapshot} />
          ) : (
            <div className={styles.empty}>No Career Passport versions are available yet.</div>
          )}
        </section>
      </div>
    </main>
  );
}

function SnapshotView({ snapshot }: { snapshot: CandidateProfileVersionSnapshot }) {
  return (
    <>
      <header className={styles.snapshotHeader}>
        <div>
          <div className={styles.snapshotEyebrow}>
            <span>Version {snapshot.versionNumber}</span>
            <span>{snapshot.isCurrent ? 'Current' : snapshot.status}</span>
            <span>{formatSource(snapshot.source)}</span>
          </div>
          <h2>{snapshot.headline || 'Untitled professional profile'}</h2>
          {snapshot.summary ? <p>{snapshot.summary}</p> : null}
        </div>
        <div className={styles.snapshotMeta}>
          <span>Saved</span>
          <strong>{formatTimestamp(snapshot.approvedAt ?? snapshot.createdAt)}</strong>
        </div>
      </header>

      <SnapshotSection title="Professional preferences">
        <DefinitionGrid
          items={[
            ['Availability', readable(snapshot.availabilityStatus)],
            ['Work modes', snapshot.preferredWorkModes.map(readable).join(', ') || 'Not specified'],
            [
              'Target compensation',
              snapshot.compensationTarget == null
                ? 'Not specified'
                : `${snapshot.compensationCurrency ?? ''} ${snapshot.compensationTarget.toLocaleString()} ${snapshot.compensationPeriod ?? ''}`.trim(),
            ],
            [
              'Employment types',
              snapshot.preferredEmploymentTypes.map(readable).join(', ') || 'Not specified',
            ],
          ]}
        />
      </SnapshotSection>

      <SnapshotSection title="Experience" empty={!snapshot.employments.length}>
        {snapshot.employments.map((item) => (
          <SnapshotRecord
            description={item.summary}
            key={item.id}
            meta={formatDateRange(item.startDate, item.endDate, item.isCurrent)}
            subtitle={[item.companyName, readable(item.employmentType), readable(item.workMode)]
              .filter(Boolean)
              .join(' · ')}
            title={item.title}
          />
        ))}
      </SnapshotSection>

      <SnapshotSection title="Education" empty={!snapshot.education.length}>
        {snapshot.education.map((item) => (
          <SnapshotRecord
            description={item.description}
            key={item.id}
            meta={formatDateRange(item.startDate, item.endDate, item.isCurrent)}
            subtitle={[item.institutionName, item.fieldOfStudy].filter(Boolean).join(' · ')}
            title={item.degree || 'Education'}
          />
        ))}
      </SnapshotSection>

      <SnapshotSection title="Skills" empty={!snapshot.skills.length}>
        <div className={styles.tags}>
          {snapshot.skills.map((skill) => (
            <span key={skill.id}>
              {skill.name}
              {skill.proficiency ? <small>{readable(skill.proficiency)}</small> : null}
            </span>
          ))}
        </div>
      </SnapshotSection>

      <SnapshotSection title="Projects" empty={!snapshot.projects.length}>
        {snapshot.projects.map((item) => (
          <SnapshotRecord
            description={item.description}
            href={item.url ?? item.repositoryUrl}
            key={item.id}
            meta={formatDateRange(item.startDate, item.endDate)}
            subtitle={item.role}
            title={item.name}
          />
        ))}
      </SnapshotSection>

      <SnapshotSection title="Certifications" empty={!snapshot.certifications.length}>
        {snapshot.certifications.map((item) => (
          <SnapshotRecord
            href={item.credentialUrl}
            key={item.id}
            meta={formatDateRange(item.issuedAt, item.expiresAt)}
            subtitle={item.issuer}
            title={item.name}
          />
        ))}
      </SnapshotSection>

      <SnapshotSection title="Languages" empty={!snapshot.languages.length}>
        {snapshot.languages.map((item) => (
          <SnapshotRecord
            key={item.id}
            subtitle={item.proficiency ? readable(item.proficiency) : null}
            title={item.name}
          />
        ))}
      </SnapshotSection>

      <SnapshotSection title="Professional links" empty={!snapshot.links.length}>
        {snapshot.links.map((item) => (
          <SnapshotRecord href={item.url} key={item.id} subtitle={readable(item.kind)} title={item.label} />
        ))}
      </SnapshotSection>

      <SnapshotSection title="Location preferences" empty={!snapshot.locationPreferences.length}>
        {snapshot.locationPreferences.map((item) => (
          <SnapshotRecord
            key={item.id}
            subtitle={item.remoteOnly ? 'Remote only' : [item.city, item.region, item.countryCode].filter(Boolean).join(', ')}
            title={item.label}
          />
        ))}
      </SnapshotSection>

      {snapshot.customSections.map((section) => (
        <SnapshotSection key={section.id} title={section.title} empty={!section.items.length}>
          {section.description ? <p className={styles.sectionDescription}>{section.description}</p> : null}
          {section.items.map((item) => (
            <SnapshotRecord
              description={item.description}
              href={item.url}
              key={item.id}
              meta={formatDateRange(item.startDate, item.endDate)}
              subtitle={item.subtitle}
              title={item.title}
            />
          ))}
        </SnapshotSection>
      ))}
    </>
  );
}

function SnapshotSection({
  title,
  empty = false,
  children,
}: {
  title: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      {empty ? <p className={styles.emptySection}>No information in this version.</p> : children}
    </section>
  );
}

function SnapshotRecord({
  title,
  subtitle,
  meta,
  description,
  href,
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  description?: string | null;
  href?: string | null;
}) {
  return (
    <article className={styles.record}>
      <div>
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      {meta ? <small>{meta}</small> : null}
      {description ? <p>{description}</p> : null}
      {href ? (
        <a href={href} rel="noreferrer" target="_blank">
          Open evidence link
        </a>
      ) : null}
    </article>
  );
}

function DefinitionGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <dl className={styles.definitionGrid}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function HistoryState({ title, detail }: { title: string; detail?: string | null }) {
  return (
    <main className={styles.state}>
      <p className="eyebrow">Talent Network</p>
      <h1>{title}</h1>
      {detail ? <p>{detail}</p> : null}
    </main>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDateRange(start: string | null, end: string | null, current = false): string | null {
  if (!start && !end && !current) return null;
  const startLabel = start ? formatMonth(start) : 'Start not specified';
  const endLabel = current ? 'Present' : end ? formatMonth(end) : 'End not specified';
  return `${startLabel} — ${endLabel}`;
}

function formatMonth(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatSource(value: string): string {
  if (value === 'RESUME_IMPORT') return 'Resume import';
  if (value === 'SYSTEM') return 'System-created';
  return 'Manual edit';
}

function readable(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readError(caught: unknown): string {
  if (caught instanceof ApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return 'Unable to load Career Passport version history.';
}
