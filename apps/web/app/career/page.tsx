'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ApiError,
  getCandidatePassport,
  getSession,
  replaceCandidateAwards,
  replaceCandidateCertifications,
  replaceCandidateCustomSections,
  replaceCandidateEducation,
  replaceCandidateEmployment,
  replaceCandidateLanguages,
  replaceCandidateLinks,
  replaceCandidateLocations,
  replaceCandidateProjects,
  replaceCandidateSkills,
  updateCandidateContactInformation,
  updateCandidateOverview,
  updateCandidateSettings,
  type CandidateCustomSectionResponse,
  type CandidatePassportResponse,
  type CandidateWorkMode,
} from '../../lib/api';

type LoadState = 'loading' | 'ready' | 'error';
type SaveOperation = () => Promise<CandidatePassportResponse>;
type Profile = NonNullable<CandidatePassportResponse['currentProfileVersion']>;
type Direction = -1 | 1;

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
        const result = await getCandidatePassport();
        if (!active) return;
        setPassport(result);
        setLoadState('ready');
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace('/login?next=/career');
          return;
        }
        if (caught instanceof ApiError && caught.code === 'CANDIDATE_PASSPORT_NOT_INITIALIZED') {
          router.replace('/onboarding?intent=career');
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

  if (loadState === 'loading') return <CareerState title="Loading your Career Passport…" />;
  if (loadState === 'error' || !passport?.currentProfileVersion) {
    return error ? (
      <CareerState title="We could not load your Career Passport." detail={error} />
    ) : (
      <CareerState title="We could not load your Career Passport." />
    );
  }

  const profile = passport.currentProfileVersion;

  async function runMutation(label: string, operation: SaveOperation) {
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
          <a href="#contact">Contact</a>
          <a href="#overview">Summary</a>
          <a href="#experience">Experience</a>
          <a href="#education">Education</a>
          <a href="#skills">Skills</a>
          <a href="#certifications">Certifications</a>
          <a href="#awards">Awards</a>
          <a href="#projects">Projects</a>
          <a href="#languages">Languages</a>
          <a href="#links">Links</a>
          <a href="#locations">Locations</a>
          <a href="#custom-sections">More sections</a>
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
              Your Career Passport is versioned. Every saved edit, removal, or reorder creates a new
              snapshot so future applications can preserve exactly what you submitted.
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

        <SectionGroupHeading
          eyebrow="Core profile"
          title="Your verified professional foundation"
          note="These seven sections form the canonical Career Passport. They stay available even when empty."
        />
        <ContactSection
          key={`${profile.id}-contact`}
          profile={profile}
          pending={pendingSection === 'contact'}
          onSave={(input) =>
            runMutation('contact', () => updateCandidateContactInformation(input))
          }
        />
        <OverviewSection
          key={`${profile.id}-overview`}
          profile={profile}
          pending={pendingSection === 'overview'}
          onSave={(input) => runMutation('overview', () => updateCandidateOverview(input))}
        />
        <ExperienceSection
          key={`${profile.id}-experience`}
          profile={profile}
          pending={pendingSection === 'experience'}
          onSave={(input) => runMutation('experience', () => replaceCandidateEmployment(input))}
        />
        <EducationSection
          key={`${profile.id}-education`}
          profile={profile}
          pending={pendingSection === 'education'}
          onSave={(input) => runMutation('education', () => replaceCandidateEducation(input))}
        />
        <SkillsSection
          key={`${profile.id}-skills`}
          profile={profile}
          pending={pendingSection === 'skills'}
          onSave={(input) => runMutation('skills', () => replaceCandidateSkills(input))}
        />
        <CertificationsSection
          key={`${profile.id}-certifications`}
          profile={profile}
          pending={pendingSection === 'certifications'}
          onSave={(input) =>
            runMutation('certifications', () => replaceCandidateCertifications(input))
          }
        />
        <AwardsSection
          key={`${profile.id}-awards`}
          profile={profile}
          pending={pendingSection === 'awards'}
          onSave={(input) => runMutation('awards', () => replaceCandidateAwards(input))}
        />

        <SectionGroupHeading
          eyebrow="Additional sections"
          title="Add evidence that fits your career"
          note="Projects, languages, links, locations, and resume-discovered sections are optional. Hide them from the editor without deleting saved data."
        />
        <ProjectsSection
          key={`${profile.id}-projects`}
          profile={profile}
          pending={pendingSection === 'projects'}
          onSave={(input) => runMutation('projects', () => replaceCandidateProjects(input))}
        />
        <LanguagesSection
          key={`${profile.id}-languages`}
          profile={profile}
          pending={pendingSection === 'languages'}
          onSave={(input) => runMutation('languages', () => replaceCandidateLanguages(input))}
        />
        <LinksSection
          key={`${profile.id}-links`}
          profile={profile}
          pending={pendingSection === 'links'}
          onSave={(input) => runMutation('links', () => replaceCandidateLinks(input))}
        />
        <LocationsSection
          key={`${profile.id}-locations`}
          profile={profile}
          pending={pendingSection === 'locations'}
          onSave={(input) => runMutation('locations', () => replaceCandidateLocations(input))}
        />
        <CustomSectionsSection
          key={`${profile.id}-custom-sections`}
          profile={profile}
          pending={pendingSection === 'custom-sections'}
          onSave={(input) =>
            runMutation('custom-sections', () => replaceCandidateCustomSections(input))
          }
        />

        <SectionGroupHeading
          eyebrow="Account controls"
          title="Privacy & discoverability"
          note="Control who can discover the Passport independently from the professional information it contains."
        />
        <PrivacySection
          key={`${profile.id}-privacy`}
          passport={passport}
          pending={pendingSection === 'privacy'}
          onSave={(input) => runMutation('privacy', () => updateCandidateSettings(input))}
        />
      </section>
    </main>
  );
}

function ContactSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof updateCandidateContactInformation>[0]) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(profile.contactFullName ?? '');
  const [email, setEmail] = useState(profile.contactEmail ?? '');
  const [phone, setPhone] = useState(profile.contactPhone ?? '');
  const [location, setLocation] = useState(profile.contactLocation ?? '');

  return (
    <section className="career-section" id="contact">
      <SectionHeader
        index="01"
        title="Contact information"
        note="Professional contact details belong to the versioned Passport and stay separate from your sign-in identity."
      />
      <form
        className="career-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            fullName: fullName.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
            location: location.trim() || null,
          });
        }}
      >
        <div className="career-field-grid">
          <Field label="Full name">
            <input maxLength={180} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Professional email">
            <input
              maxLength={320}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Location">
            <input
              maxLength={220}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Karachi, Pakistan"
            />
          </Field>
        </div>
        <SaveButton pending={pending} label="Save contact information" />
      </form>
    </section>
  );
}

function OverviewSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof updateCandidateOverview>[0]) => Promise<void>;
}) {
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [summary, setSummary] = useState(profile.summary ?? '');
  const [availabilityStatus, setAvailabilityStatus] = useState(
    profile.availabilityStatus ?? 'OPEN_TO_OFFERS',
  );
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
      <SectionHeader
        index="02"
        title="Professional summary"
        note="Your headline and summary give employers and matching systems the top-level context for the rest of the Passport."
      />
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
          <input
            maxLength={180}
            onChange={(event) => setHeadline(event.target.value)}
            value={headline}
          />
        </label>
        <label>
          <span>Summary</span>
          <textarea
            maxLength={4000}
            onChange={(event) => setSummary(event.target.value)}
            rows={6}
            value={summary}
          />
        </label>
        <div className="career-field-grid">
          <label>
            <span>Availability</span>
            <select
              onChange={(event) =>
                setAvailabilityStatus(event.target.value as typeof availabilityStatus)
              }
              value={availabilityStatus}
            >
              <option value="IMMEDIATE">Immediately available</option>
              <option value="NOTICE_PERIOD">Serving notice period</option>
              <option value="OPEN_TO_OFFERS">Open to offers</option>
              <option value="NOT_LOOKING">Not looking</option>
            </select>
          </label>
          <label>
            <span>Target compensation</span>
            <div className="career-inline-fields">
              <input
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                value={currency}
              />
              <input
                min="0"
                onChange={(event) => setTarget(event.target.value)}
                type="number"
                value={target}
              />
            </div>
          </label>
        </div>
        <fieldset>
          <legend>Preferred work modes</legend>
          <div className="career-toggle-row">
            {(['REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE'] as CandidateWorkMode[]).map((mode) => (
              <button
                className={
                  workModes.includes(mode) ? 'career-toggle career-toggle-active' : 'career-toggle'
                }
                key={mode}
                onClick={() => toggleWorkMode(mode)}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>
        </fieldset>
        <SaveButton pending={pending} label="Save summary" />
      </form>
    </section>
  );
}

function ExperienceSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateEmployment>[0]) => Promise<void>;
}) {
  const existing = profile.employments;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [title, setTitle] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [location, setLocation] = useState('');
  const [workMode, setWorkMode] = useState<CandidateWorkMode | ''>('');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const [summary, setSummary] = useState('');

  function reset() {
    setEditingId(null);
    setCompanyName('');
    setTitle('');
    setEmploymentType('');
    setLocation('');
    setWorkMode('');
    setStartMonth('');
    setEndMonth('');
    setIsCurrent(false);
    setSummary('');
  }

  function edit(id: string) {
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setCompanyName(item.companyName);
    setTitle(item.title);
    setEmploymentType(item.employmentType ?? '');
    setLocation(item.location ?? '');
    setWorkMode(item.workMode ?? '');
    setStartMonth(isoToMonth(item.startDate));
    setEndMonth(isoToMonth(item.endDate));
    setIsCurrent(item.isCurrent);
    setSummary(item.summary ?? '');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyName.trim() || !title.trim()) return;
    const next = serializeEmployments(existing);
    const value = {
      companyName: companyName.trim(),
      title: title.trim(),
      employmentType: employmentType.trim() || null,
      location: location.trim() || null,
      workMode: workMode || null,
      startDate: monthToIso(startMonth),
      endDate: isCurrent ? null : monthToIso(endMonth),
      isCurrent,
      summary: summary.trim() || null,
    };
    const index = editingId ? existing.findIndex((item) => item.id === editingId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onSave(next);
    reset();
  }

  return (
    <section className="career-section" id="experience">
      <SectionHeader
        index="03"
        title="Work experience"
        note="Edit, remove, and reorder work history while every save remains a versioned snapshot."
      />
      <EditableRecordList
        pending={pending}
        records={existing.map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.companyName,
          meta: formatDateRange(item.startDate, item.endDate, item.isCurrent),
          description: item.summary,
        }))}
        onEdit={edit}
        onRemove={(id) =>
          void onSave(serializeEmployments(existing.filter((item) => item.id !== id)))
        }
        onMove={(id, direction) =>
          void onSave(serializeEmployments(moveById(existing, id, direction)))
        }
      />
      <form className="career-form career-entry-form" onSubmit={(event) => void submit(event)}>
        <div className="career-entry-heading">
          <strong>{editingId ? 'Edit experience' : 'Add experience'}</strong>
          {editingId ? (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Role title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Company">
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </Field>
          <Field label="Employment type">
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              <option value="">Not specified</option>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="FREELANCE">Freelance</option>
            </select>
          </Field>
          <Field label="Work mode">
            <select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value as CandidateWorkMode | '')}
            >
              <option value="">Not specified</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ONSITE">On-site</option>
              <option value="FLEXIBLE">Flexible</option>
            </select>
          </Field>
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Start month">
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
            />
          </Field>
          <Field label="End month">
            <input
              type="month"
              disabled={isCurrent}
              value={isCurrent ? '' : endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
            />
          </Field>
          <label className="career-check-label">
            <input
              type="checkbox"
              checked={isCurrent}
              onChange={(e) => {
                setIsCurrent(e.target.checked);
                if (e.target.checked) setEndMonth('');
              }}
            />
            <span>I currently work here</span>
          </label>
        </div>
        <Field label="What did you work on?">
          <textarea
            maxLength={3000}
            rows={5}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </Field>
        <SaveButton pending={pending} label={editingId ? 'Save experience' : 'Add experience'} />
      </form>
    </section>
  );
}

function EducationSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateEducation>[0]) => Promise<void>;
}) {
  const existing = profile.education;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [degree, setDegree] = useState('');
  const [fieldOfStudy, setFieldOfStudy] = useState('');
  const [location, setLocation] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);
  const [description, setDescription] = useState('');

  function reset() {
    setEditingId(null);
    setInstitutionName('');
    setDegree('');
    setFieldOfStudy('');
    setLocation('');
    setStartMonth('');
    setEndMonth('');
    setIsCurrent(false);
    setDescription('');
  }
  function edit(id: string) {
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setInstitutionName(item.institutionName);
    setDegree(item.degree ?? '');
    setFieldOfStudy(item.fieldOfStudy ?? '');
    setLocation(item.location ?? '');
    setStartMonth(isoToMonth(item.startDate));
    setEndMonth(isoToMonth(item.endDate));
    setIsCurrent(item.isCurrent);
    setDescription(item.description ?? '');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!institutionName.trim()) return;
    const next = serializeEducation(existing);
    const value = {
      institutionName: institutionName.trim(),
      degree: degree.trim() || null,
      fieldOfStudy: fieldOfStudy.trim() || null,
      location: location.trim() || null,
      startDate: monthToIso(startMonth),
      endDate: isCurrent ? null : monthToIso(endMonth),
      isCurrent,
      description: description.trim() || null,
    };
    const index = editingId ? existing.findIndex((item) => item.id === editingId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onSave(next);
    reset();
  }

  return (
    <section className="career-section" id="education">
      <SectionHeader
        index="04"
        title="Education"
        note="Degree dates and study context stay editable without becoming mandatory hiring signals."
      />
      <EditableRecordList
        pending={pending}
        records={existing.map((item) => ({
          id: item.id,
          title: item.degree || 'Education',
          subtitle: item.institutionName,
          meta: formatDateRange(item.startDate, item.endDate, item.isCurrent),
          description: [item.fieldOfStudy, item.description].filter(Boolean).join(' · ') || null,
        }))}
        onEdit={edit}
        onRemove={(id) =>
          void onSave(serializeEducation(existing.filter((item) => item.id !== id)))
        }
        onMove={(id, direction) =>
          void onSave(serializeEducation(moveById(existing, id, direction)))
        }
      />
      <form className="career-form career-entry-form" onSubmit={(event) => void submit(event)}>
        <div className="career-entry-heading">
          <strong>{editingId ? 'Edit education' : 'Add education'}</strong>
          {editingId ? (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Institution">
            <input value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} />
          </Field>
          <Field label="Degree">
            <input value={degree} onChange={(e) => setDegree(e.target.value)} />
          </Field>
          <Field label="Field of study">
            <input value={fieldOfStudy} onChange={(e) => setFieldOfStudy(e.target.value)} />
          </Field>
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Start month">
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
            />
          </Field>
          <Field label="End / graduation month">
            <input
              type="month"
              disabled={isCurrent}
              value={isCurrent ? '' : endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
            />
          </Field>
          <label className="career-check-label">
            <input
              type="checkbox"
              checked={isCurrent}
              onChange={(e) => {
                setIsCurrent(e.target.checked);
                if (e.target.checked) setEndMonth('');
              }}
            />
            <span>Currently studying here</span>
          </label>
        </div>
        <Field label="Education details">
          <textarea
            maxLength={3000}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <SaveButton pending={pending} label={editingId ? 'Save education' : 'Add education'} />
      </form>
    </section>
  );
}

function SkillsSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateSkills>[0]) => Promise<void>;
}) {
  const existing = profile.skills;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [proficiency, setProficiency] = useState('');
  const [experienceMonths, setExperienceMonths] = useState('');
  function reset() {
    setEditingId(null);
    setName('');
    setProficiency('');
    setExperienceMonths('');
  }
  function edit(id: string) {
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setName(item.name);
    setProficiency(item.proficiency ?? '');
    setExperienceMonths(item.experienceMonths?.toString() ?? '');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const next = serializeSkills(existing);
    const value = {
      name: name.trim(),
      proficiency: proficiency.trim() || null,
      experienceMonths: experienceMonths ? Number(experienceMonths) : null,
      lastUsedAt: null,
    };
    const index = editingId ? existing.findIndex((item) => item.id === editingId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onSave(next);
    reset();
  }
  return (
    <section className="career-section" id="skills">
      <SectionHeader
        index="05"
        title="Skills"
        note="Skills are ordered structured signals; candidates can edit, remove, or prioritize them explicitly."
      />
      <EditableRecordList
        pending={pending}
        records={existing.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: item.proficiency || 'Proficiency not specified',
          meta: item.experienceMonths == null ? '' : `${item.experienceMonths} months`,
        }))}
        onEdit={edit}
        onRemove={(id) => void onSave(serializeSkills(existing.filter((item) => item.id !== id)))}
        onMove={(id, direction) => void onSave(serializeSkills(moveById(existing, id, direction)))}
      />
      <form className="career-form career-entry-form" onSubmit={(event) => void submit(event)}>
        <div className="career-entry-heading">
          <strong>{editingId ? 'Edit skill' : 'Add skill'}</strong>
          {editingId ? (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Skill">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Proficiency">
            <input
              value={proficiency}
              onChange={(e) => setProficiency(e.target.value)}
              placeholder="Advanced, professional…"
            />
          </Field>
          <Field label="Experience months">
            <input
              type="number"
              min="0"
              max="960"
              value={experienceMonths}
              onChange={(e) => setExperienceMonths(e.target.value)}
            />
          </Field>
        </div>
        <SaveButton pending={pending} label={editingId ? 'Save skill' : 'Add skill'} />
      </form>
    </section>
  );
}

function ProjectsSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateProjects>[0]) => Promise<void>;
}) {
  const existing = profile.projects;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  function reset() {
    setEditingId(null);
    setName('');
    setRole('');
    setDescription('');
    setUrl('');
    setRepositoryUrl('');
    setStartMonth('');
    setEndMonth('');
  }
  function edit(id: string) {
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setName(item.name);
    setRole(item.role ?? '');
    setDescription(item.description ?? '');
    setUrl(item.url ?? '');
    setRepositoryUrl(item.repositoryUrl ?? '');
    setStartMonth(isoToMonth(item.startDate));
    setEndMonth(isoToMonth(item.endDate));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const next = serializeProjects(existing);
    const value = {
      name: name.trim(),
      role: role.trim() || null,
      description: description.trim() || null,
      url: url.trim() || null,
      repositoryUrl: repositoryUrl.trim() || null,
      startDate: monthToIso(startMonth),
      endDate: monthToIso(endMonth),
    };
    const index = editingId ? existing.findIndex((item) => item.id === editingId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onSave(next);
    reset();
  }
  return (
    <section className="career-section" id="projects">
      <SectionHeader
        index="A1"
        title="Projects & portfolio"
        note="Projects capture what you built, your role, contribution, and supporting evidence."
      />
      <EditableRecordList
        pending={pending}
        records={existing.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: item.role || 'Project',
          meta: formatDateRange(item.startDate, item.endDate),
          description: item.description,
        }))}
        onEdit={edit}
        onRemove={(id) => void onSave(serializeProjects(existing.filter((item) => item.id !== id)))}
        onMove={(id, direction) =>
          void onSave(serializeProjects(moveById(existing, id, direction)))
        }
      />
      <form className="career-form career-entry-form" onSubmit={(event) => void submit(event)}>
        <div className="career-entry-heading">
          <strong>{editingId ? 'Edit project' : 'Add project'}</strong>
          {editingId ? (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Project name">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Your role">
            <input value={role} onChange={(e) => setRole(e.target.value)} />
          </Field>
          <Field label="Start month">
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
            />
          </Field>
          <Field label="End month">
            <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
          </Field>
          <Field label="Project URL">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="Repository URL">
            <input
              type="url"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
            />
          </Field>
        </div>
        <Field label="What did you work on in this project?">
          <textarea
            maxLength={3000}
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you built, responsibilities, major features, technologies, and your contribution."
          />
        </Field>
        <SaveButton pending={pending} label={editingId ? 'Save project' : 'Add project'} />
      </form>
    </section>
  );
}

function CertificationsSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateCertifications>[0]) => Promise<void>;
}) {
  const existing = profile.certifications;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [credentialId, setCredentialId] = useState('');
  const [credentialUrl, setCredentialUrl] = useState('');
  const [issuedMonth, setIssuedMonth] = useState('');
  const [expiresMonth, setExpiresMonth] = useState('');
  function reset() {
    setEditingId(null);
    setName('');
    setIssuer('');
    setCredentialId('');
    setCredentialUrl('');
    setIssuedMonth('');
    setExpiresMonth('');
  }
  function edit(id: string) {
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setName(item.name);
    setIssuer(item.issuer ?? '');
    setCredentialId(item.credentialId ?? '');
    setCredentialUrl(item.credentialUrl ?? '');
    setIssuedMonth(isoToMonth(item.issuedAt));
    setExpiresMonth(isoToMonth(item.expiresAt));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const next = serializeCertifications(existing);
    const value = {
      name: name.trim(),
      issuer: issuer.trim() || null,
      credentialId: credentialId.trim() || null,
      credentialUrl: credentialUrl.trim() || null,
      issuedAt: monthToIso(issuedMonth),
      expiresAt: monthToIso(expiresMonth),
    };
    const index = editingId ? existing.findIndex((item) => item.id === editingId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onSave(next);
    reset();
  }
  return (
    <section className="career-section" id="certifications">
      <SectionHeader
        index="06"
        title="Certifications"
        note="Credential evidence stays structured, ordered, and ready for future verification."
      />
      <EditableRecordList
        pending={pending}
        records={existing.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: item.issuer || 'Issuer not specified',
          meta: item.credentialId || formatDateRange(item.issuedAt, item.expiresAt),
        }))}
        onEdit={edit}
        onRemove={(id) =>
          void onSave(serializeCertifications(existing.filter((item) => item.id !== id)))
        }
        onMove={(id, direction) =>
          void onSave(serializeCertifications(moveById(existing, id, direction)))
        }
      />
      <form className="career-form career-entry-form" onSubmit={(event) => void submit(event)}>
        <div className="career-entry-heading">
          <strong>{editingId ? 'Edit certification' : 'Add certification'}</strong>
          {editingId ? (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Certification">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Issuer">
            <input value={issuer} onChange={(e) => setIssuer(e.target.value)} />
          </Field>
          <Field label="Credential ID">
            <input value={credentialId} onChange={(e) => setCredentialId(e.target.value)} />
          </Field>
          <Field label="Credential URL">
            <input
              type="url"
              value={credentialUrl}
              onChange={(e) => setCredentialUrl(e.target.value)}
            />
          </Field>
          <Field label="Issued">
            <input
              type="month"
              value={issuedMonth}
              onChange={(e) => setIssuedMonth(e.target.value)}
            />
          </Field>
          <Field label="Expires">
            <input
              type="month"
              value={expiresMonth}
              onChange={(e) => setExpiresMonth(e.target.value)}
            />
          </Field>
        </div>
        <SaveButton
          pending={pending}
          label={editingId ? 'Save certification' : 'Add certification'}
        />
      </form>
    </section>
  );
}

function AwardsSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateAwards>[0]) => Promise<void>;
}) {
  const existing = profile.awards;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [awardedMonth, setAwardedMonth] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');

  function reset() {
    setEditingId(null);
    setTitle('');
    setIssuer('');
    setAwardedMonth('');
    setDescription('');
    setUrl('');
  }

  function edit(id: string) {
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setTitle(item.title);
    setIssuer(item.issuer ?? '');
    setAwardedMonth(isoToMonth(item.awardedAt));
    setDescription(item.description ?? '');
    setUrl(item.url ?? '');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    const next = serializeAwards(existing);
    const value = {
      title: title.trim(),
      issuer: issuer.trim() || null,
      awardedAt: monthToIso(awardedMonth),
      description: description.trim() || null,
      url: url.trim() || null,
    };
    const index = editingId ? existing.findIndex((item) => item.id === editingId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onSave(next);
    reset();
  }

  return (
    <section className="career-section" id="awards">
      <SectionHeader
        index="07"
        title="Awards"
        note="Recognition and competitive achievements stay structured rather than buried in free-form resume text."
      />
      <EditableRecordList
        pending={pending}
        records={existing.map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.issuer || 'Issuer not specified',
          meta: formatDateRange(item.awardedAt, null),
          description: item.description,
        }))}
        onEdit={edit}
        onRemove={(id) => void onSave(serializeAwards(existing.filter((item) => item.id !== id)))}
        onMove={(id, direction) => void onSave(serializeAwards(moveById(existing, id, direction)))}
      />
      <form className="career-form career-entry-form" onSubmit={(event) => void submit(event)}>
        <div className="career-entry-heading">
          <strong>{editingId ? 'Edit award' : 'Add award'}</strong>
          {editingId ? (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Award title">
            <input maxLength={220} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Issuer">
            <input maxLength={220} value={issuer} onChange={(e) => setIssuer(e.target.value)} />
          </Field>
          <Field label="Awarded">
            <input
              type="month"
              value={awardedMonth}
              onChange={(e) => setAwardedMonth(e.target.value)}
            />
          </Field>
          <Field label="Evidence URL">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            maxLength={3000}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <SaveButton pending={pending} label={editingId ? 'Save award' : 'Add award'} />
      </form>
    </section>
  );
}

function LanguagesSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateLanguages>[0]) => Promise<void>;
}) {
  const existing = profile.languages;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [proficiency, setProficiency] = useState('');
  function reset() {
    setEditingId(null);
    setName('');
    setProficiency('');
  }
  function edit(id: string) {
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setName(item.name);
    setProficiency(item.proficiency ?? '');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const next = serializeLanguages(existing);
    const value = { name: name.trim(), proficiency: proficiency.trim() || null };
    const index = editingId ? existing.findIndex((item) => item.id === editingId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onSave(next);
    reset();
  }
  return (
    <section className="career-section" id="languages">
      <SectionHeader
        index="A2"
        title="Languages & interests"
        note="Language capability and related interests are additional context you control explicitly."
      />
      <EditableRecordList
        pending={pending}
        records={existing.map((item) => ({
          id: item.id,
          title: item.name,
          subtitle: item.proficiency || 'Proficiency not specified',
        }))}
        onEdit={edit}
        onRemove={(id) =>
          void onSave(serializeLanguages(existing.filter((item) => item.id !== id)))
        }
        onMove={(id, direction) =>
          void onSave(serializeLanguages(moveById(existing, id, direction)))
        }
      />
      <form className="career-form career-entry-form" onSubmit={(event) => void submit(event)}>
        <div className="career-entry-heading">
          <strong>{editingId ? 'Edit language' : 'Add language'}</strong>
          {editingId ? (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Language">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Proficiency">
            <input value={proficiency} onChange={(e) => setProficiency(e.target.value)} />
          </Field>
        </div>
        <SaveButton pending={pending} label={editingId ? 'Save language' : 'Add language'} />
      </form>
    </section>
  );
}

function LinksSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateLinks>[0]) => Promise<void>;
}) {
  const existing = profile.links;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('OTHER');
  const [url, setUrl] = useState('');
  function reset() {
    setEditingId(null);
    setLabel('');
    setKind('OTHER');
    setUrl('');
  }
  function edit(id: string) {
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setLabel(item.label);
    setKind(item.kind ?? 'OTHER');
    setUrl(item.url);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!label.trim() || !url.trim()) return;
    const next = serializeLinks(existing);
    const value = { label: label.trim(), kind: kind.trim() || null, url: url.trim() };
    const index = editingId ? existing.findIndex((item) => item.id === editingId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onSave(next);
    reset();
  }
  return (
    <section className="career-section" id="links">
      <SectionHeader
        index="A3"
        title="Professional links"
        note="Portfolio, GitHub, LinkedIn, and other evidence remain ordered and editable."
      />
      <EditableRecordList
        pending={pending}
        records={existing.map((item) => ({
          id: item.id,
          title: item.label,
          subtitle: item.kind || 'Professional link',
          meta: item.url,
        }))}
        onEdit={edit}
        onRemove={(id) => void onSave(serializeLinks(existing.filter((item) => item.id !== id)))}
        onMove={(id, direction) => void onSave(serializeLinks(moveById(existing, id, direction)))}
      />
      <form className="career-form career-entry-form" onSubmit={(event) => void submit(event)}>
        <div className="career-entry-heading">
          <strong>{editingId ? 'Edit link' : 'Add link'}</strong>
          {editingId ? (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Kind">
            <input value={kind} onChange={(e) => setKind(e.target.value)} />
          </Field>
          <Field label="URL">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </div>
        <SaveButton pending={pending} label={editingId ? 'Save link' : 'Add link'} />
      </form>
    </section>
  );
}

function LocationsSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateLocations>[0]) => Promise<void>;
}) {
  const existing = profile.locationPreferences;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  function reset() {
    setEditingId(null);
    setLabel('');
    setCountryCode('');
    setRegion('');
    setCity('');
    setRemoteOnly(false);
  }
  function edit(id: string) {
    const item = existing.find((entry) => entry.id === id);
    if (!item) return;
    setEditingId(id);
    setLabel(item.label);
    setCountryCode(item.countryCode ?? '');
    setRegion(item.region ?? '');
    setCity(item.city ?? '');
    setRemoteOnly(item.remoteOnly);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const country = countryCode.trim().toUpperCase();
    const finalLabel =
      label.trim() || [city.trim(), region.trim(), country].filter(Boolean).join(', ');
    if (!finalLabel || (country && country.length !== 2)) return;
    const next = serializeLocations(existing);
    const value = {
      label: finalLabel,
      countryCode: country || null,
      region: region.trim() || null,
      city: city.trim() || null,
      remoteOnly,
    };
    const index = editingId ? existing.findIndex((item) => item.id === editingId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onSave(next);
    reset();
  }
  return (
    <section className="career-section" id="locations">
      <SectionHeader
        index="A4"
        title="Location preferences"
        note="Location and remote preferences stay explicit rather than inferred."
      />
      <EditableRecordList
        pending={pending}
        records={existing.map((item) => ({
          id: item.id,
          title: item.label,
          subtitle: item.remoteOnly ? 'Remote only' : 'Location preference',
          meta: [item.city, item.region, item.countryCode].filter(Boolean).join(', '),
        }))}
        onEdit={edit}
        onRemove={(id) =>
          void onSave(serializeLocations(existing.filter((item) => item.id !== id)))
        }
        onMove={(id, direction) =>
          void onSave(serializeLocations(moveById(existing, id, direction)))
        }
      />
      <form className="career-form career-entry-form" onSubmit={(event) => void submit(event)}>
        <div className="career-entry-heading">
          <strong>{editingId ? 'Edit location' : 'Add location'}</strong>
          {editingId ? (
            <button type="button" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Label">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Karachi / UAE / Remote"
            />
          </Field>
          <Field label="Country code">
            <input
              maxLength={2}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Region">
            <input value={region} onChange={(e) => setRegion(e.target.value)} />
          </Field>
          <Field label="City">
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <label className="career-check-label">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
            />
            <span>Remote only</span>
          </label>
        </div>
        <SaveButton pending={pending} label={editingId ? 'Save location' : 'Add location'} />
      </form>
    </section>
  );
}

function CustomSectionsSection({
  profile,
  pending,
  onSave,
}: {
  profile: Profile;
  pending: boolean;
  onSave: (input: Parameters<typeof replaceCandidateCustomSections>[0]) => Promise<void>;
}) {
  const existing = profile.customSections;
  const [sectionTitle, setSectionTitle] = useState('');
  const [sectionDescription, setSectionDescription] = useState('');

  async function addSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sectionTitle.trim()) return;
    await onSave([
      ...serializeCustomSections(existing),
      { title: sectionTitle.trim(), description: sectionDescription.trim() || null, items: [] },
    ]);
    setSectionTitle('');
    setSectionDescription('');
  }

  return (
    <section className="career-section" id="custom-sections">
      <SectionHeader
        index="A5"
        title="More career sections"
        note="Add publications, volunteering, research, speaking, open-source work, or any resume-discovered section without losing its original meaning."
      />
      <div className="career-custom-sections">
        {existing.length ? (
          existing.map((section, index) => (
            <CustomSectionEditor
              key={section.id}
              section={section}
              sectionIndex={index}
              sectionCount={existing.length}
              pending={pending}
              onRename={(title, description) => {
                const next = serializeCustomSections(existing);
                next[index] = { ...next[index]!, title, description };
                return onSave(next);
              }}
              onRemove={() =>
                onSave(serializeCustomSections(existing.filter((item) => item.id !== section.id)))
              }
              onMove={(direction) =>
                onSave(serializeCustomSections(moveById(existing, section.id, direction)))
              }
              onReplaceItems={(items) => {
                const next = serializeCustomSections(existing);
                next[index] = { ...next[index]!, items };
                return onSave(next);
              }}
            />
          ))
        ) : (
          <p className="career-empty-copy">
            No additional custom sections yet. Resume imports can also surface unfamiliar sections
            here for your review instead of discarding them.
          </p>
        )}
      </div>
      <form className="career-form career-entry-form" onSubmit={(event) => void addSection(event)}>
        <div className="career-entry-heading">
          <strong>Add career section</strong>
        </div>
        <div className="career-field-grid">
          <Field label="Section title">
            <input
              maxLength={160}
              value={sectionTitle}
              onChange={(e) => setSectionTitle(e.target.value)}
              placeholder="Publications, Volunteering, Research…"
            />
          </Field>
          <Field label="Optional introduction">
            <input
              maxLength={1000}
              value={sectionDescription}
              onChange={(e) => setSectionDescription(e.target.value)}
            />
          </Field>
        </div>
        <SaveButton pending={pending} label="Add section" />
      </form>
    </section>
  );
}

function CustomSectionEditor({
  section,
  sectionIndex,
  sectionCount,
  pending,
  onRename,
  onRemove,
  onMove,
  onReplaceItems,
}: {
  section: CandidateCustomSectionResponse;
  sectionIndex: number;
  sectionCount: number;
  pending: boolean;
  onRename: (title: string, description: string | null) => Promise<void>;
  onRemove: () => Promise<void>;
  onMove: (direction: Direction) => Promise<void>;
  onReplaceItems: (
    items: Parameters<typeof replaceCandidateCustomSections>[0][number]['items'],
  ) => Promise<void>;
}) {
  const [editingSection, setEditingSection] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [description, setDescription] = useState(section.description ?? '');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [itemSubtitle, setItemSubtitle] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemStart, setItemStart] = useState('');
  const [itemEnd, setItemEnd] = useState('');
  const [itemUrl, setItemUrl] = useState('');
  function resetItem() {
    setEditingItemId(null);
    setItemTitle('');
    setItemSubtitle('');
    setItemDescription('');
    setItemStart('');
    setItemEnd('');
    setItemUrl('');
  }
  function editItem(id: string) {
    const item = section.items.find((entry) => entry.id === id);
    if (!item) return;
    setEditingItemId(id);
    setItemTitle(item.title);
    setItemSubtitle(item.subtitle ?? '');
    setItemDescription(item.description ?? '');
    setItemStart(isoToMonth(item.startDate));
    setItemEnd(isoToMonth(item.endDate));
    setItemUrl(item.url ?? '');
  }
  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemTitle.trim()) return;
    const next = serializeCustomItems(section.items);
    const value = {
      title: itemTitle.trim(),
      subtitle: itemSubtitle.trim() || null,
      description: itemDescription.trim() || null,
      startDate: monthToIso(itemStart),
      endDate: monthToIso(itemEnd),
      url: itemUrl.trim() || null,
    };
    const index = editingItemId ? section.items.findIndex((item) => item.id === editingItemId) : -1;
    if (index >= 0) next[index] = value;
    else next.push(value);
    await onReplaceItems(next);
    resetItem();
  }
  return (
    <article className="career-custom-section-card">
      <header className="career-custom-section-head">
        <div>
          <span className="career-custom-index">C{String(sectionIndex + 1).padStart(2, '0')}</span>
          <h3>{section.title}</h3>
          {section.description ? <p>{section.description}</p> : null}
          {section.classificationStatus === 'NEEDS_REVIEW' ? (
            <small>Imported section · classification needs review</small>
          ) : null}
        </div>
        <div className="career-record-actions">
          <button
            disabled={pending || sectionIndex === 0}
            onClick={() => void onMove(-1)}
            type="button"
          >
            ↑
          </button>
          <button
            disabled={pending || sectionIndex === sectionCount - 1}
            onClick={() => void onMove(1)}
            type="button"
          >
            ↓
          </button>
          <button
            disabled={pending}
            onClick={() => setEditingSection((value) => !value)}
            type="button"
          >
            Rename
          </button>
          <button disabled={pending} onClick={() => void onRemove()} type="button">
            Delete section
          </button>
        </div>
      </header>
      {editingSection ? (
        <form
          className="career-custom-section-rename"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            void onRename(title.trim(), description.trim() || null);
            setEditingSection(false);
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional introduction"
          />
          <button className="compact-action" disabled={pending} type="submit">
            Save section
          </button>
        </form>
      ) : null}
      <EditableRecordList
        compact
        pending={pending}
        records={section.items.map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle || 'Custom entry',
          meta: formatDateRange(item.startDate, item.endDate),
          description: item.description,
        }))}
        onEdit={editItem}
        onRemove={(id) =>
          void onReplaceItems(serializeCustomItems(section.items.filter((item) => item.id !== id)))
        }
        onMove={(id, direction) =>
          void onReplaceItems(serializeCustomItems(moveById(section.items, id, direction)))
        }
      />
      <form className="career-custom-item-form" onSubmit={(event) => void submitItem(event)}>
        <div className="career-entry-heading">
          <strong>{editingItemId ? 'Edit entry' : 'Add entry'}</strong>
          {editingItemId ? (
            <button type="button" onClick={resetItem}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <div className="career-field-grid">
          <Field label="Title">
            <input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} />
          </Field>
          <Field label="Subtitle">
            <input value={itemSubtitle} onChange={(e) => setItemSubtitle(e.target.value)} />
          </Field>
          <Field label="Start month">
            <input type="month" value={itemStart} onChange={(e) => setItemStart(e.target.value)} />
          </Field>
          <Field label="End month">
            <input type="month" value={itemEnd} onChange={(e) => setItemEnd(e.target.value)} />
          </Field>
          <Field label="URL">
            <input type="url" value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <textarea
            maxLength={4000}
            rows={4}
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
          />
        </Field>
        <button className="compact-action" disabled={pending} type="submit">
          {pending ? 'Saving…' : editingItemId ? 'Save entry' : 'Add entry'}
        </button>
      </form>
    </article>
  );
}

