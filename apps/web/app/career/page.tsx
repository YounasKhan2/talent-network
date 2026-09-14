'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ApiError,
  getCandidatePassport,
  getSession,
  replaceCandidateCertifications,
  replaceCandidateEducation,
  replaceCandidateEmployment,
  replaceCandidateLanguages,
  replaceCandidateLinks,
  replaceCandidateLocations,
  replaceCandidateProjects,
  replaceCandidateSkills,
  updateCandidateOverview,
  updateCandidateSettings,
  type CandidatePassportResponse,
  type CandidateWorkMode,
} from '../../lib/api';

type LoadState = 'loading' | 'ready' | 'error';
type SaveOperation = () => Promise<CandidatePassportResponse>;

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
        if (
          caught instanceof ApiError &&
          caught.code === 'CANDIDATE_PASSPORT_NOT_INITIALIZED'
        ) {
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
          <a href="#overview">Overview</a>
          <a href="#experience">Experience</a>
          <a href="#education">Education</a>
          <a href="#skills">Skills</a>
          <a href="#projects">Projects</a>
          <a href="#certifications">Certifications</a>
          <a href="#languages">Languages</a>
          <a href="#links">Links</a>
          <a href="#locations">Locations</a>
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

        <OverviewSection passport={passport} pending={pendingSection === 'overview'} onSave={(input) => runMutation('overview', () => updateCandidateOverview(input))} />
        <ExperienceSection passport={passport} pending={pendingSection === 'experience'} onSave={(input) => runMutation('experience', () => replaceCandidateEmployment(input))} />
        <EducationSection passport={passport} pending={pendingSection === 'education'} onSave={(input) => runMutation('education', () => replaceCandidateEducation(input))} />
        <SkillsSection passport={passport} pending={pendingSection === 'skills'} onSave={(input) => runMutation('skills', () => replaceCandidateSkills(input))} />
        <ProjectsSection passport={passport} pending={pendingSection === 'projects'} onSave={(input) => runMutation('projects', () => replaceCandidateProjects(input))} />
        <CertificationsSection passport={passport} pending={pendingSection === 'certifications'} onSave={(input) => runMutation('certifications', () => replaceCandidateCertifications(input))} />
        <LanguagesSection passport={passport} pending={pendingSection === 'languages'} onSave={(input) => runMutation('languages', () => replaceCandidateLanguages(input))} />
        <LinksSection passport={passport} pending={pendingSection === 'links'} onSave={(input) => runMutation('links', () => replaceCandidateLinks(input))} />
        <LocationsSection passport={passport} pending={pendingSection === 'locations'} onSave={(input) => runMutation('locations', () => replaceCandidateLocations(input))} />
        <PrivacySection passport={passport} pending={pendingSection === 'privacy'} onSave={(input) => runMutation('privacy', () => updateCandidateSettings(input))} />
      </section>
    </main>
  );
}

function OverviewSection({ passport, pending, onSave }: { passport: CandidatePassportResponse; pending: boolean; onSave: (input: Parameters<typeof updateCandidateOverview>[0]) => Promise<void> }) {
  const profile = passport.currentProfileVersion!;
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [summary, setSummary] = useState(profile.summary ?? '');
  const [availabilityStatus, setAvailabilityStatus] = useState(profile.availabilityStatus ?? 'OPEN_TO_OFFERS');
  const [currency, setCurrency] = useState(profile.compensationCurrency ?? 'USD');
  const [target, setTarget] = useState(profile.compensationTarget?.toString() ?? '');
  const [workModes, setWorkModes] = useState<CandidateWorkMode[]>(profile.preferredWorkModes);
  function toggleWorkMode(mode: CandidateWorkMode) { setWorkModes((current) => current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode]); }
  return <section className="career-section" id="overview"><SectionHeader index="01" title="Professional overview" note="The top-level signal employers and matching systems will read first." /><form className="career-form" onSubmit={(event) => { event.preventDefault(); void onSave({ headline: headline || null, summary: summary || null, availabilityStatus, compensationCurrency: currency || null, compensationTarget: target ? Number(target) : null, compensationPeriod: 'ANNUAL', preferredWorkModes: workModes }); }}><label><span>Professional headline</span><input maxLength={180} onChange={(event) => setHeadline(event.target.value)} value={headline} /></label><label><span>Summary</span><textarea maxLength={4000} onChange={(event) => setSummary(event.target.value)} rows={6} value={summary} /></label><div className="career-field-grid"><label><span>Availability</span><select onChange={(event) => setAvailabilityStatus(event.target.value as typeof availabilityStatus)} value={availabilityStatus}><option value="IMMEDIATE">Immediately available</option><option value="NOTICE_PERIOD">Serving notice period</option><option value="OPEN_TO_OFFERS">Open to offers</option><option value="NOT_LOOKING">Not looking</option></select></label><label><span>Target compensation</span><div className="career-inline-fields"><input maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())} value={currency} /><input min="0" onChange={(event) => setTarget(event.target.value)} type="number" value={target} /></div></label></div><fieldset><legend>Preferred work modes</legend><div className="career-toggle-row">{(['REMOTE','HYBRID','ONSITE','FLEXIBLE'] as CandidateWorkMode[]).map((mode) => <button className={workModes.includes(mode) ? 'career-toggle career-toggle-active' : 'career-toggle'} key={mode} onClick={() => toggleWorkMode(mode)} type="button">{mode}</button>)}</div></fieldset><SaveButton pending={pending} label="Save overview" /></form></section>;
}

