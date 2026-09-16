import type { ParsedResumeProposal } from '../../../lib/resume-review-api';
import styles from './review-v2-insights.module.css';

interface ReviewV2InsightsProps {
  parsed: ParsedResumeProposal | null;
  parserName: string | null;
}

export function ReviewV2Insights({ parsed, parserName }: ReviewV2InsightsProps) {
  if (!parsed) return null;

  const coverage = parsed.coverageSummary;
  const runtime = parsed.runtimeV2;
  const detectedSections =
    coverage?.sections.filter((section) => section.status === 'DETECTED') ?? [];
  const missedSections = coverage?.sections.filter((section) => section.status === 'MISSED') ?? [];
  const additionalSections = (parsed.additionalSections ?? []).filter(
    (section) => !isPrivateReferenceHeading(section.heading.value),
  );
  const legacyPrivateReferenceCount = (parsed.additionalSections ?? []).filter((section) =>
    isPrivateReferenceHeading(section.heading.value),
  ).length;
  const privateReferenceCount = runtime?.privateSourceCount ?? legacyPrivateReferenceCount;
  const records = summarizeReconciliations(runtime?.reconciliations ?? []);
  const reviewDiagnostics =
    runtime?.diagnostics.filter((diagnostic) => diagnostic.reviewRequired) ?? [];
  const sourceCoverageRatio = runtime?.sourceCoverage.ratio ?? coverage?.ratio ?? null;

  return (
    <section className={styles.panel} aria-label="Resume understanding quality">
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>Review V2</span>
          <h3>What the system understood</h3>
          <p>
            Claim confidence, source accounting, extraction quality, and structural confidence are
            independent signals. A strong claim score does not prove the entire resume was
            understood.
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
          label="Source accounting"
          value={
            sourceCoverageRatio === null
              ? 'Not reported'
              : `${Math.round(sourceCoverageRatio * 100)}%`
          }
          detail={
            runtime
              ? `${runtime.sourceCoverage.accountedSourceCount} of ${runtime.sourceCoverage.meaningfulSourceCount} meaningful source items accounted · ${records.mapped} mapped · ${records.partial} partial · ${records.unmapped} unmapped · ${records.privateOnly} private`
              : coverage
                ? `${coverage.coveredSectionCount} of ${coverage.sourceSectionCount} source sections detected by the legacy proposal`
                : 'This proposal does not expose source-accounting telemetry.'
          }
        />
        <QualityMetric
          label="Document quality"
          value={formatQuality(runtime?.documentQuality)}
          detail={
            runtime
              ? 'Derived from persisted extraction completeness, character-noise, and extraction-warning signals.'
              : 'Available after a resume is processed by the V2 runtime.'
          }
          muted={!runtime}
        />
        <QualityMetric
          label="Structural quality"
          value={formatQuality(runtime?.structuralConfidence)}
          detail={
            runtime
              ? 'Average confidence across persisted section and record boundaries.'
              : 'Available after DocumentGraph and structural detection run in the V2 runtime.'
          }
          muted={!runtime}
        />
      </div>

      {coverage ? (
        <div className={styles.coverageArea}>
          <div className={styles.subheading}>
            <div>
              <span className={styles.kicker}>Section coverage</span>
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

      {runtime ? (
        <div className={styles.coverageArea}>
          <div className={styles.subheading}>
            <div>
              <span className={styles.kicker}>Source Ledger</span>
              <h4>Record reconciliation</h4>
            </div>
            <strong
              className={
                runtime.sourceCoverage.status === 'COMPLETE' ? styles.complete : styles.needsReview
              }
            >
              {readable(runtime.sourceCoverage.status)}
            </strong>
          </div>
          <div className={styles.coverageColumns}>
            <CoverageList
              empty="No typed record reconciliation was emitted."
              items={runtime.reconciliations.map((item) => ({
                key: item.sectionTypeKey,
                meta: `${item.mappedRecordCount} mapped · ${item.partiallyMappedRecordCount} partial · ${item.unmappedRecordCount} unmapped · ${item.privateOnlyRecordCount} private`,
              }))}
              label="By section"
            />
            <CoverageList
              empty="No V2 diagnostics currently require candidate review."
              items={reviewDiagnostics.map((diagnostic, index) => ({
                key: `${diagnostic.code}-${index}`,
                label: diagnostic.code,
                meta: readable(diagnostic.severity),
              }))}
              label="Needs review"
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
            Third-party reference details are not ordinary Career Passport content. The V2 runtime
            persists only private-source counts and status telemetry in the review proposal, never
            the reference names, emails, or phone numbers themselves.
          </p>
          <strong>
            {privateReferenceCount > 0
              ? `${privateReferenceCount} private reference record${privateReferenceCount === 1 ? '' : 's'} withheld from the proposal payload`
              : 'No private reference records were detected'}
          </strong>
        </div>
      </div>

      {!runtime ? (
        <div className={styles.runtimeNotice}>
          <strong>Historical proposal</strong>
          <p>
            This resume was parsed before the V2 runtime closure. Re-upload or reprocess it through
            the V2 parser to obtain DocumentGraph quality, Source Ledger reconciliation, and
            structural-confidence telemetry. This UI does not manufacture substitute scores.
          </p>
        </div>
      ) : null}
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
  items: Array<{ key: string; label?: string; meta: string }>;
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
              <span>{readable(item.label ?? item.key)}</span>
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

function summarizeReconciliations(
  reconciliations: NonNullable<ParsedResumeProposal['runtimeV2']>['reconciliations'],
) {
  return reconciliations.reduce(
    (summary, item) => ({
      mapped: summary.mapped + item.mappedRecordCount,
      partial: summary.partial + item.partiallyMappedRecordCount,
      unmapped: summary.unmapped + item.unmappedRecordCount + item.unprocessedRecordCount,
      privateOnly: summary.privateOnly + item.privateOnlyRecordCount,
    }),
    { mapped: 0, partial: 0, unmapped: 0, privateOnly: 0 },
  );
}

function formatQuality(value: number | null | undefined): string {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'Not reported';
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