function PrivacySection({
  passport,
  pending,
  onSave,
}: {
  passport: CandidatePassportResponse;
  pending: boolean;
  onSave: (input: Parameters<typeof updateCandidateSettings>[0]) => Promise<void>;
}) {
  const [visibility, setVisibility] = useState(passport.visibility);
  const [discoverability, setDiscoverability] = useState(passport.discoverability);
  return (
    <section className="career-section" id="privacy">
      <SectionHeader
        index="SET"
        title="Privacy & discoverability"
        note="Private by default. Visibility and recruiter discoverability are separate controls."
      />
      <form
        className="career-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ visibility, discoverability });
        }}
      >
        <div className="career-field-grid">
          <Field label="Profile visibility">
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            >
              <option value="PRIVATE">Private</option>
              <option value="NETWORK">Talent Network</option>
              <option value="VERIFIED_RECRUITERS">Verified recruiters</option>
            </select>
          </Field>
          <Field label="Search discoverability">
            <select
              value={discoverability}
              onChange={(e) => setDiscoverability(e.target.value as typeof discoverability)}
            >
              <option value="HIDDEN">Hidden</option>
              <option value="SEARCHABLE">Searchable</option>
            </select>
          </Field>
        </div>
        <p className="career-privacy-note">
          Your career identity is personal. Joining a company workspace never gives that company
          access to your private career activity.
        </p>
        <SaveButton pending={pending} label="Save privacy settings" />
      </form>
    </section>
  );
}

