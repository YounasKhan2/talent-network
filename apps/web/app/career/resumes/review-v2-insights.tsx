import type { ParsedResumeProposal } from '../../../lib/resume-review-api';
import styles from './review-v2-insights.module.css';

interface ReviewV2InsightsProps {
  parsed: ParsedResumeProposal | null;
  parserName: string | null;
}

export function ReviewV2Insights({ parsed, parserName }: ReviewV2InsightsProps) {
  if (!parsed) return null;

  const coverage = parsed.coverageSummary;
  const detectedSections =
    coverage?.sections.filter((section) => section.status === 'DETECTED') ?? [];
  const missedSections = coverage?.sections.filter((section) => section.status === 'MISSED') ?? [];
  const additionalSections = (parsed.additionalSections ?? []).filter(
    (section) => !isPrivateReferenceHeading(section.heading.value),
  );
  const privateReferenceCount = (parsed.additionalSections ?? []).filter((section) =>
    isPrivateReferenceHeading(section.heading.value),
  ).length;

  return (
    <section className={styles.panel} aria-label="Resume understanding quality">
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>Review V2</span>
          <h3>What the system understood</h3>
          <p>
            Claim confidence and source coverage answer different questions. A high-confidence claim
            does not prove the entire resume was understood.
          </p>
        </div>
        <span className={styles.parserBadge}>{parserName ?? 'Parser pending'}</span>
      </div>

      <div className={styles.metricGrid}>
        <QualityMetric
          label="Claim confidence"
          value={`${Math.round(parsed.confidenceSummary.overall * 100)}%`}
          detail={`${parsed.confidenceSummary.totalClaimCount} grounded claims · ${parsed.confidenceSummary.lowConfidenceClaimCount} low confidence`}
        />
        <QualityMetric
          label="Source coverage"
          value={coverage ? `${Math.round(coverage.ratio * 100)}%` : 'Not reported'}
          detail={
            coverage
              ? `${coverage.coveredSectionCount} of ${coverage.sourceSectionCount} source sections detected`
              : 'Legacy proposal does not expose section coverage.'
          }
        />
        <QualityMetric
          label="Document quality"
          value="Pending V2 runtime"
          detail="Extraction-quality telemetry is introduced by the V2 runtime closure, not inferred in the browser."
          muted
        />
        <QualityMetric
          label="Structural quality"
          value="Pending V2 runtime"
          detail="Record-boundary confidence will appear when DocumentGraph/Source Ledger outputs are persisted."
          muted
        />
      </div>

      {coverage ? (
        <div className={styles.coverageArea}>
          <div className={styles.subheading}>
            <div>
              <span className={styles.kicker}>Source coverage</span>
              <h4>Detected and missed sections</h4>
            </div>
            <strong
              className={coverage.status === 'COMPLETE' ? styles.complete : styles.needsReview}
            >
              {readable(coverage.status)}
            </strong>
          </div>
          <div className={styles.coverageColumns}>
            <CoverageList
              empty="No source sections are currently reported as detected."
              items={detectedSections.map((section) => ({
                key: section.key,
                meta: `${section.detectedCount} detected`,
              }))}
              label="Detected"
            />
            <CoverageList
              empty="No source sections are currently reported as missed."
              items={missedSections.map((section) => ({ key: section.key, meta: 'Needs review' }))}
              label="Missed"
              warning
            />
          </div>
        </div>
      ) : null}

      <div className={styles.preservationGrid}>
        <div className={styles.preservationCard}>
          <div className={styles.subheading}>
            <div>
              <span className={styles.kicker}>Preserved content</span>
              <h4>Additional sections</h4>
            </div>
            <strong>{additionalSections.length}</strong>
          </div>
          {additionalSections.length ? (
            <div className={styles.additionalList}>
              {additionalSections.map((section, index) => (
                <article key={`${section.sourceOrder}-${index}`}>
                  <div>
                    <strong>{section.heading.value}</strong>
                    <span>
                      {section.entries.length} preserved entr
                      {section.entries.length === 1 ? 'y' : 'ies'}
                    </span>
                  </div>
                  <p>{previewEntries(section.entries.map((entry) => entry.value))}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyCopy}>
              No additional or custom sections are exposed by this proposal.
            </p>
          )}
        </div>

        <div className={styles.privacyCard}>
          <span className={styles.kicker}>Private source data</span>
          <h4>References stay private</h4>
          <p>
            Third-party reference details are not ordinary Career Passport content and must not be
            exposed to organization workspaces by resume review.
          </p>
          <strong>
            {privateReferenceCount > 0
              ? `${privateReferenceCount} reference section${privateReferenceCount === 1 ? '' : 's'} withheld from display`
              : 'No reference section is exposed by this proposal'}
          </strong>
        </div>
      </div>

      <div className={styles.runtimeNotice}>
        <strong>Why some V2 metrics are pending</strong>
        <p>
          This review page can only display persisted runtime evidence. Source Ledger record counts,
          reconciliation, document extraction quality, and structural confidence will become
          available after the V2 runtime pipeline is wired and persisted; this UI does not
          manufacture substitute scores.
        </p>
      </div>
    </section>
  );
}

function QualityMetric({
  label,
  value,
  detail,
  muted = false,
}: {
  label: string;
  value: string;
  detail: string;
  muted?: boolean;
}) {
  return (
    <article className={muted ? styles.metricMuted : styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function CoverageList({
  label,
  items,
  empty,
  warning = false,
}: {
  label: string;
  items: Array<{ key: string; meta: string }>;
  empty: string;
  warning?: boolean;
}) {
  return (
    <div className={warning ? styles.coverageListWarning : styles.coverageList}>
      <strong>{label}</strong>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <span>{readable(item.key)}</span>
              <small>{item.meta}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function isPrivateReferenceHeading(value: string): boolean {
  return /^references?$/i.test(value.trim());
}

function previewEntries(entries: string[]): string {
  const preview = entries.filter(Boolean).slice(0, 2).join(' · ');
  if (!preview) return 'Preserved for candidate review.';
  return preview.length > 180 ? `${preview.slice(0, 177)}…` : preview;
}

function readable(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
