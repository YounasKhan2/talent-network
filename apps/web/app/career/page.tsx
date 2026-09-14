'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ApiError,
  getCandidatePassport,
  getSession,
  initializeCandidatePassport,
  replaceCandidateEducation,
  replaceCandidateEmployment,
  replaceCandidateSkills,
  updateCandidateOverview,
  updateCandidateSettings,
  type CandidatePassportResponse,
  type CandidateWorkMode,
} from '../../lib/api';

type LoadState = 'loading' | 'ready' | 'error';

export default function CareerPassportPage() {
  const router = useRouter();
  const [passport, setPassport] = useState<CandidatePassportResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await getSession();
        let result: CandidatePassportResponse;
        try {
          result = await getCandidatePassport();
        } catch (caught) {
          if (caught instanceof ApiError && caught.code === 'CANDIDATE_PASSPORT_NOT_INITIALIZED') {
            result = await initializeCandidatePassport();
          } else {
            throw caught;
          }
        }
        if (!active) return;
        setPassport(result);
        setLoadState('ready');
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace('/login?next=/career');
          return;
        }
        setError(caught instanceof Error ? caught.message : 'Unable to load your Career Passport.');
        setLoadState('error');
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [router]);

  const completeness = useMemo(() => calculateCompleteness(passport), [passport]);

  if (loadState === 'loading') {
    return <CareerState title="Loading your Career Passport…" />;
  }

  if (loadState === 'error' || !passport?.currentProfileVersion) {
    return <CareerState title="We could not load your Career Passport." detail={error ?? undefined} />;
  }

  const profile = passport.currentProfileVersion;

  async function runMutation(label: string, operation: () => Promise<CandidatePassportResponse>) {
    setPendingSection(label);
    setError(null);
    try {
      setPassport(await operation());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to save this section.');
    } finally {
      setPendingSection(null);
    }
  }

  return (
    <main className="career-shell">
      <aside className="career-rail">
        <div>
          <Link className="brand-mark" href="/">
            TN
          </Link>
          <p className="career-rail-label">Career Passport</p>
        </div>
        <nav aria-label="Career Passport sections">
          <a href="#overview">Overview</a>
          <a href="#experience">Experience</a>
          <a href="#education">Education</a>
          <a href="#skills">Skills</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <div className="career-rail-foot">
          <span>Version {profile.versionNumber}</span>
          <Link href="/app">Employer workspace</Link>
        </div>
      </aside>

      <section className="career-main">
        <header className="career-header">
          <div>
            <p className="eyebrow">Candidate workspace</p>
            <h1>{profile.headline || 'Build the professional identity you reuse everywhere.'}</h1>
            <p>
              Your Career Passport is versioned. Each approved edit creates a new snapshot so future
              applications can preserve exactly what you submitted.
            </p>
          </div>
          <div className="career-completeness" aria-label={`Profile completeness ${completeness}%`}>
            <strong>{completeness}%</strong>
            <span>profile completeness</span>
          </div>
        </header>

        {error ? (
          <p className="form-error career-error" role="alert">
            {error}
          </p>
        ) : null}

        <OverviewSection
          passport={passport}
          pending={pendingSection === 'overview'}
          onSave={(input) => runMutation('overview', () => updateCandidateOverview(input))}
        />

        <ExperienceSection
          passport={passport}
          pending={pendingSection === 'experience'}
          onSave={(input) => runMutation('experience', () => replaceCandidateEmployment(input))}
        />

        <EducationSection
          passport={passport}
          pending={pendingSection === 'education'}
          onSave={(input) => runMutation('education', () => replaceCandidateEducation(input))}
        />

        <SkillsSection
          passport={passport}
          pending={pendingSection === 'skills'}
          onSave={(input) => runMutation('skills', () => replaceCandidateSkills(input))}
        />

        <PrivacySection
          passport={passport}
          pending={pendingSection === 'privacy'}
          onSave={(input) => runMutation('privacy', () => updateCandidateSettings(input))}
        />
      </section>
    </main>
  );
}

