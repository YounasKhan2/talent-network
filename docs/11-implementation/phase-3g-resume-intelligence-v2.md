# Phase 3G — Resume Intelligence Architecture V2

## Status

**PLANNED / ARCHITECTURE REVIEW — implementation must not begin until this document is reviewed and accepted.**

Phase 3G upgrades Talent Network from a source-grounded resume parser into a layout-aware, lossless document-understanding system designed for complex, diverse, real-world resumes and CVs.

This phase exists because the first complex five-page acceptance document exposed a structural truth: high claim confidence does not imply high resume understanding. The system correctly extracted several fields while still missing complete records and sections. Phase 3G addresses that class of failure at the architecture level rather than by adding document-specific regular expressions.

---

# 1. Why Phase 3G Exists

The current Phase 3 pipeline already provides strong foundations:

- private immutable resume sources
- deterministic PDF and DOCX extraction
- OCR fallback
- malware scanning
- versioned processing
- evidence-linked parsed claims
- schema validation
- candidate review
- immutable Career Passport versions
- open Career Passport section taxonomy
- privacy boundaries between Candidate and Organization contexts

Those foundations remain valid.

The weakness is in the middle of the pipeline:

```text
extracted document
      ↓
section detection
      ↓
typed parser
      ↓
structured proposal
```

A typed parser can currently fail to produce a record even when the source section was detected. When that happens, the document may still contain meaningful source material that is not represented in the typed output.

The first complex acceptance document demonstrated this directly:

```text
Source document                   Current observed result
─────────────────────────────────────────────────────────
Work Experience: 4 records        3 parsed
Education: 2 records              0 parsed
Projects: 3 records               0 parsed
Certifications: 5 records         0 parsed
Languages: 4 records              0 parsed
Links: 3 records                  3 parsed
Publications: 3 records           preserved path not yet surfaced in UI
Patents: 2 records                preserved path not yet surfaced in UI
Awards: 4 records                 preserved/import path implemented
Volunteer Experience: 1          preserved path not yet surfaced in UI
Professional Affiliations: 3     preserved path not yet surfaced in UI
Interests: 1                     preserved path not yet surfaced in UI
References: 3                    private-only policy
```

The UI simultaneously displayed a high confidence percentage, proving that confidence about emitted claims is not a substitute for source coverage.

Phase 3G is therefore not a patch phase. It is a document-intelligence architecture phase.

---

# 2. Research Basis

Phase 3G is informed by the common architectural patterns used by mature resume parsers, hyperscale document-AI systems, and layout-understanding research.

Representative systems and research reviewed include:

- Affinda Resume Parser
- RChilli Resume Parser and Resume Quality
- Textkernel Candidate Parser
- Google Document AI Layout Parser and Custom Extractor
- Microsoft Azure Document Intelligence / Content Understanding
- Amazon Textract
- Docling / DoclingDocument
- LayoutLM family
- DocLayNet
- PubTables-1M

The recurring pattern is consistent:

```text
raw document
    ↓
layout-aware document representation
    ↓
structural segmentation
    ↓
record/entity extraction
    ↓
normalization/taxonomy
    ↓
quality + confidence + coverage
    ↓
human review where needed
```

Serious systems do not treat a resume as only a plain text string.

Research references:

- Affinda response schema: https://resume-parser.affinda.com/docs/response-schema
- RChilli parser fields: https://docs.rchilli.com/kc/c_RChilli_resume_parser_fields
- RChilli resume quality: https://docs.rchilli.com/kc/c_Rchilli_resume_parser_resume_quality
- Textkernel candidate data model: https://developer.textkernel.com/Parser/master/data_model/candidate-data-model/
- Google Document AI Layout Parser: https://cloud.google.com/document-ai/docs/layout-parse-quickstart
- Google generative/custom extraction: https://cloud.google.com/document-ai/docs/ce-with-genai
- Azure Document Intelligence layout: https://learn.microsoft.com/azure/ai-services/document-intelligence/prebuilt/layout
- Azure Content Understanding documents: https://learn.microsoft.com/azure/ai-services/content-understanding/document/overview
- Amazon Textract document layout: https://docs.aws.amazon.com/textract/latest/dg/how-it-works-document-layout.html
- Docling document model: https://github.com/docling-project/docling/blob/main/docs/concepts/docling_document.md
- LayoutLM: https://arxiv.org/abs/1912.13318
- DocLayNet: https://research.ibm.com/publications/doclaynet-a-large-human-annotated-dataset-for-document-layout-segmentation
- PubTables-1M: https://arxiv.org/abs/2110.00061