function EditableRecordList({
  records,
  pending,
  onEdit,
  onRemove,
  onMove,
  compact = false,
}: {
  records: Array<{
    id: string;
    title: string;
    subtitle: string;
    meta?: string | null;
    description?: string | null;
  }>;
  pending: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: Direction) => void;
  compact?: boolean;
}) {
  if (!records.length)
    return (
      <p className={compact ? 'career-empty-copy career-empty-copy-compact' : 'career-empty-copy'}>
        No entries added yet.
      </p>
    );
  return (
    <div
      className={compact ? 'career-record-list career-record-list-compact' : 'career-record-list'}
    >
      {records.map((item, index) => (
        <article key={item.id}>
          <div className="career-record-primary">
            <strong>{item.title}</strong>
            <span>{item.subtitle}</span>
            {item.meta ? <small>{item.meta}</small> : null}
            {item.description ? (
              <p className="career-record-description">{item.description}</p>
            ) : null}
          </div>
          <div className="career-record-actions">
            <button
              disabled={pending || index === 0}
              onClick={() => onMove(item.id, -1)}
              type="button"
              aria-label={`Move ${item.title} up`}
            >
              ↑
            </button>
            <button
              disabled={pending || index === records.length - 1}
              onClick={() => onMove(item.id, 1)}
              type="button"
              aria-label={`Move ${item.title} down`}
            >
              ↓
            </button>
            <button disabled={pending} onClick={() => onEdit(item.id)} type="button">
              Edit
            </button>
            <button disabled={pending} onClick={() => onRemove(item.id)} type="button">
              Remove
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function SectionGroupHeading({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <div className="career-section-header" aria-label={`${eyebrow}: ${title}`}>
      <span>••</span>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}
function SectionHeader({ index, title, note }: { index: string; title: string; note: string }) {
  return (
    <header className="career-section-header">
      <span>{index}</span>
      <div>
        <h2>{title}</h2>
        <p>{note}</p>
      </div>
    </header>
  );
}
function SaveButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button className="primary-action" disabled={pending} type="submit">
      {pending ? 'Saving…' : label}
    </button>
  );
}
function CareerState({ title, detail }: { title: string; detail?: string }) {
  return (
    <main className="workspace-loading">
      <p className="eyebrow">Talent Network</p>
      <h1>{title}</h1>
      {detail ? <p>{detail}</p> : null}
    </main>
  );
}

function moveById<T extends { id: string }>(items: T[], id: string, direction: Direction): T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
function monthToIso(value: string): string | null {
  return value ? `${value}-01T00:00:00.000Z` : null;
}
function isoToMonth(value: string | null): string {
  return value ? value.slice(0, 7) : '';
}
function formatDateRange(start: string | null, end: string | null, current = false): string {
  const startLabel = formatMonth(start);
  const endLabel = current ? 'Present' : formatMonth(end);
  if (!startLabel && !endLabel) return '';
  if (!startLabel) return endLabel;
  if (!endLabel) return startLabel;
  return `${startLabel} – ${endLabel}`;
}
function formatMonth(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  );
}

function serializeEmployments(
  items: Profile['employments'],
): Parameters<typeof replaceCandidateEmployment>[0] {
  return items.map(
    ({
      companyName,
      title,
      employmentType,
      location,
      workMode,
      startDate,
      endDate,
      isCurrent,
      summary,
    }) => ({
      companyName,
      title,
      employmentType,
      location,
      workMode,
      startDate,
      endDate,
      isCurrent,
      summary,
    }),
  );
}
function serializeEducation(
  items: Profile['education'],
): Parameters<typeof replaceCandidateEducation>[0] {
  return items.map(
    ({
      institutionName,
      degree,
      fieldOfStudy,
      location,
      startDate,
      endDate,
      isCurrent,
      description,
    }) => ({
      institutionName,
      degree,
      fieldOfStudy,
      location,
      startDate,
      endDate,
      isCurrent,
      description,
    }),
  );
}
function serializeSkills(items: Profile['skills']): Parameters<typeof replaceCandidateSkills>[0] {
  return items.map(({ name, proficiency, experienceMonths, lastUsedAt }) => ({
    name,
    proficiency,
    experienceMonths,
    lastUsedAt,
  }));
}
function serializeProjects(
  items: Profile['projects'],
): Parameters<typeof replaceCandidateProjects>[0] {
  return items.map(({ name, description, role, url, repositoryUrl, startDate, endDate }) => ({
    name,
    description,
    role,
    url,
    repositoryUrl,
    startDate,
    endDate,
  }));
}
function serializeCertifications(
  items: Profile['certifications'],
): Parameters<typeof replaceCandidateCertifications>[0] {
  return items.map(({ name, issuer, credentialId, credentialUrl, issuedAt, expiresAt }) => ({
    name,
    issuer,
    credentialId,
    credentialUrl,
    issuedAt,
    expiresAt,
  }));
}
function serializeAwards(items: Profile['awards']): Parameters<typeof replaceCandidateAwards>[0] {
  return items.map(({ title, issuer, awardedAt, description, url }) => ({
    title,
    issuer,
    awardedAt,
    description,
    url,
  }));
}
function serializeLanguages(
  items: Profile['languages'],
): Parameters<typeof replaceCandidateLanguages>[0] {
  return items.map(({ name, proficiency }) => ({ name, proficiency }));
}
function serializeLinks(items: Profile['links']): Parameters<typeof replaceCandidateLinks>[0] {
  return items.map(({ label, url, kind }) => ({ label, url, kind }));
}
function serializeLocations(
  items: Profile['locationPreferences'],
): Parameters<typeof replaceCandidateLocations>[0] {
  return items.map(({ label, countryCode, region, city, remoteOnly }) => ({
    label,
    countryCode,
    region,
    city,
    remoteOnly,
  }));
}
function serializeCustomItems(
  items: CandidateCustomSectionResponse['items'],
): Parameters<typeof replaceCandidateCustomSections>[0][number]['items'] {
  return items.map(({ title, subtitle, description, startDate, endDate, url }) => ({
    title,
    subtitle,
    description,
    startDate,
    endDate,
    url,
  }));
}
function serializeCustomSections(
  items: CandidateCustomSectionResponse[],
): Parameters<typeof replaceCandidateCustomSections>[0] {
  return items.map(
    ({
      title,
      description,
      sectionTypeKey,
      sourceHeading,
      classificationConfidence,
      classificationStatus,
      items: sectionItems,
    }) => ({
      title,
      description,
      sectionTypeKey,
      sourceHeading,
      classificationConfidence,
      classificationStatus,
      items: serializeCustomItems(sectionItems),
    }),
  );
}

function calculateCompleteness(passport: CandidatePassportResponse | null): number {
  const profile = passport?.currentProfileVersion;
  if (!profile) return 0;
  const checks = [
    Boolean(profile.contactFullName),
    Boolean(profile.contactEmail),
    Boolean(profile.headline),
    Boolean(profile.summary),
    profile.employments.length > 0,
    profile.education.length > 0,
    profile.skills.length > 0,
    profile.preferredWorkModes.length > 0,
    Boolean(profile.availabilityStatus),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
