'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../lib/api';
import {
  ALLOWED_RESUME_UPLOAD_TYPES,
  MAX_RESUME_UPLOAD_BYTES,
  authorizeCandidateResumeUpload,
  completeCandidateResumeUpload,
  decideCandidateResumeReview,
  getCandidateResumeReview,
  listCandidateResumes,
  putCandidateResumeFile,
  type CandidateResumeListItem,
  type CandidateResumeReviewResponse,
  type ParsedClaim,
  type ParsedResumeProposal,
  type ResumeReviewDecisionRequest,
} from '../../../lib/resume-review-api';
import styles from './resume-workspace.module.css';

type LoadState = 'loading' | 'ready' | 'error';
type UploadState =
  'idle' | 'authorizing' | 'uploading' | 'finalizing' | 'processing' | 'complete' | 'error';
type DecisionState = 'idle' | 'submitting' | 'success' | 'error';

const ACTIVE_PROCESSING_STATES = new Set([
  'UPLOADED',
  'SCANNING',
  'SCANNED',
  'EXTRACTING',
  'OCR_REQUIRED',
  'OCR_RUNNING',
  'PARSING',
  'FAILED_RETRYABLE',
]);

export default function CareerResumesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [resumes, setResumes] = useState<CandidateResumeListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<CandidateResumeReviewResponse | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadFilename, setUploadFilename] = useState<string | null>(null);

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

  const selectedResume = resumes.find((resume) => resume.id === selectedId) ?? null;
  const selectedProcessingState = selectedResume?.currentVersion?.processingState ?? null;

  useEffect(() => {
    if (
      !selectedId ||
      !selectedProcessingState ||
      !ACTIVE_PROCESSING_STATES.has(selectedProcessingState)
    ) {
      return;
    }

    let active = true;
    const timer = window.setInterval(() => {
      void Promise.all([listCandidateResumes(), getCandidateResumeReview(selectedId)])
        .then(([rows, nextReview]) => {
          if (!active) return;
          setResumes(rows);
          setReview(nextReview);
          if (nextReview.review.available) setUploadState('complete');
        })
        .catch((caught) => {
          if (active) setError(readError(caught));
        });
    }, 2500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedId, selectedProcessingState]);

  async function handleSelectedFile(file: File | undefined) {
    if (!file) return;

    setUploadError(null);
    setUploadFilename(file.name);

    if (
      !ALLOWED_RESUME_UPLOAD_TYPES.includes(
        file.type as (typeof ALLOWED_RESUME_UPLOAD_TYPES)[number],
      )
    ) {
      setUploadState('error');
      setUploadError('Upload a PDF or DOCX resume.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_RESUME_UPLOAD_BYTES) {
      setUploadState('error');
      setUploadError('Resume files must be larger than 0 bytes and no more than 10 MB.');
      return;
    }

    try {
      setUploadState('authorizing');
      const authorization = await authorizeCandidateResumeUpload({
        title: titleFromFilename(file.name),
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });

      setUploadState('uploading');
      await putCandidateResumeFile(authorization, file);

      setUploadState('finalizing');
      await completeCandidateResumeUpload(authorization.resumeVersionId);

      const rows = await listCandidateResumes();
      setResumes(rows);
      setSelectedId(authorization.resumeId);
      setUploadState('processing');
    } catch (caught) {
      setUploadState('error');
      setUploadError(readError(caught));
    }
  }

  async function handleReviewUpdated(nextReview: CandidateResumeReviewResponse) {
    setReview(nextReview);
    const rows = await listCandidateResumes();
    setResumes(rows);
  }

  const uploadBusy = ['authorizing', 'uploading', 'finalizing'].includes(uploadState);

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
            Upload a private resume, follow its processing status, then review detected career data
            before anything can change your Career Passport.
          </p>
        </div>
        <div className={styles.phaseBadge}>Phase 3F · Review</div>
      </header>

      <section className={styles.uploadPanel} aria-label="Upload resume">
        <div>
          <span className={styles.kicker}>Private import</span>
          <h2>Upload a resume</h2>
          <p>
            PDF or DOCX, up to 10 MB. The original file stays in private object storage and is never
            exposed to organization workspaces.
          </p>
          {uploadFilename ? <small>Selected: {uploadFilename}</small> : null}
        </div>
        <div className={styles.uploadControls}>
          <input
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-label="Choose resume file"
            className={styles.fileInput}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              void handleSelectedFile(file);
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className={styles.uploadButton}
            disabled={uploadBusy}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {uploadBusy ? uploadStateLabel(uploadState) : 'Upload resume'}
          </button>
          <UploadProgress state={uploadState} error={uploadError} />
        </div>
      </section>

      {resumes.length === 0 ? (
        <section className={styles.emptyState}>
          <strong>No resumes yet</strong>
          <p>
            Upload your first resume above. It will appear here as soon as the private upload
            completes.
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
              <ReviewPanel review={review} onUpdated={handleReviewUpdated} />
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

function UploadProgress({ state, error }: { state: UploadState; error: string | null }) {
  if (state === 'idle')
    return <small className={styles.uploadHint}>Nothing changes your Passport on upload.</small>;
  if (state === 'error')
    return <small className={styles.uploadError}>{error ?? 'Upload failed.'}</small>;
  if (state === 'complete')
    return <small className={styles.uploadSuccess}>Ready for candidate review.</small>;
  if (state === 'processing') {
    return (
      <small className={styles.uploadProgress}>Uploaded. Secure processing is in progress…</small>
    );
  }
  return <small className={styles.uploadProgress}>{uploadStateLabel(state)}</small>;
}

function ReviewPanel({
  review,
  onUpdated,
}: {
  review: CandidateResumeReviewResponse;
  onUpdated: (review: CandidateResumeReviewResponse) => Promise<void>;
}) {
  const parsed = review.proposal?.parsedJson ?? null;
  const confidence = parsed?.confidenceSummary;
  const profile = review.passport.currentProfileVersion;
  const counts = useMemo(() => summarizeProposal(parsed), [parsed]);
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [decisionState, setDecisionState] = useState<DecisionState>('idle');
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    setEditing(false);
    setDecisionState('idle');
    setDecisionError(null);
    setHeadline(claimValue(parsed?.headline) ?? profile?.headline ?? '');
    setSummary(claimValue(parsed?.summary) ?? profile?.summary ?? '');
  }, [review.resume.id, review.review.record?.decision, parsed, profile]);

  const finalDecision = review.review.record?.decision ?? null;
  const canDecide = review.review.available && finalDecision === null;

  async function submitDecision(input: ResumeReviewDecisionRequest) {
    setDecisionState('submitting');
    setDecisionError(null);
    try {
      const nextReview = await decideCandidateResumeReview(review.resume.id, input);
      await onUpdated(nextReview);
      setEditing(false);
      setDecisionState('success');
    } catch (caught) {
      setDecisionError(readError(caught));
      setDecisionState('error');
    }
  }

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

      <ProcessingTimeline state={review.version?.processingState ?? 'UNKNOWN'} />

      <section className={styles.metrics} aria-label="Resume review summary">
        <Metric label="Claims" value={confidence?.totalClaimCount ?? 0} />
        <Metric label="Low confidence" value={confidence?.lowConfidenceClaimCount ?? 0} />
        <Metric
          label="Overall confidence"
          value={confidence ? `${Math.round(confidence.overall * 100)}%` : '—'}
        />
        <Metric label="Parser" value={review.proposal?.parserName ?? 'Pending'} />
      </section>

      {!review.review.available && !finalDecision ? (
        <section className={styles.notice}>
          <strong>Review is not available yet.</strong>
          <p>{readBlockingReason(review.review.blockingReason)}</p>
        </section>
      ) : null}

      {finalDecision ? <ReviewDecisionNotice review={review} decision={finalDecision} /> : null}

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
            <p className={styles.identityNote}>
              Contact claims are review evidence only. Accepting a resume does not silently change
              your login email or account identity.
            </p>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.kicker}>Proposal vs authority</span>
                <h3>Career Passport comparison</h3>
              </div>
              <small>Candidate-controlled import</small>
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

          {editing ? (
            <section className={styles.editPanel}>
              <div>
                <span className={styles.kicker}>Edit before import</span>
                <h3>Review Passport values</h3>
                <p>
                  These edits are stored with the review decision and become part of the new
                  RESUME_IMPORT Passport version.
                </p>
              </div>
              <label>
                <span>Headline</span>
                <input
                  maxLength={180}
                  onChange={(event) => setHeadline(event.currentTarget.value)}
                  value={headline}
                />
              </label>
              <label>
                <span>Summary</span>
                <textarea
                  maxLength={4000}
                  onChange={(event) => setSummary(event.currentTarget.value)}
                  rows={6}
                  value={summary}
                />
              </label>
            </section>
          ) : null}

          <section className={styles.reviewActions}>
            <div>
              <strong>{finalDecision ? 'Review completed' : 'Candidate approval is required'}</strong>
              <p>
                {finalDecision
                  ? readDecisionSummary(finalDecision)
                  : 'Accept imports detected career data, Edit lets you adjust reviewable values first, and Ignore leaves your Career Passport unchanged.'}
              </p>
              {decisionError ? <small className={styles.actionError}>{decisionError}</small> : null}
            </div>
            {!finalDecision ? (
              <div className={styles.actionButtons}>
                <button
                  disabled={!canDecide || decisionState === 'submitting'}
                  onClick={() => {
                    if (window.confirm('Ignore this resume proposal without changing your Career Passport?')) {
                      void submitDecision({ decision: 'IGNORE' });
                    }
                  }}
                  type="button"
                >
                  Ignore
                </button>
                {editing ? (
                  <>
                    <button
                      disabled={decisionState === 'submitting'}
                      onClick={() => setEditing(false)}
                      type="button"
                    >
                      Cancel edit
                    </button>
                    <button
                      className={styles.primaryAction}
                      disabled={decisionState === 'submitting'}
                      onClick={() =>
                        void submitDecision({
                          decision: 'EDIT',
                          edits: {
                            headline: headline.trim() || null,
                            summary: summary.trim() || null,
                          },
                        })
                      }
                      type="button"
                    >
                      {decisionState === 'submitting' ? 'Applying…' : 'Apply edited proposal'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      disabled={!canDecide || decisionState === 'submitting'}
                      onClick={() => setEditing(true)}
                      type="button"
                    >
                      Edit proposal
                    </button>
                    <button
                      className={styles.primaryAction}
                      disabled={!canDecide || decisionState === 'submitting'}
                      onClick={() => void submitDecision({ decision: 'ACCEPT' })}
                      type="button"
                    >
                      {decisionState === 'submitting' ? 'Applying…' : 'Accept changes'}
                    </button>
                  </>
                )}
              </div>
            ) : null}
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

function ReviewDecisionNotice({
  review,
  decision,
}: {
  review: CandidateResumeReviewResponse;
  decision: 'PENDING' | 'ACCEPTED' | 'EDITED' | 'IGNORED';
}) {
  return (
    <section className={styles.decisionNotice}>
      <div>
        <span className={styles.kicker}>Review decision</span>
        <strong>{readableState(decision)}</strong>
      </div>
      <p>{readDecisionSummary(decision)}</p>
      {review.review.record?.appliedProfileVersionId ? (
        <small>Passport version: {review.review.record.appliedProfileVersionId}</small>
      ) : null}
    </section>
  );
}

function ProcessingTimeline({ state }: { state: string }) {
  const stages = [
    { label: 'Uploaded', complete: hasReachedProcessingStage(state, 0) },
    { label: 'Security', complete: hasReachedProcessingStage(state, 1) },
    { label: 'Extracted', complete: hasReachedProcessingStage(state, 2) },
    { label: 'Parsed', complete: hasReachedProcessingStage(state, 3) },
    { label: 'Review', complete: hasReachedProcessingStage(state, 4) },
  ];

  return (
    <section className={styles.processingTimeline} aria-label="Resume processing progress">
      {stages.map((stage) => (
        <div
          className={stage.complete ? styles.processingStepComplete : styles.processingStep}
          key={stage.label}
        >
          <span aria-hidden="true" />
          <small>{stage.label}</small>
        </div>
      ))}
    </section>
  );
}

function ClaimCard({
  label,
  claim,
  sensitive = false,
}: {
  label: string;
  claim: ParsedClaim<string> | undefined;
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
          <span>
            {claim.evidence.length} evidence ref{claim.evidence.length === 1 ? '' : 's'}
          </span>
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

function titleFromFilename(filename: string): string {
  return filename.replace(/\.(pdf|docx)$/i, '').trim() || 'Imported resume';
}

function uploadStateLabel(state: UploadState): string {
  switch (state) {
    case 'authorizing':
      return 'Preparing secure upload…';
    case 'uploading':
      return 'Uploading privately…';
    case 'finalizing':
      return 'Verifying upload…';
    case 'processing':
      return 'Processing resume…';
    case 'complete':
      return 'Ready for review';
    default:
      return 'Upload resume';
  }
}

function hasReachedProcessingStage(state: string, stage: number): boolean {
  const rank: Record<string, number> = {
    UPLOADING: -1,
    UPLOADED: 0,
    SCANNING: 0,
    SCANNED: 1,
    EXTRACTING: 1,
    OCR_REQUIRED: 1,
    OCR_RUNNING: 1,
    PARSING: 2,
    READY_FOR_REVIEW: 4,
    APPROVED: 4,
    REJECTED: 4,
  };
  return (rank[state] ?? -1) >= stage;
}

function readableState(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readDecisionSummary(decision: string): string {
  switch (decision) {
    case 'ACCEPTED':
      return 'The grounded resume proposal was merged into a new RESUME_IMPORT Career Passport version.';
    case 'EDITED':
      return 'Your reviewed edits and grounded resume proposal were applied to a new RESUME_IMPORT Career Passport version.';
    case 'IGNORED':
      return 'This proposal was ignored. Your Career Passport was not changed.';
    default:
      return 'This review has not been finalized yet.';
  }
}

function readBlockingReason(reason: string | null): string {
  switch (reason) {
    case 'PROCESSING_FAILED_TERMINAL':
      return 'Processing failed and this resume needs attention before it can be reviewed.';
    case 'RESUME_REJECTED':
      return 'This resume was rejected during processing.';
    case 'REVIEW_IGNORED':
      return 'This resume proposal was ignored and did not change your Career Passport.';
    case 'REVIEW_ALREADY_APPROVED':
      return 'This resume review has already been applied to your Career Passport.';
    case 'PARSE_PROPOSAL_NOT_AVAILABLE':
      return 'The resume reached review state, but its completed proposal is unavailable.';
    case 'PROCESSING_IN_PROGRESS':
      return 'Processing is still in progress. This page refreshes the private status automatically.';
    default:
      return 'A completed review proposal is not available yet.';
  }
}

function readError(caught: unknown): string {
  if (caught instanceof ApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return 'Unable to load resume review data.';
}