These references guide architecture. They do not require Talent Network to adopt any specific commercial provider.

---

# 3. Phase 3G North Star

> Every meaningful source element must remain accounted for, even when Talent Network cannot yet understand it semantically.

The system may be uncertain.

The system may require candidate review.

The system may classify something as unknown.

The system must not silently lose meaningful resume content.

This becomes the defining Phase 3G invariant:

```text
meaningful source content
       ↓
MAPPED
or PARTIALLY_MAPPED
or UNMAPPED
or PRIVATE_ONLY
or INTENTIONALLY_IGNORED

never silently absent
```

---

# 4. Non-Negotiable Invariants

## 4.1 Candidate authority remains unchanged

A parsed resume remains a proposal.

```text
ResumeParseResult
      ≠
Career Passport authority
```

Only explicit candidate approval may create a new authoritative Career Passport version.

## 4.2 Source evidence remains authoritative

Every structured claim must remain traceable to source material where practical.

No model output may become an authoritative career fact without evidence and candidate approval.

## 4.3 Unknown is a valid state

Unknown content must not be forced into an incorrect known schema.

```text
UNKNOWN
!=
DISCARD
```

## 4.4 No confidence theatre

The product must not present one high confidence number as proof that the whole document was understood.

Confidence, document quality, structural confidence, and source coverage are separate concepts.

## 4.5 Account identity remains separate

Resume contact data may update candidate-approved professional contact information.

It must never silently change authentication identity, login email, credentials, or account security state.

## 4.6 Third-party personal data remains protected

References and similar third-party contact information may be extracted privately but must not become organization-visible Career Passport content without an explicit privacy design and candidate action.

## 4.7 Reprocessing remains reproducible

Every important algorithm/provider/configuration change must be versioned so historical outputs can be reproduced or rebuilt deliberately.

---

# 5. Target Architecture

```text
                         Resume / CV
                             │
                             ▼
                  ┌─────────────────────┐
                  │ Secure Ingestion    │
                  │ Phase 3A–3C         │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │ Format Extraction   │
                  │ PDF / DOCX / OCR    │
                  └──────────┬──────────┘
                             ▼
                ┌─────────────────────────┐
                │ DocumentGraph V1        │
                │ nodes + geometry        │
                │ hierarchy + order       │
                │ tables + lists + links  │
                └────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ Structural Understanding │
                │ section boundaries       │
                │ record boundaries        │
                │ columns / tables / lists │
                └────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ Career Ontology         │
                │ core / extension /      │
                │ custom / unknown        │
                └────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ Typed Extractors        │
                │ deterministic first     │
                │ semantic fallback       │
                └────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ Source Ledger           │
                │ consumed / partial /    │
                │ unmapped / private      │
                └────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ Reconciliation          │
                │ source vs mapped counts │
                │ duplicates / conflicts  │
                └────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ Quality Model           │
                │ extraction              │
                │ structure               │
                │ claim confidence        │
                │ source coverage         │
                └────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ Candidate Review V2     │
                │ mapped + unmapped       │
                │ evidence previews       │
                └────────────┬────────────┘
                             ▼
                     Career Passport
```

---

# 6. DocumentGraph V1

## Purpose

`ResumeDocument` remains the extracted artifact contract, but Phase 3G introduces a richer layout-aware intermediate representation called `DocumentGraph`.

