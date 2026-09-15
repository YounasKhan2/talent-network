'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../lib/api';
import {
  getCandidateResumeReview,
  listCandidateResumes,
  type CandidateResumeListItem,
  type CandidateResumeReviewResponse,
  type ParsedClaim,
  type ParsedResumeProposal,
} from '../../../lib/resume-review-api';
import styles from './resume-workspace.module.css';

type LoadState = 'loading' | 'ready' | 'error';

export default function CareerResumesPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [resumes, setResumes] = useState<CandidateResumeListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<CandidateResumeReviewResponse | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const rows = await listCandidateResumes();
        if (!active) return;
        setResumes(rows);
        setState('ready');
        if (rows[0]) setSelectedId(rows[0].id);
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

  useEffect(() => {
    if (!selectedId) {
      setReview(null);
      return;
    }

    let active = true;
    setReviewLoading(true);
    setError(null);
    void getCandidateResumeReview(selectedId)
      .then((result) => {
        if (active) setReview(result);
      })
      .catch((caught) => {
        if (active) setError(readError(caught));
      })
      .finally(() => {
        if (active) setReviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  if (state === 'loading') return <WorkspaceState title="Loading your resumes…" />;
  if (state === 'error') {
    return <WorkspaceState title="We could not load your resume workspace." detail={error} />;
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Resume intelligence</p>
          <h1>Resume review</h1>
          <p>
            Resume parsing creates a private proposal. Nothing here changes your Career Passport
            until you explicitly review and approve it.
          </p>
        </div>
        <div className={styles.phaseBadge}>Phase 3F · Review</div>
      </header>

      {resumes.length === 0 ? (
        <section className={styles.emptyState}>
          <strong>No resumes yet</strong>
          <p>
            Resume upload UI is the next part of this workspace. The backend upload pipeline is
            already available and remains candidate-private.
          </p>
        </section>
      ) : (
        <div className={styles.workspaceGrid}>
          <aside className={styles.resumeList} aria-label="Candidate resumes">
            <div className={styles.listHeading}>
              <span>Your resumes</span>
              <strong>{resumes.length}</strong>
            </div>
            {resumes.map((resume) => (
              <button
                className={resume.id === selectedId ? styles.resumeCardActive : styles.resumeCard}
                key={resume.id}
                onClick={() => setSelectedId(resume.id)}
                type="button"
              >
                <span>{resume.title}</span>
                <strong>{resume.currentVersion?.originalFilename ?? 'No current version'}</strong>
                <small>{readableState(resume.currentVersion?.processingState ?? 'UNKNOWN')}</small>
              </button>
            ))}
          </aside>

          <section className={styles.reviewPane}>
            {reviewLoading ? (
              <WorkspaceState title="Loading review proposal…" compact />
            ) : review ? (
              <ReviewPanel review={review} />
            ) : (
              <WorkspaceState
                title="Select a resume to review."
                detail={error ?? 'Choose a resume from the list.'}
                compact
              />
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function ReviewPanel({ review }: { review: CandidateResumeReviewResponse }) {
  const parsed = review.proposal?.parsedJson ?? null;
  const confidence = parsed?.confidenceSummary;
  const profile = review.passport.currentProfileVersion;
  const counts = useMemo(() => summarizeProposal(parsed), [parsed]);

  return (
    <>
      <div className={styles.reviewHeader}>
        <div>
          <span className={styles.kicker}>Current resume</span>
          <h2>{review.resume.title}</h2>
          <p>{review.version?.originalFilename ?? 'No uploaded file metadata available.'}</p>
        </div>
        <StatusPill state={review.version?.processingState ?? 'UNKNOWN'} />
      </div>

      <section className={styles.metrics} aria-label="Resume review summary">
        <Metric label="Claims" value={confidence?.totalClaimCount ?? 0} />
        <Metric
          label="Low confidence"
          value={confidence?.lowConfidenceClaimCount ?? 0}
        />
        <Metric
          label="Overall confidence"
          value={confidence ? `${Math.round(confidence.overall * 100)}%` : '—'}
        />
        <Metric label="Parser" value={review.proposal?.parserName ?? 'Pending'} />
      </section>

      {!review.review.available ? (
        <section className={styles.notice}>
          <strong>Review is not available yet.</strong>
          <p>{readBlockingReason(review.review.blockingReason)}</p>
        </section>
      ) : null}

      {parsed ? (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.kicker}>Sensitive identity</span>
                <h3>Contact details</h3>
              </div>
              <small>Private to your Career workspace</small>
            </div>
            <div className={styles.claimGrid}>
              <ClaimCard label="Full name" claim={parsed.identityCandidate?.fullName} />
              <ClaimCard label="Email" claim={parsed.identityCandidate?.email} sensitive />
              <ClaimCard label="Phone" claim={parsed.identityCandidate?.phone} sensitive />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.kicker}>Proposal vs authority</span>
                <h3>Career Passport comparison</h3>
              </div>
              <small>Read-only in 3F-A</small>
            </div>
            <div className={styles.compareGrid}>
              <CompareCard
                label="Headline"
                proposed={claimValue(parsed.headline)}
                current={profile?.headline ?? null}
              />
              <CompareCard
                label="Summary"
                proposed={claimValue(parsed.summary)}
                current={profile?.summary ?? null}
              />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.kicker}>Structured proposal</span>
                <h3>Detected sections</h3>
              </div>
              <small>Evidence-linked parser output</small>
            </div>
            <div className={styles.sectionCounts}>
              {counts.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.reviewActions}>
            <div>
              <strong>Candidate approval is required</strong>
              <p>
                Accept / Edit / Ignore controls are intentionally disabled until the mutation and
                traceability contract is implemented in the next 3F slice.
              </p>
            </div>
            <div className={styles.actionButtons}>
              <button disabled type="button">
                Ignore
              </button>
              <button disabled type="button">
                Edit proposal
              </button>
              <button disabled type="button">
                Accept changes
              </button>
            </div>
          </section>
        </>
      ) : (
        <section className={styles.notice}>
          <strong>No completed proposal is available.</strong>
          <p>The resume can appear here while processing is still in progress.</p>
        </section>
      )}
    </>
  );
}

function ClaimCard({
  label,
  claim,
  sensitive = false,
}: {
  label: string;
  claim?: ParsedClaim<string>;
  sensitive?: boolean;
}) {
  return (
    <article className={styles.claimCard}>
      <div>
        <span>{label}</span>
        {sensitive ? <small>Sensitive</small> : null}
      </div>
      <strong>{claim?.value ?? 'Not detected'}</strong>
      {claim ? (
        <footer>
          <span>{Math.round(claim.confidence * 100)}% confidence</span>
          <span>{claim.evidence.length} evidence ref{claim.evidence.length === 1 ? '' : 's'}</span>
        </footer>
      ) : null}
    </article>
  );
}

function CompareCard({
  label,
  proposed,
  current,
}: {
  label: string;
  proposed: string | null;
  current: string | null;
}) {
  const changed = Boolean(proposed && proposed !== current);
  return (
    <article className={styles.compareCard}>
      <div className={styles.compareTitle}>
        <strong>{label}</strong>
        <span>{changed ? 'Proposed change' : 'No proposed change'}</span>
      </div>
      <div>
        <span>Current Passport</span>
        <p>{current || 'Not set'}</p>
      </div>
      <div>
        <span>Resume proposal</span>
        <p>{proposed || 'Not detected'}</p>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusPill({ state }: { state: string }) {
  return <span className={styles.statusPill}>{readableState(state)}</span>;
}

function WorkspaceState({
  title,
  detail,
  compact = false,
}: {
  title: string;
  detail?: string | null;
  compact?: boolean;
}) {
  return (
    <section className={compact ? styles.compactState : styles.state}>
      <p className="eyebrow">Talent Network</p>
      <h1>{title}</h1>
      {detail ? <p>{detail}</p> : null}
    </section>
  );
}

function summarizeProposal(parsed: ParsedResumeProposal | null) {
  if (!parsed) return [];
  return [
    { label: 'Experience', value: parsed.experiences.length },
    { label: 'Education', value: parsed.education.length },
    { label: 'Skills', value: parsed.skills.length },
    { label: 'Projects', value: parsed.projects.length },
    { label: 'Certifications', value: parsed.certifications.length },
    { label: 'Languages', value: parsed.languages.length },
    { label: 'Links', value: parsed.links.length },
    { label: 'Locations', value: parsed.locations.length },
  ];
}

function claimValue(claim?: ParsedClaim<string>): string | null {
  return claim?.value ?? null;
}

function readableState(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readBlockingReason(reason: string | null): string {
  switch (reason) {
    case 'PROCESSING_FAILED_TERMINAL':
      return 'Processing failed and this resume needs attention before it can be reviewed.';
    case 'RESUME_REJECTED':
      return 'This resume was rejected during processing.';
    case 'REVIEW_ALREADY_APPROVED':
      return 'This resume review has already been approved.';
    case 'PARSE_PROPOSAL_NOT_AVAILABLE':
      return 'The resume reached review state, but its completed proposal is unavailable.';
    case 'PROCESSING_IN_PROGRESS':
      return 'Processing is still in progress. The proposal will become available when parsing completes.';
    default:
      return 'A completed review proposal is not available yet.';
  }
}

function readError(caught: unknown): string {
  if (caught instanceof ApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return 'Unable to load resume review data.';
}