function ExperienceSection({ passport, pending, onSave }: { passport: CandidatePassportResponse; pending: boolean; onSave: (input: Parameters<typeof replaceCandidateEmployment>[0]) => Promise<void> }) {
  const existing = passport.currentProfileVersion!.employments; const [companyName,setCompanyName]=useState(''); const [title,setTitle]=useState('');
  async function add(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!companyName.trim() || !title.trim()) return; await onSave([...existing.map(({companyName,title,employmentType,location,workMode,startDate,endDate,isCurrent,summary})=>({companyName,title,employmentType,location,workMode,startDate,endDate,isCurrent,summary})),{companyName:companyName.trim(),title:title.trim(),isCurrent:true}]); setCompanyName(''); setTitle(''); }
  return <SimpleRecordSection id="experience" index="02" title="Experience" note="Employment history is preserved with each profile version." empty="No work history added yet." records={existing.map((item)=>({id:item.id,title:item.title,subtitle:item.companyName,meta:item.isCurrent?'Current role':'Previous role'}))}><form className="career-add-row" onSubmit={(event)=>void add(event)}><input onChange={(event)=>setTitle(event.target.value)} placeholder="Role title" value={title}/><input onChange={(event)=>setCompanyName(event.target.value)} placeholder="Company" value={companyName}/><button className="compact-action" disabled={pending} type="submit">Add experience</button></form></SimpleRecordSection>;
}

function EducationSection({ passport, pending, onSave }: { passport: CandidatePassportResponse; pending: boolean; onSave: (input: Parameters<typeof replaceCandidateEducation>[0]) => Promise<void> }) {
  const existing=passport.currentProfileVersion!.education; const [institutionName,setInstitutionName]=useState(''); const [degree,setDegree]=useState(''); async function add(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!institutionName.trim())return;await onSave([...existing.map(({institutionName,degree,fieldOfStudy,location,startDate,endDate,isCurrent,description})=>({institutionName,degree,fieldOfStudy,location,startDate,endDate,isCurrent,description})),{institutionName:institutionName.trim(),degree:degree.trim()||null}]);setInstitutionName('');setDegree('');} return <SimpleRecordSection id="education" index="03" title="Education" note="Add formal education without forcing it into hiring signal where it is irrelevant." empty="No education added yet." records={existing.map((item)=>({id:item.id,title:item.degree||'Education',subtitle:item.institutionName,meta:item.fieldOfStudy||'Field not specified'}))}><form className="career-add-row" onSubmit={(event)=>void add(event)}><input onChange={(event)=>setInstitutionName(event.target.value)} placeholder="Institution" value={institutionName}/><input onChange={(event)=>setDegree(event.target.value)} placeholder="Degree" value={degree}/><button className="compact-action" disabled={pending} type="submit">Add education</button></form></SimpleRecordSection>;
}

function SkillsSection({passport,pending,onSave}:{passport:CandidatePassportResponse;pending:boolean;onSave:(input:Parameters<typeof replaceCandidateSkills>[0])=>Promise<void>}){const [value,setValue]=useState(passport.currentProfileVersion!.skills.map((skill)=>skill.name).join(', '));return <section className="career-section" id="skills"><SectionHeader index="04" title="Skills" note="Keep skills factual. Evidence and verification attach in later phases."/><form className="career-form" onSubmit={(event)=>{event.preventDefault();const names=value.split(',').map((item)=>item.trim()).filter(Boolean);void onSave(names.map((name)=>({name})));}}><label><span>Skills, separated by commas</span><textarea onChange={(event)=>setValue(event.target.value)} rows={4} value={value}/></label><div className="career-tag-preview">{value.split(',').map((item)=>item.trim()).filter(Boolean).map((skill)=><span key={skill}>{skill}</span>)}</div><SaveButton pending={pending} label="Save skills"/></form></section>}