The graph prevents downstream parsers from depending on one flattened text ordering.

## Conceptual contract

```ts
type DocumentNodeKind =
  | 'DOCUMENT'
  | 'PAGE'
  | 'REGION'
  | 'TITLE'
  | 'HEADING'
  | 'PARAGRAPH'
  | 'LIST'
  | 'LIST_ITEM'
  | 'TABLE'
  | 'TABLE_ROW'
  | 'TABLE_CELL'
  | 'KEY_VALUE'
  | 'LINK'
  | 'IMAGE'
  | 'OTHER';

interface DocumentNode {
  id: string;
  kind: DocumentNodeKind;
  text?: string;
  pageNumber: number | null;
  sourceRange?: SourceRange;
  boundingBox?: BoundingBox;
  parentId?: string;
  childIds: string[];
  readingOrder: number;
  extractionConfidence?: number;
  metadata?: Record<string, JsonValue>;
}

interface DocumentGraph {
  schemaVersion: 'resume-document-graph-v1';
  resumeVersionId: string;
  sourceExtractionId: string;
  nodes: DocumentNode[];
  pageIds: string[];
  extractionMethod: string;
  extractionVersion: string;
  warnings: DocumentGraphWarning[];
}
```

The actual implementation may differ, but the following properties are required:

- stable node identity
- source provenance
- hierarchy
- reading order
- geometry where available
- table structure
- list structure
- hyperlinks
- page identity where truthful
- no fabricated pagination for DOCX

## Format adapters

### PDF

Preserve where available:

- text spans
- line/block geometry
- page number
- font/style signals useful for headings
- links/annotations
- tables or inferred table regions
- column relationships
- images/figures only when relevant to information recovery

### DOCX

Preserve:

- paragraphs
- heading styles
- lists
- tables
- rows
- cells
- hyperlinks
- document order
- section relationships

DOCX must not invent physical pages.

### OCR

Preserve:

- page identity
- OCR text
- word/line geometry where supported
- OCR confidence
- reading-order signals

---

# 7. Structural Understanding Layer

This layer answers document questions, not career questions.

Examples:

```text
This is a heading.
These 5 rows belong to this table.
These paragraphs belong under this heading.
These blocks form one logical record.
These blocks are two independent columns.
This date is visually aligned with this role title.
```

It must not yet decide:

```text
This is a CandidateCertification.
This is a WorkExperience.
```

That belongs to semantic extraction.

## Structural outputs

```ts
interface StructuralSection {
  id: string;
  headingNodeId: string | null;
  headingText: string | null;
  nodeIds: string[];
  sourceOrder: number;
  sectionBoundaryConfidence: number;
}

interface StructuralRecord {
  id: string;
  sectionId: string;
  nodeIds: string[];
  sourceOrder: number;
  recordBoundaryConfidence: number;
}
```

Record detection is essential because section-level detection alone cannot prove completeness.

---

# 8. Career Ontology Layer

The shared Career Passport taxonomy becomes the semantic registry used by resume understanding.

## Core Career Passport types

These remain first-class domain concepts:

```text
CONTACT_INFORMATION
PROFESSIONAL_SUMMARY
WORK_EXPERIENCE
EDUCATION
SKILLS
CERTIFICATIONS
AWARDS
```

## Recognized extensions

Examples include:

```text
PROJECTS
PORTFOLIO
LANGUAGES
INTERESTS
REFERENCES
LINKS
PUBLICATIONS
VOLUNTEERING
PATENTS
RESEARCH
COURSES
MEMBERSHIPS
OPEN_SOURCE
SPEAKING
TRAINING
HACKATHONS
TEACHING
COMMUNITY_LEADERSHIP
MILITARY_SERVICE
CASE_STUDIES
CLIENTS
MEDIA_COVERAGE
```

## Unknown/custom content

Any section that cannot be confidently classified remains:

```text
CUSTOM
classificationStatus = NEEDS_REVIEW
```