function OverviewSection({
  passport,
  pending,
  onSave,
}: {
  passport: CandidatePassportResponse;
  pending: boolean;
  onSave: (input: Parameters<typeof updateCandidateOverview>[0]) => Promise<void>;
}) {
  const profile = passport.currentProfileVersion!;
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [summary, setSummary] = useState(profile.summary ?? '');
  const [availabilityStatus, setAvailabilityStatus] = useState(profile.availabilityStatus ?? 'OPEN_TO_OFFERS');
  const [currency, setCurrency] = useState(profile.compensationCurrency ?? 'USD');
  const [target, setTarget] = useState(profile.compensationTarget?.toString() ?? '');
  const [workModes, setWorkModes] = useState<CandidateWorkMode[]>(profile.preferredWorkModes);

  function toggleWorkMode(mode: CandidateWorkMode) {
    setWorkModes((current) =>
      current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode],
    );
  }

  return (
    <section className="career-section" id="overview">
      <SectionHeader index="01" title="Professional overview" note="The top-level signal employers and matching systems will read first." />
      <form
        className="career-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            headline: headline || null,
            summary: summary || null,
            availabilityStatus,
            compensationCurrency: currency || null,
            compensationTarget: target ? Number(target) : null,
            compensationPeriod: 'ANNUAL',
            preferredWorkModes: workModes,
          });
        }}
      >
        <label>
          <span>Professional headline</span>
          <input maxLength={180} onChange={(event) => setHeadline(event.target.value)} value={headline} />
        </label>
        <label>
          <span>Summary</span>
          <textarea maxLength={4000} onChange={(event) => setSummary(event.target.value)} rows={6} value={summary} />
        </label>
        <div className="career-field-grid">
          <label>
            <span>Availability</span>
            <select onChange={(event) => setAvailabilityStatus(event.target.value as typeof availabilityStatus)} value={availabilityStatus}>
              <option value="IMMEDIATE">Immediately available</option>
              <option value="NOTICE_PERIOD">Serving notice period</option>
              <option value="OPEN_TO_OFFERS">Open to offers</option>
              <option value="NOT_LOOKING">Not looking</option>
            </select>
          </label>
          <label>
            <span>Target compensation</span>
            <div className="career-inline-fields">
              <input maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} value={currency} />
              <input min="0" onChange={(event) => setTarget(event.target.value)} type="number" value={target} />
            </div>
          </label>
        </div>
        <fieldset>
          <legend>Preferred work modes</legend>
          <div className="career-toggle-row">
            {(['REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE'] as CandidateWorkMode[]).map((mode) => (
              <button className={workModes.includes(mode) ? 'career-toggle career-toggle-active' : 'career-toggle'} key={mode} onClick={() => toggleWorkMode(mode)} type="button">
                {mode}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="primary-action" disabled={pending} type="submit">{pending ? 'Saving…' : 'Save overview'}</button>
      </form>
    </section>
  );
}

function SkillsSection({ passport, pending, onSave }: { passport: CandidatePassportResponse; pending: boolean; onSave: (input: Parameters<typeof replaceCandidateSkills>[0]) => Promise<void> }) {
  const profile = passport.currentProfileVersion!;
  const [value, setValue] = useState(profile.skills.map((skill) => skill.name).join(', '));
  return (
    <section className="career-section" id="skills">
      <SectionHeader index="04" title="Skills" note="Keep skills factual. Evidence and verification attach in later phases." />
      <form className="career-form" onSubmit={(event) => { event.preventDefault(); const names = value.split(',').map((item) => item.trim()).filter(Boolean); void onSave(names.map((name) => ({ name }))); }}>
        <label>
          <span>Skills, separated by commas</span>
          <textarea onChange={(event) => setValue(event.target.value)} rows={4} value={value} />
        </label>
        <div className="career-tag-preview">{value.split(',').map((item) => item.trim()).filter(Boolean).map((skill) => <span key={skill}>{skill}</span>)}</div>
        <button className="primary-action" disabled={pending} type="submit">{pending ? 'Saving…' : 'Save skills'}</button>
      </form>
    </section>
  );
}

function ExperienceSection({ passport, pending, onSave }: { passport: CandidatePassportResponse; pending: boolean; onSave: (input: Parameters<typeof replaceCandidateEmployment>[0]) => Promise<void> }) {
  const profile = passport.currentProfileVersion!;
  const [companyName, setCompanyName] = useState('');
  const [title, setTitle] = useState('');
  const existing = profile.employments;
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyName.trim() || !title.trim()) return;
    await onSave([...existing.map(({ companyName, title, employmentType, location, workMode, startDate, endDate, isCurrent, summary }) => ({ companyName, title, employmentType, location, workMode, startDate, endDate, isCurrent, summary })), { companyName: companyName.trim(), title: title.trim(), isCurrent: true }]);
    setCompanyName('');
    setTitle('');
  }
  return (
    <section className="career-section" id="experience">
      <SectionHeader index="02" title="Experience" note="Employment history is preserved with each profile version." />
      <div className="career-record-list">{existing.length ? existing.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.companyName}</span><small>{item.isCurrent ? 'Current role' : 'Previous role'}</small></article>) : <p>No work history added yet.</p>}</div>
      <form className="career-add-row" onSubmit={(event) => void add(event)}>
        <input onChange={(event) => setTitle(event.target.value)} placeholder="Role title" value={title} />
        <input onChange={(event) => setCompanyName(event.target.value)} placeholder="Company" value={companyName} />
        <button className="compact-action" disabled={pending} type="submit">Add experience</button>
      </form>
    </section>
  );
}