function ProjectsSection({passport,pending,onSave}:{passport:CandidatePassportResponse;pending:boolean;onSave:(input:Parameters<typeof replaceCandidateProjects>[0])=>Promise<void>}){const existing=passport.currentProfileVersion!.projects;const[name,setName]=useState('');const[role,setRole]=useState('');const[url,setUrl]=useState('');async function add(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!name.trim())return;await onSave([...existing.map(({name,description,role,url,repositoryUrl,startDate,endDate})=>({name,description,role,url,repositoryUrl,startDate,endDate})),{name:name.trim(),role:role.trim()||null,url:url.trim()||null}]);setName('');setRole('');setUrl('');}return <SimpleRecordSection id="projects" index="05" title="Projects" note="Show work that demonstrates capability beyond job titles." empty="No projects added yet." records={existing.map((item)=>({id:item.id,title:item.name,subtitle:item.role||'Project',meta:item.url||item.repositoryUrl||'No link added'}))}><form className="career-add-row" onSubmit={(event)=>void add(event)}><input onChange={(event)=>setName(event.target.value)} placeholder="Project name" value={name}/><input onChange={(event)=>setRole(event.target.value)} placeholder="Your role" value={role}/><input onChange={(event)=>setUrl(event.target.value)} placeholder="https://project.example" type="url" value={url}/><button className="compact-action" disabled={pending} type="submit">Add project</button></form></SimpleRecordSection>}

function CertificationsSection({passport,pending,onSave}:{passport:CandidatePassportResponse;pending:boolean;onSave:(input:Parameters<typeof replaceCandidateCertifications>[0])=>Promise<void>}){const existing=passport.currentProfileVersion!.certifications;const[name,setName]=useState('');const[issuer,setIssuer]=useState('');async function add(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!name.trim()||!issuer.trim())return;await onSave([...existing.map(({name,issuer,credentialId,credentialUrl,issuedAt,expiresAt})=>({name,issuer,credentialId,credentialUrl,issuedAt,expiresAt})),{name:name.trim(),issuer:issuer.trim()}]);setName('');setIssuer('');}return <SimpleRecordSection id="certifications" index="06" title="Certifications" note="Credentials stay structured so verification can attach later." empty="No certifications added yet." records={existing.map((item)=>({id:item.id,title:item.name,subtitle:item.issuer,meta:item.credentialId||'Credential ID not added'}))}><form className="career-add-row" onSubmit={(event)=>void add(event)}><input onChange={(event)=>setName(event.target.value)} placeholder="Certification" value={name}/><input onChange={(event)=>setIssuer(event.target.value)} placeholder="Issuer" value={issuer}/><button className="compact-action" disabled={pending} type="submit">Add certification</button></form></SimpleRecordSection>}

function LanguagesSection({passport,pending,onSave}:{passport:CandidatePassportResponse;pending:boolean;onSave:(input:Parameters<typeof replaceCandidateLanguages>[0])=>Promise<void>}){const existing=passport.currentProfileVersion!.languages;const[name,setName]=useState('');const[proficiency,setProficiency]=useState('');async function add(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!name.trim())return;await onSave([...existing.map(({name,proficiency})=>({name,proficiency})),{name:name.trim(),proficiency:proficiency.trim()||null}]);setName('');setProficiency('');}return <SimpleRecordSection id="languages" index="07" title="Languages" note="Language capability is useful context, not a universal hiring requirement." empty="No languages added yet." records={existing.map((item)=>({id:item.id,title:item.name,subtitle:item.proficiency||'Proficiency not specified'}))}><form className="career-add-row" onSubmit={(event)=>void add(event)}><input onChange={(event)=>setName(event.target.value)} placeholder="Language" value={name}/><input onChange={(event)=>setProficiency(event.target.value)} placeholder="Professional, native…" value={proficiency}/><button className="compact-action" disabled={pending} type="submit">Add language</button></form></SimpleRecordSection>}

function LinksSection({passport,pending,onSave}:{passport:CandidatePassportResponse;pending:boolean;onSave:(input:Parameters<typeof replaceCandidateLinks>[0])=>Promise<void>}){const existing=passport.currentProfileVersion!.links;const[label,setLabel]=useState('');const[url,setUrl]=useState('');async function add(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!label.trim()||!url.trim())return;await onSave([...existing.map(({kind,label,url})=>({kind,label,url})),{kind:'OTHER',label:label.trim(),url:url.trim()}]);setLabel('');setUrl('');}return <SimpleRecordSection id="links" index="08" title="Professional links" note="Keep portfolio, GitHub, LinkedIn, and other evidence attached to one identity." empty="No professional links added yet." records={existing.map((item)=>({id:item.id,title:item.label||item.kind,subtitle:item.kind,meta:item.url}))}><form className="career-add-row" onSubmit={(event)=>void add(event)}><input onChange={(event)=>setLabel(event.target.value)} placeholder="Portfolio, GitHub…" value={label}/><input onChange={(event)=>setUrl(event.target.value)} placeholder="https://" type="url" value={url}/><button className="compact-action" disabled={pending} type="submit">Add link</button></form></SimpleRecordSection>}