The original heading and source nodes are retained.

## Classification inputs

Section classification may use:

- normalized heading
- known aliases
- content semantics
- expected record shape
- date patterns
- organization/person patterns
- links
- neighboring sections
- layout structure

It must not depend only on exact string matching.

---

# 9. Typed Extraction Strategy

Phase 3G uses a hybrid extraction architecture.

```text
structural record
       ↓
high-certainty deterministic extractor
       ↓ if unresolved
schema-aware semantic extractor
       ↓ if unresolved
model/provider fallback when justified
       ↓
validation + evidence reconciliation
```

## Deterministic first

Use deterministic logic where the source structure is strong:

- explicit table columns
- exact URLs
- explicit email/phone values
- normalized date ranges
- obvious label/value structures
- well-known heading aliases

## Semantic extraction

Semantic extraction is used where meaning depends on context:

- role vs organization
- qualification vs field of study
- publication title vs venue
- patent title vs identifier
- award title vs issuer
- ambiguous project records

## Model fallback

A model/provider may be introduced only after a capability gate covering:

- accuracy on Talent Resume Benchmark
- privacy and data handling
- licensing
- cost
- latency
- concurrency/rate limits
- failure modes
- version stability
- deployment model
- observability
- testability
- vendor lock-in / exit strategy

No provider becomes the source of truth.

---

# 10. Source Ledger

The Source Ledger is the central Phase 3G losslessness mechanism.

Every meaningful structural node or record must have an accounting state.

```ts
type SourceLedgerStatus =
  | 'UNPROCESSED'
  | 'CLASSIFIED'
  | 'MAPPED'
  | 'PARTIALLY_MAPPED'
  | 'UNMAPPED'
  | 'PRIVATE_ONLY'
  | 'INTENTIONALLY_IGNORED';
```

Conceptually:

```ts
interface SourceLedgerEntry {
  sourceId: string;
  sourceKind: 'SECTION' | 'RECORD' | 'NODE';
  status: SourceLedgerStatus;
  semanticTypeKey?: string;
  mappedClaimIds: string[];
  reasonCode?: string;
  reviewRequired: boolean;
}
```

## Hard invariant

A proposal may not report `COMPLETE` source coverage while any meaningful source entry remains `UNPROCESSED`.

## Intentional ignore examples

Content may be intentionally ignored only with a documented reason, such as:

- decorative separator
- page number
- duplicated running header/footer
- explicit synthetic QA footer
- non-career legal boilerplate

The reason remains recorded.

---

# 11. Record-Level Reconciliation

Section detection is not enough.

For every record-oriented section, Phase 3G should reconcile:

```text
sourceRecordCount
mappedRecordCount
partiallyMappedRecordCount
unmappedRecordCount
```

Example:

```text
Experience
source records:       4
mapped records:       3
partially mapped:     0
unmapped records:     1
record coverage:      75%
```

This prevents `Experience: DETECTED` from hiding a missing fourth job.

## Initial record-oriented types

Record reconciliation should cover at least:

- Work Experience
- Education
- Projects
- Certifications
- Awards
- Publications
- Patents
- Volunteering
- Professional Memberships/Affiliations
- Courses
- Research entries where record-shaped
- References, with private-only treatment

Skills/languages may use item-level rather than record-level reconciliation.

---

# 12. Quality and Confidence Model

Phase 3G removes the concept of one misleading universal confidence number.

The review experience must distinguish at least four dimensions.

## 12.1 Document extraction quality

Question:

> Did we successfully read the source artifact?

Possible signals:

- readable pages
- extracted text density
- OCR confidence
- corrupt characters
- truncation
- page coverage

## 12.2 Structural confidence

Question:

> How confident are we about reading order, section boundaries, tables, columns, and record boundaries?

## 12.3 Claim confidence

Question:

> For the claims we emitted, how confident are we that they mean what the schema says they mean?

This replaces the current UI label `Overall confidence`.

## 12.4 Source coverage