function EducationSection({ passport, pending, onSave }: { passport: CandidatePassportResponse; pending: boolean; onSave: (input: Parameters<typeof replaceCandidateEducation>[0]) => Promise<void> }) {
  const profile = passport.currentProfileVersion!;
  const [institutionName, setInstitutionName] = useState('');
  const [degree, setDegree] = useState('');
  const existing = profile.education;
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!institutionName.trim()) return;
    await onSave([...existing.map(({ institutionName, degree, fieldOfStudy, location, startDate, endDate, isCurrent, description }) => ({ institutionName, degree, fieldOfStudy, location, startDate, endDate, isCurrent, description })), { institutionName: institutionName.trim(), degree: degree.trim() || null }]);
    setInstitutionName('');
    setDegree('');
  }
  return (
    <section className="career-section" id="education">
      <SectionHeader index="03" title="Education" note="Add formal education without forcing it into hiring signal where it is irrelevant." />
      <div className="career-record-list">{existing.length ? existing.map((item) => <article key={item.id}><strong>{item.degree || 'Education'}</strong><span>{item.institutionName}</span><small>{item.fieldOfStudy || 'Field not specified'}</small></article>) : <p>No education added yet.</p>}</div>
      <form className="career-add-row" onSubmit={(event) => void add(event)}>
        <input onChange={(event) => setInstitutionName(event.target.value)} placeholder="Institution" value={institutionName} />
        <input onChange={(event) => setDegree(event.target.value)} placeholder="Degree" value={degree} />
        <button className="compact-action" disabled={pending} type="submit">Add education</button>
      </form>
    </section>
  );
}

function PrivacySection({ passport, pending, onSave }: { passport: CandidatePassportResponse; pending: boolean; onSave: (input: Parameters<typeof updateCandidateSettings>[0]) => Promise<void> }) {
  const [visibility, setVisibility] = useState(passport.visibility);
  const [discoverability, setDiscoverability] = useState(passport.discoverability);
  return (
    <section className="career-section" id="privacy">
      <SectionHeader index="05" title="Privacy & discoverability" note="Private by default. Visibility and recruiter discoverability are separate controls." />
      <form className="career-form" onSubmit={(event) => { event.preventDefault(); void onSave({ visibility, discoverability }); }}>
        <div className="career-field-grid">
          <label><span>Profile visibility</span><select onChange={(event) => setVisibility(event.target.value as typeof visibility)} value={visibility}><option value="PRIVATE">Private</option><option value="NETWORK">Talent Network</option><option value="VERIFIED_RECRUITERS">Verified recruiters</option></select></label>
          <label><span>Search discoverability</span><select onChange={(event) => setDiscoverability(event.target.value as typeof discoverability)} value={discoverability}><option value="HIDDEN">Hidden</option><option value="SEARCHABLE">Searchable</option></select></label>
        </div>
        <p className="career-privacy-note">Changing these settings does not bypass employer permission checks or expose private data outside the allowed product surface.</p>
        <button className="primary-action" disabled={pending} type="submit">{pending ? 'Saving…' : 'Save privacy settings'}</button>
      </form>
    </section>
  );
}

function SectionHeader({ index, title, note }: { index: string; title: string; note: string }) {
  return <header className="career-section-header"><span>{index}</span><div><h2>{title}</h2><p>{note}</p></div></header>;
}

function CareerState({ title, detail }: { title: string; detail?: string }) {
  return <main className="workspace-loading"><p className="eyebrow">Talent Network</p><h1>{title}</h1>{detail ? <p>{detail}</p> : null}</main>;
}

function calculateCompleteness(passport: CandidatePassportResponse | null): number {
  const profile = passport?.currentProfileVersion;
  if (!profile) return 0;
  const checks = [Boolean(profile.headline), Boolean(profile.summary), profile.employments.length > 0, profile.education.length > 0, profile.skills.length > 0, profile.preferredWorkModes.length > 0, Boolean(profile.availabilityStatus), Boolean(profile.compensationTarget)];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