function LocationsSection({passport,pending,onSave}:{passport:CandidatePassportResponse;pending:boolean;onSave:(input:Parameters<typeof replaceCandidateLocations>[0])=>Promise<void>}){const existing=passport.currentProfileVersion!.locationPreferences;const[countryCode,setCountryCode]=useState('');const[city,setCity]=useState('');async function add(event:FormEvent<HTMLFormElement>){event.preventDefault();const country=countryCode.trim().toUpperCase();if(country.length!==2)return;await onSave([...existing.map(({countryCode,region,city,remoteOnly,relocationOpen})=>({countryCode,region,city,remoteOnly,relocationOpen})),{countryCode:country,city:city.trim()||null,remoteOnly:false,relocationOpen:false}]);setCountryCode('');setCity('');}return <SimpleRecordSection id="locations" index="09" title="Location preferences" note="Location and mobility preferences stay explicit instead of being inferred." empty="No location preferences added yet." records={existing.map((item)=>({id:item.id,title:[item.city,item.region,item.countryCode].filter(Boolean).join(', '),subtitle:item.remoteOnly?'Remote only':'Location preference',meta:item.relocationOpen?'Open to relocation':'Relocation not selected'}))}><form className="career-add-row" onSubmit={(event)=>void add(event)}><input maxLength={2} onChange={(event)=>setCountryCode(event.target.value.toUpperCase())} placeholder="PK" value={countryCode}/><input onChange={(event)=>setCity(event.target.value)} placeholder="City" value={city}/><button className="compact-action" disabled={pending} type="submit">Add location</button></form></SimpleRecordSection>}

function PrivacySection({passport,pending,onSave}:{passport:CandidatePassportResponse;pending:boolean;onSave:(input:Parameters<typeof updateCandidateSettings>[0])=>Promise<void>}){const[visibility,setVisibility]=useState(passport.visibility);const[discoverability,setDiscoverability]=useState(passport.discoverability);return <section className="career-section" id="privacy"><SectionHeader index="10" title="Privacy & discoverability" note="Private by default. Visibility and recruiter discoverability are separate controls."/><form className="career-form" onSubmit={(event)=>{event.preventDefault();void onSave({visibility,discoverability});}}><div className="career-field-grid"><label><span>Profile visibility</span><select onChange={(event)=>setVisibility(event.target.value as typeof visibility)} value={visibility}><option value="PRIVATE">Private</option><option value="NETWORK">Talent Network</option><option value="VERIFIED_RECRUITERS">Verified recruiters</option></select></label><label><span>Search discoverability</span><select onChange={(event)=>setDiscoverability(event.target.value as typeof discoverability)} value={discoverability}><option value="HIDDEN">Hidden</option><option value="SEARCHABLE">Searchable</option></select></label></div><p className="career-privacy-note">Your career identity is personal. Joining a company workspace never gives that company access to your private career activity.</p><SaveButton pending={pending} label="Save privacy settings"/></form></section>}

function SimpleRecordSection({id,index,title,note,empty,records,children}:{id:string;index:string;title:string;note:string;empty:string;records:Array<{id:string;title:string;subtitle:string;meta?:string}>;children:React.ReactNode}){return <section className="career-section" id={id}><SectionHeader index={index} title={title} note={note}/><div className="career-record-list">{records.length?records.map((item)=><article key={item.id}><strong>{item.title}</strong><span>{item.subtitle}</span>{item.meta?<small>{item.meta}</small>:null}</article>):<p>{empty}</p>}</div>{children}</section>}
function SectionHeader({index,title,note}:{index:string;title:string;note:string}){return <header className="career-section-header"><span>{index}</span><div><h2>{title}</h2><p>{note}</p></div></header>}
function SaveButton({pending,label}:{pending:boolean;label:string}){return <button className="primary-action" disabled={pending} type="submit">{pending?'Saving…':label}</button>}
function CareerState({title,detail}:{title:string;detail?:string}){return <main className="workspace-loading"><p className="eyebrow">Talent Network</p><h1>{title}</h1>{detail?<p>{detail}</p>:null}</main>}
function calculateCompleteness(passport:CandidatePassportResponse|null):number{const profile=passport?.currentProfileVersion;if(!profile)return 0;const checks=[Boolean(profile.headline),Boolean(profile.summary),profile.employments.length>0,profile.education.length>0,profile.skills.length>0,profile.projects.length>0,profile.links.length>0,profile.locationPreferences.length>0,profile.preferredWorkModes.length>0,Boolean(profile.availabilityStatus)];return Math.round((checks.filter(Boolean).length/checks.length)*100)}