Question:

> How much meaningful source information has been accounted for?

Conceptually:

```text
accounted meaningful source weight
────────────────────────────────
total meaningful source weight
```

Coverage is not the same as confidence.

## Review summary target

```text
Document quality      98%
Structural confidence 93%
Claim confidence      94%
Source coverage       89%
Needs review          6 records
```

Percentages are allowed only when their derivation is explicit and testable.

---

# 13. Diagnostics Model

Phase 3G introduces explicit parser/quality diagnostics.

Initial diagnostic codes should include concepts such as:

```text
UNMAPPED_SECTION
UNMAPPED_RECORD
PARTIALLY_MAPPED_RECORD
READING_ORDER_UNCERTAIN
MULTI_COLUMN_LAYOUT_UNCERTAIN
TABLE_STRUCTURE_UNCERTAIN
SECTION_BOUNDARY_UNCERTAIN
RECORD_BOUNDARY_UNCERTAIN
OCR_LOW_QUALITY
TRUNCATED_INPUT
DUPLICATE_RECORD
CONFLICTING_VALUES
DATE_RANGE_AMBIGUOUS
CONTACT_CONFLICT
PRIVATE_THIRD_PARTY_DATA
```

Diagnostics are candidate-private and must not leak raw resume content into normal logs.

---

# 14. Candidate Review V2

The review UI must expose completeness, not only successful output.

## Target summary

```text
Resume understanding

Document quality       98%
Source coverage         96%
Claim confidence        93%
Needs review             3
```

## Section presentation

Example:

```text
CORE
Experience             4 / 4 mapped
Education              2 / 2 mapped
Skills                  67 detected
Certifications          5 / 5 mapped
Awards                  4 / 4 mapped

ADDITIONAL
Projects                3 / 3 mapped
Publications            3 / 3 mapped
Patents                 2 / 2 mapped
Volunteer Experience    1 / 1 mapped
Professional Affiliations 3 / 3 mapped
Interests               preserved
References              3 private-only

NEEDS REVIEW
Industry Activities     unknown section · preserved
```

## Source-linked review

Where possible, review items should support:

```text
structured proposal
      ↕
source evidence preview
```

The candidate should be able to understand why the system proposed a value.

## Review actions

Future review actions may include:

- accept record
- edit record
- ignore record
- classify unknown section
- keep as custom section
- mark private-only

Bulk Accept remains possible only when unresolved diagnostics are appropriately surfaced.

---

# 15. Career Passport Mapping

## Core sections

Resume-approved values map into the seven first-class Career Passport sections:

1. Contact Information
2. Professional Summary
3. Work Experience
4. Education
5. Skills
6. Certifications
7. Awards

## Additional sections

Recognized extensions may use typed existing storage where appropriate or generalized extension/custom-section storage.

## Unknown sections

Unknown sections map only after candidate review or remain preserved in the resume proposal.

They must keep:

- original heading
- normalized heading
- classification candidates when available
- classification confidence
- source evidence
- source order

## References

References remain `PRIVATE_ONLY` by default.

They must not automatically become recruiter-visible Career Passport data.

---

# 16. Benchmark and Evaluation Program

Phase 3G is not complete based on one successful fixture.

Talent Network needs a permanent Resume Intelligence Benchmark.

## Dataset strategy

Start with approximately 100–250 deliberately diverse fixtures during 3G development, then grow toward 500–1,000+ before production maturity.

Allowed sources should be privacy/legal-safe:

- synthetic generated resumes
- internally authored fixtures
- licensed template datasets
- public samples whose terms permit use
- candidate-consented anonymized examples where appropriate

Do not build the benchmark from scraped private resumes without permission.

## Coverage dimensions

Fixtures should intentionally cover:

