# Candidate Experience UX Specification

## Goal

The candidate experience should reduce application noise, improve confidence, and make the hiring process more transparent without turning the product into a gamified score dashboard.

The candidate side should feel more editorial, personal, and calm than the employer workspace.

## Candidate Navigation

Primary navigation:

```text
Home
Jobs
Applications
Career
Assessments
Messages
```

Secondary:

```text
Notifications
Account
Privacy
Preferences
Settings
```

## Candidate Home

Home is a next-action surface.

Prioritize:

- jobs worth considering
- application updates
- upcoming interviews/assessments
- incomplete career-profile items
- actionable gaps discovered from real application behavior

Avoid generic KPI cards such as “12 profile views” unless they clearly help the candidate decide what to do next.

## Career Passport

The Career Passport is a structured professional profile, not a form dump.

Sections:

```text
Professional headline
Summary
Experience
Education
Skills
Projects
Certifications
Assessments
Languages
Links / portfolio
Preferences
Compensation expectations
Availability
Locations
Verification
```

Editing should be section-based and inline where practical.

## Resume Import

Flow:

```text
Choose/import resume
→ upload
→ security scan
→ extract/parse
→ processing state
→ review proposed structured data
→ resolve uncertain/sensitive fields
→ approve changes
```

The candidate must understand that parsing creates a proposal, not an irreversible mutation.

## Resume Review

Review UI should show:

- extracted value
- source evidence
- confidence/uncertainty where useful
- difference from current Career Passport
- Accept / Edit / Ignore controls

Sensitive data should be clearly identified and excluded from hiring signal unless explicitly needed and lawful.

## Job Discovery

Job discovery should prioritize relevance over endless inventory.

Primary controls:

- search
- location
- remote/work mode
- experience level
- employment type
- salary range
- category/function
- posted date

Results should support cursor/infinite loading without hiding total/approximate context where available.

## Job Recommendation Card

A job card may show:

```text
Role
Company
Location / work mode
Salary if available
Match signal
Top strengths
One meaningful gap/uncertainty
Posted time
```

Do not overload cards with every filter dimension.

## Match Explanation

A candidate should be able to understand why a job is recommended.

Example:

```text
Strong alignment
- React requirement supported by recent experience
- Node.js requirement supported by employment history
- Salary expectation overlaps posted range

Potential gap
- AWS production evidence is limited

Unknown
- Employer did not publish team size
```

Avoid false precision and do not imply guaranteed shortlist probability unless such a probability model is empirically validated and appropriately disclosed.

## Apply Flow

Target:

```text
Review job
→ confirm profile/resume version
→ answer screening questions
→ review application summary
→ submit
```

One-click application may be allowed only when all required fields and answers are already valid.

Never silently submit outdated resume/profile data.

## Application Tracking

Each application should expose a candidate-safe timeline.

Example:

```text
Submitted
Viewed
In review
Assessment requested
Interview scheduled
Decision
```

Employer-internal stages may map to simpler candidate-facing statuses.

## No-Ghosting UX

Where platform data supports it, show objective state such as:

- viewed date
- next action requested
- scheduled interview
- closed role
- decision communicated

Do not fabricate internal recruiter activity or imply review when none is known.

## Rejection Experience

Where employers approve feedback categories, rejection may include concise factual context such as:

```text
The role required 3+ years of production backend experience.
Your submitted profile showed 1 year of directly relevant experience.
```

Avoid speculative personality judgments or AI-generated criticism.

## Assessments

Assessment experience should clearly state:

- purpose
- expected duration
- deadline
- allowed resources
- privacy/proctoring rules if any
- retry policy
- result visibility

Candidate should know whether results are reusable across employers.

## Interviews

Candidate interview surface should show:

- date/time/timezone
- interview format
- participants if disclosed
- location/video link
- preparation information
- reschedule/cancel rules

Timezone display must be explicit.

## Messages

Keep employer/candidate communication tied to the relevant opportunity where possible.

Protect against phishing/fraud by:

- verified employer signals
- warning on suspicious external payment requests
- link safety controls where appropriate
- report conversation action

## Career Intelligence

Future Career Copilot should use the candidate’s own structured history and application outcomes.

Potential insight:

```text
Your strongest interview conversion is for backend-heavy full-stack roles.
Across recent lower-match applications, cloud deployment evidence was repeatedly missing.
```

Insights must distinguish observation from recommendation.

## Private Talent Mode

Future private mode should let employed candidates specify:

- visible to verified recruiters only
- minimum compensation
- target roles
- locations/work modes
- availability
- organizations to block

Current employer blocking must be supported carefully and never promised as technically absolute if identity matching is uncertain.

## Candidate Privacy

Candidates should be able to understand and control:

- search visibility
- recruiter visibility
- contact permissions
- resume visibility
- blocked organizations
- private-mode status
- data deletion/export requests

Privacy controls should use plain language.

## Mobile Experience

Candidate workflows must work well on mobile:

- job browse/search
- match explanation
- apply
- screening questions
- application timeline
- messaging
- interview details
- profile edits

Resume comparison/review can use richer desktop layouts while remaining functional on mobile.

## Empty States

Examples:

Applications:

```text
You haven’t applied yet.
Explore roles where your profile has meaningful alignment.
```

Career Passport:

```text
Add your work history or import a resume to build your Career Passport.
Nothing is published to employers until your visibility settings allow it.
```

## Accessibility

Candidate UI must support:

- keyboard access
- screen readers
- accessible mobile controls
- sufficient contrast
- no information encoded only by color
- reduced motion
- understandable error messages

## Success Criterion

The candidate should leave each session knowing one of three things:

1. what opportunity is worth pursuing;
2. what hiring process needs attention;
3. what genuine profile/evidence improvement would make future applications stronger.
