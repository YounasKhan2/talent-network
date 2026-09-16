import {
  classifyCareerSectionHeading,
  getCareerPassportSectionDefinition,
} from '@talent-network/contracts';

type JsonRecord = Record<string, unknown>;

export interface CurrentAwardLike {
  title: string;
  issuer: string | null;
  awardedAt: Date | null;
  description: string | null;
  url: string | null;
}

export interface CurrentCustomSectionItemLike {
  title: string;
  subtitle: string | null;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  url: string | null;
}

export interface CurrentCustomSectionLike {
  title: string;
  description: string | null;
  sectionTypeKey: string | null;
  sourceHeading: string | null;
  classificationConfidence: number | null;
  classificationStatus: string | null;
  items: readonly CurrentCustomSectionItemLike[];
}

export function readApprovedResumeContact(
  proposal: JsonRecord,
  current: {
    contactFullName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    contactLocation: string | null;
  },
) {
  const identity = asRecord(proposal.identityCandidate);
  const location = firstLocation(proposal.locations);

  return {
    contactFullName: readStringClaim(identity?.fullName) ?? current.contactFullName,
    contactEmail: readStringClaim(identity?.email) ?? current.contactEmail,
    contactPhone: readStringClaim(identity?.phone) ?? current.contactPhone,
    contactLocation: location ?? current.contactLocation,
  };
}

export function mergeResumeAwards(
  current: readonly CurrentAwardLike[],
  additionalSections: unknown,
) {
  const rows = current.map((award, index) => ({
    title: award.title,
    issuer: award.issuer,
    awardedAt: award.awardedAt,
    description: award.description,
    url: award.url,
    sortOrder: index,
  }));
  const seen = new Set(rows.map((award) => normalize(award.title)));

  for (const section of readAdditionalSections(additionalSections)) {
    const classification = classifyCareerSectionHeading(section.heading);
    if (classification.typeKey !== 'AWARDS') continue;

    for (const entry of section.entries) {
      const { title, description } = splitEntry(entry);
      const key = normalize(title);
      if (!title || seen.has(key)) continue;
      rows.push({
        title,
        issuer: null,
        awardedAt: null,
        description,
        url: null,
        sortOrder: rows.length,
      });
      seen.add(key);
    }
  }

  return rows;
}

export function mergeResumeCustomSections(
  current: readonly CurrentCustomSectionLike[],
  additionalSections: unknown,
) {
  const rows = current.map((section, sectionIndex) => ({
    title: section.title,
    description: section.description,
    sectionTypeKey: section.sectionTypeKey,
    sourceHeading: section.sourceHeading,
    classificationConfidence: section.classificationConfidence,
    classificationStatus: section.classificationStatus,
    sortOrder: sectionIndex,
    items: {
      create: section.items.map((item, itemIndex) => ({
        title: item.title,
        subtitle: item.subtitle,
        description: item.description,
        startDate: item.startDate,
        endDate: item.endDate,
        url: item.url,
        sortOrder: itemIndex,
      })),
    },
  }));

  const seen = new Set(
    rows.map((section) =>
      section.sectionTypeKey && section.sectionTypeKey !== 'CUSTOM'
        ? `type:${section.sectionTypeKey}`
        : `title:${normalize(section.title)}`,
    ),
  );

  for (const section of readAdditionalSections(additionalSections)) {
    const classification = classifyCareerSectionHeading(section.heading);

    if (classification.typeKey === 'AWARDS') continue;
    if (classification.typeKey !== 'CUSTOM') {
      const definition = getCareerPassportSectionDefinition(classification.typeKey);
      if (definition.storage !== 'CUSTOM_SECTION') continue;
    }

    const key =
      classification.typeKey === 'CUSTOM'
        ? `title:${normalize(section.heading)}`
        : `type:${classification.typeKey}`;
    if (seen.has(key)) continue;

    rows.push({
      title: section.heading,
      description:
        classification.typeKey === 'CUSTOM'
          ? 'Preserved from an uploaded resume. Review or rename this section when ready.'
          : null,
      sectionTypeKey: classification.typeKey,
      sourceHeading: classification.originalHeading,
      classificationConfidence: classification.confidence,
      classificationStatus: classification.reviewStatus,
      sortOrder: rows.length,
      items: {
        create: section.entries.map((entry, itemIndex) => {
          const { title, description } = splitEntry(entry);
          return {
            title,
            subtitle: null,
            description,
            startDate: null,
            endDate: null,
            url: null,
            sortOrder: itemIndex,
          };
        }),
      },
    });
    seen.add(key);
  }

  return rows;
}

function readAdditionalSections(value: unknown): Array<{ heading: string; entries: string[] }> {
  const sections: Array<{ heading: string; entries: string[] }> = [];

  for (const raw of asArray(value)) {
    const section = asRecord(raw);
    const heading = readStringClaim(section?.heading);
    if (!heading) continue;
    const entries = asArray(section?.entries).map(readStringClaim).filter(isString);
    if (entries.length === 0) continue;
    sections.push({ heading, entries });
  }

  return sections;
}

function firstLocation(value: unknown): string | null {
  for (const raw of asArray(value)) {
    const location = asRecord(raw);
    const claim = readStringClaim(location?.value);
    if (claim) return claim;
  }
  return null;
}

function splitEntry(value: string): { title: string; description: string | null } {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const candidate = firstLine ?? normalized;
  const title = candidate.length <= 220 ? candidate : `${candidate.slice(0, 217).trimEnd()}...`;
  return {
    title,
    description: normalized !== title ? normalized : null,
  };
}

function readStringClaim(value: unknown): string | null {
  const claim = asRecord(value);
  return claim && typeof claim.value === 'string' && claim.value.trim() ? claim.value.trim() : null;
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function isString(value: string | null): value is string {
  return value !== null;
}