```text
PDF with native text
scanned PDF
DOCX
one column
two column
three column
mixed columns
complex tables
nested tables
text boxes
headers / footers
timelines
icon-heavy layouts
ATS-simple layouts
designer resumes
academic CVs
research CVs
executive resumes
junior resumes
20+ year careers
1-page resumes
10+ page CVs
multilingual documents
RTL layouts
mixed languages
poor scans
rotated pages
unusual headings
no headings
duplicate headings
project-heavy resumes
publication-heavy CVs
certification-heavy CVs
portfolio-heavy resumes
references with third-party PII
```

## Ground truth

Each benchmark fixture should define expected:

- sections
- section boundaries
- records
- field values where practical
- source locations/evidence
- private-only regions
- intentionally ignored regions

## Metrics

At minimum:

```text
section detection precision / recall / F1
record detection precision / recall / F1
field precision / recall / F1
exact-value accuracy
normalized-value accuracy
evidence-grounding accuracy
record-boundary accuracy
reading-order accuracy
unknown-section preservation rate
meaningful-source accounting rate
privacy leakage rate
```

## Architectural target metrics

These should be treated differently from probabilistic semantic accuracy:

```text
Unknown-section preservation rate  → target 100%
Meaningful-source accounting rate   → target 100%
Cross-candidate privacy violations  → target 0
Organization exposure of private refs → target 0
```

The semantic extraction metrics will improve iteratively through benchmark-driven development.

---

# 17. Golden Complex Fixture Acceptance

The first five-page complex QA resume becomes the initial Phase 3G golden acceptance case.

Expected source truth:

```text
Contact Information       present
Professional Summary      1
Work Experience           4
Education                 2
Skills/Core Competencies  present
Projects                  3
Certifications            5
Languages                 4
Professional Links        3
Publications              3
Patents                   2
Awards & Honors           4
Volunteer Experience      1
Professional Affiliations 3
Interests                 1 section
References                3 private-only records
```

## Phase 3G acceptance expectation

The implementation is not required to auto-normalize every field perfectly in the first slice.

It **is** required to ensure that all meaningful content is accounted for.

For example, this is acceptable during an intermediate slice:

```text
Education
source records: 2
mapped: 1
unmapped: 1
coverage: 50%
review required: yes
```

This is not acceptable:

```text
Education: 1
```

with no indication that another source record existed.

Final 3G runtime closure should aim for the complete expected record matrix on this fixture while also passing unrelated benchmark documents, proving the parser was not overfit to one resume.

---

# 18. Differential Benchmarking

Where licensing/trial access permits, representative benchmark fixtures may be compared with mature commercial parsers such as Affinda, RChilli, or Textkernel.

The purpose is not to copy vendor output.

The purpose is to establish external baselines for:

- section recall
- record recall
- field accuracy
- normalization
- table handling
- custom-section handling

Talent Network must retain its own source evidence, privacy model, Career Passport ontology, and candidate-authority rules regardless of provider behavior.

---

# 19. Provider / Tool Adoption Rule

No new OCR, document-layout, embedding, LLM, ML, parsing, database, queue, or infrastructure dependency may enter Phase 3G without a short capability review.

The review must evaluate:

- required capability
- official recommended integration
- TypeScript/NestJS/worker fit
- privacy/security
- licensing
- cost
- maintenance
- deployment
- CPU/GPU/memory requirements
- concurrency/scaling
- failure modes
- version stability
- provider lock-in
- exit strategy
- testing strategy
- benchmark performance

Integrations must sit behind Talent Network-owned interfaces.

---

# 20. Phase 3G Implementation Slices

## 3G-A — Contracts, benchmark harness, and quality vocabulary

Deliver:

- DocumentGraph V1 contract
- Source Ledger contract
- structural section/record contracts
- diagnostics vocabulary
- quality/confidence/coverage contract
- golden complex fixture expectations
- benchmark runner skeleton

Quality gate:

- no production parser behavior change yet
- contracts compile and are versioned
- benchmark can express source truth independently from parser output

## 3G-B — Layout-aware DocumentGraph builders

Deliver:

- PDF → DocumentGraph adapter
- DOCX → DocumentGraph adapter
- OCR → DocumentGraph adapter
- hierarchy/reading-order preservation
- table/list/link nodes
- extraction warnings

Quality gate:

- source ranges remain truthful
- DOCX pagination remains null
- PDF page/geometry preserved
- complex fixture table/list structure visible in graph

## 3G-C — Structural section and record detection

Deliver:

- layout-aware heading detection
- section boundaries
- record boundaries
- table-row records
- multi-column reading-order handling
- record-boundary confidence

Quality gate:

- complex fixture discovers the correct source record counts before semantic parsing
- no career schema required to count records

## 3G-D — Source Ledger + reconciliation

Deliver:

- source accounting state
- claim → source mapping
- section and record reconciliation
- unmapped/partial/private-only states
- coverage calculation

Quality gate:

- no meaningful fixture record can disappear silently
- unprocessed meaningful nodes prevent `COMPLETE` coverage

## 3G-E — Core typed extractors V2

Deliver robust extraction for the seven default Career Passport domains:

- Contact Information
- Professional Summary
- Work Experience
- Education
- Skills
- Certifications
- Awards

Quality gate:

- typed extractors consume structural records rather than raw flattened text
- unresolved records remain preserved in Source Ledger

## 3G-F — Extension extractors + open-world fallback

Deliver:

- Projects & Portfolio
- Languages & Interests
- Links
- Publications
- Volunteering
- Patents
- Research
- Courses
- Memberships/Affiliations
- Open Source
- other recognized extension types
- generic unknown/custom preservation
- References private-only policy

Quality gate:

- recognized extensions can be mapped without schema redesign
- unknown headings/content remain lossless

## 3G-G — Semantic recovery provider capability gate

Research and benchmark candidate semantic-recovery approaches.

Potential approaches may include:

- local deterministic/ML models
- layout-aware open-source models
- LLM through existing AI Gateway
- managed document-AI providers
- commercial resume-parser adapters for benchmarking or fallback

No provider is selected in advance.

Quality gate:

- benchmark demonstrates measurable improvement over deterministic-only baseline
- provider privacy/cost/latency/license review approved
- provider failure degrades safely to preserved unmapped content

## 3G-H — Candidate Review UX V2

Deliver:

- Claim confidence label
- Source coverage
- document/structural quality indicators
- mapped/unmapped counts
- additional sections
- unknown-section review
- private References treatment
- source evidence previews where practical

Quality gate:

- UI cannot imply full understanding when coverage is incomplete
- candidate can see unresolved content before approval

## 3G-I — Benchmark expansion + regression gate

Deliver:

- diverse fixture set
- ground-truth annotations
- evaluation metrics
- regression reports
- benchmark thresholds in CI where stable

Quality gate:

- improvements cannot silently regress previously passing document classes

## 3G-J — Runtime closure

Deliver real application acceptance through:

```text
upload
→ scan
→ extract/OCR
→ DocumentGraph
→ structural understanding
→ semantic extraction
→ Source Ledger reconciliation
→ candidate review
→ Career Passport
```

Closure requires:

- golden complex fixture acceptance
- multiple unrelated complex PDF/DOCX fixtures
- private References behavior
- unknown-section preservation
- source-accounting proof
- root quality gate
- documentation synchronized with verified behavior

---

# 21. Backward Compatibility and Migration

Phase 3G must use expand/contract evolution.

Existing persisted artifacts remain valid:

- Resume
- ResumeVersion
- ResumeExtraction
- historical ResumeParseResult
- ResumeReview
- CandidateProfileVersion

New graph/ledger structures are derived and rebuildable.

Historical parser versions must remain identifiable.

A new parser/graph version must create a new derived result rather than rewriting old results in place.

No destructive data migration is justified merely to introduce DocumentGraph.

---

# 22. Scalability Model

The architecture must allow different stages to scale independently.

Conceptual pools:

```text
scan workers
native extraction workers
OCR workers
layout/document-graph workers
semantic parse workers
model/provider workers
```

Early deployments may colocate these capabilities inside the same worker application, but queue boundaries and concurrency controls should remain explicit.

Expensive semantic/model work should run only for unresolved records rather than repeatedly sending an entire resume through a costly provider.

---

# 23. Observability

Phase 3G should add metrics for:

- DocumentGraph build success/failure
- structural detection latency
- section count distribution
- record count distribution
- mapped/partial/unmapped rates
- source coverage distribution
- diagnostic code frequency
- model fallback rate
- candidate correction rate
- provider latency/error/cost where applicable
- benchmark regression trends

Raw resume text and sensitive parsed data must not appear in normal logs or metrics labels.

---

# 24. Security and Privacy

Document processing remains a high-risk execution surface.

Controls continue to include:

- malware scanning before extraction
- private object storage
- candidate ownership checks
- no organization access to raw resumes
- bounded parsing resources
- isolated document/OCR tooling where practical
- no unnecessary network access for local parsing components
- metadata-only audit/outbox events
- private treatment for third-party references
- deletion of rebuildable derived artifacts with source resume deletion where policy requires

Any external semantic provider must pass the data-handling/privacy review before receiving resume content.

---

# 25. Explicit Non-Goals

Phase 3G does not promise:

- perfect semantic extraction for every document ever created
- zero human review
- universal language support in the first slice
- automatic trust/verification of resume claims
- fraud detection
- recruiter access to raw candidate resumes outside explicit application-sharing rules
- one permanent AI/document provider

The goal is stronger:

> no silent loss, measurable understanding, source-grounded extraction, and a system that can improve safely over time.

---

# 26. Definition of Done

Phase 3G is not closed until all of the following are demonstrated:

1. layout-aware `DocumentGraph` exists for PDF, DOCX, and OCR flows
2. section and record boundaries are explicit derived data
3. all meaningful source records are accounted for by Source Ledger
4. unprocessed meaningful records prevent complete coverage
5. core Career Passport sections use structural records rather than flattened-text-only parsing
6. known extension sections flow through the same architecture
7. unknown sections are preserved without schema changes
8. References remain private by default
9. quality, claim confidence, and source coverage are distinct
10. review UI exposes unresolved content before approval
11. parser/provider changes remain versioned/rebuildable
12. benchmark metrics are produced from ground truth
13. golden five-page fixture reaches the expected record matrix without document-specific hacks
14. unrelated complex fixtures also pass agreed thresholds
15. candidate/organization privacy tests remain green
16. complete root quality gate is green
17. architecture/implementation docs match verified behavior

---

# 27. Documentation Maintenance Rule

Phase 3G documentation is part of the implementation contract.

Every verified slice must update this document in the same development cycle with:

- status
- delivered contracts
- architecture deviations
- benchmark results
- accepted limitations
- new dependencies/providers and their capability review
- runtime acceptance evidence
- relevant commit baseline

Do not mark a slice `VERIFIED` from code inspection alone.

Verification requires observed tests/runtime evidence appropriate to the slice.

---

# 28. Current Planned Checkpoint

```text
3G Resume Intelligence Architecture V2       🟡 PLANNED / REVIEW

3G-A Contracts + benchmark vocabulary         ⬜ NOT STARTED
3G-B Layout-aware DocumentGraph               ⬜ NOT STARTED
3G-C Structural section/record detection      ⬜ NOT STARTED
3G-D Source Ledger + reconciliation           ⬜ NOT STARTED
3G-E Core typed extractors V2                 ⬜ NOT STARTED
3G-F Extensions + open-world fallback         ⬜ NOT STARTED
3G-G Semantic recovery capability gate        ⬜ NOT STARTED
3G-H Candidate Review UX V2                   ⬜ NOT STARTED
3G-I Benchmark expansion + regression gate    ⬜ NOT STARTED
3G-J Runtime closure                          ⬜ NOT STARTED
```

Implementation begins only after architecture review of this plan.
