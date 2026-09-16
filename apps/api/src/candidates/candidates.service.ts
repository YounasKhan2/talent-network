import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatabaseClient } from '@talent-network/database';
import { DATABASE_CLIENT } from '../database/database.module.js';
import { writeAuditEvent, writeOutboxEvent } from '../events/transactional-events.js';

export interface CandidateContactInformationInput {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
}

export interface CandidateProfileOverviewInput {
  headline?: string | null;
  summary?: string | null;
  availabilityStatus?: 'IMMEDIATE' | 'NOTICE_PERIOD' | 'OPEN_TO_OFFERS' | 'NOT_LOOKING' | null;
  availableFrom?: Date | null;
  compensationCurrency?: string | null;
  compensationMinimum?: number | null;
  compensationTarget?: number | null;
  compensationPeriod?: string | null;
  preferredWorkModes?: Array<'REMOTE' | 'HYBRID' | 'ONSITE' | 'FLEXIBLE'>;
  preferredEmploymentTypes?: string[];
}

export interface CandidateSettingsInput {
  visibility?: 'PRIVATE' | 'NETWORK' | 'VERIFIED_RECRUITERS';
  discoverability?: 'HIDDEN' | 'SEARCHABLE';
  primaryLocale?: string;
  timezone?: string;
}

export interface CandidateSkillInput {
  name: string;
  proficiency: string | null;
  experienceMonths: number | null;
  lastUsedAt: Date | null;
}

export interface CandidateEmploymentInput {
  companyName: string;
  title: string;
  employmentType: string | null;
  location: string | null;
  workMode: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'FLEXIBLE' | null;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
  summary: string | null;
}

export interface CandidateEducationInput {
  institutionName: string;
  degree: string | null;
  fieldOfStudy: string | null;
  location: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
  description: string | null;
}

export interface CandidateProjectInput {
  name: string;
  description: string | null;
  role: string | null;
  url: string | null;
  repositoryUrl: string | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface CandidateCertificationInput {
  name: string;
  issuer: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
}

export interface CandidateAwardInput {
  title: string;
  issuer: string | null;
  awardedAt: Date | null;
  description: string | null;
  url: string | null;
}

export interface CandidateLanguageInput {
  name: string;
  proficiency: string | null;
}

export interface CandidateLinkInput {
  label: string;
  url: string;
  kind: string | null;
}

export interface CandidateLocationPreferenceInput {
  label: string;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  remoteOnly: boolean;
}

export interface CandidateCustomSectionItemInput {
  title: string;
  subtitle: string | null;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  url: string | null;
}

export interface CandidateCustomSectionInput {
  title: string;
  description: string | null;
  sectionTypeKey: string | null;
  sourceHeading: string | null;
  classificationConfidence: number | null;
  classificationStatus: string | null;
  items: CandidateCustomSectionItemInput[];
}

const profileInclude = {
  employments: { orderBy: { sortOrder: 'asc' as const } },
  education: { orderBy: { sortOrder: 'asc' as const } },
  skills: { orderBy: { sortOrder: 'asc' as const } },
  projects: { orderBy: { sortOrder: 'asc' as const } },
  certifications: { orderBy: { sortOrder: 'asc' as const } },
  awards: { orderBy: { sortOrder: 'asc' as const } },
  languages: { orderBy: { sortOrder: 'asc' as const } },
  links: { orderBy: { sortOrder: 'asc' as const } },
  locationPreferences: { orderBy: { sortOrder: 'asc' as const } },
  customSections: {
    orderBy: { sortOrder: 'asc' as const },
    include: { items: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

@Injectable()
export class CandidatesService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async initialize(userId: string) {
    const existing = await this.database.candidate.findUnique({
      where: { userId },
      include: { currentProfileVersion: { include: profileInclude } },
    });
    if (existing) return existing;

    const candidateId = await this.database.$transaction(async (transaction) => {
      const candidate = await transaction.candidate.create({ data: { userId } });
      const version = await transaction.candidateProfileVersion.create({
        data: {
          candidateId: candidate.id,
          versionNumber: 1,
          status: 'APPROVED',
          source: 'SYSTEM',
          approvedAt: new Date(),
          preferredWorkModes: [],
          preferredEmploymentTypes: [],
        },
      });
      await transaction.candidate.update({
        where: { id: candidate.id },
        data: { currentProfileVersionId: version.id },
      });
      await writeAuditEvent(transaction, {
        actorType: 'USER',
        actorId: userId,
        action: 'candidate.passport.created',
        resourceType: 'Candidate',
        resourceId: candidate.id,
      });
      await writeOutboxEvent(transaction, {
        aggregateType: 'Candidate',
        aggregateId: candidate.id,
        eventType: 'candidate.passport.created',
        payload: { candidateId: candidate.id, userId, profileVersionId: version.id },
      });
      return candidate.id;
    });

    return this.database.candidate.findUniqueOrThrow({
      where: { id: candidateId },
      include: { currentProfileVersion: { include: profileInclude } },
    });
  }

  async getPassport(userId: string) {
    const candidate = await this.database.candidate.findUnique({
      where: { userId },
      include: { currentProfileVersion: { include: profileInclude } },
    });
    if (!candidate) throw candidateNotInitialized();
    return candidate;
  }

  async updateSettings(userId: string, input: CandidateSettingsInput) {
    const candidate = await this.requireCandidate(userId);
    return this.database.$transaction(async (transaction) => {
      const updated = await transaction.candidate.update({
        where: { id: candidate.id },
        data: input,
      });
      await writeAuditEvent(transaction, {
        actorType: 'USER',
        actorId: userId,
        action: 'candidate.settings.updated',
        resourceType: 'Candidate',
        resourceId: candidate.id,
        metadata: { visibility: updated.visibility, discoverability: updated.discoverability },
      });
      await writeOutboxEvent(transaction, {
        aggregateType: 'Candidate',
        aggregateId: candidate.id,
        eventType: 'candidate.settings.updated',
        payload: { candidateId: candidate.id },
      });
      return updated;
    });
  }

  updateContactInformation(userId: string, contactInformation: CandidateContactInformationInput) {
    return this.createNextVersion(userId, { contactInformation });
  }

  updateOverview(userId: string, input: CandidateProfileOverviewInput) {
    return this.createNextVersion(userId, { overview: input });
  }

  replaceSkills(userId: string, skills: CandidateSkillInput[]) {
    return this.createNextVersion(userId, { skills });
  }

  replaceEmployment(userId: string, employments: CandidateEmploymentInput[]) {
    return this.createNextVersion(userId, { employments });
  }

  replaceEducation(userId: string, education: CandidateEducationInput[]) {
    return this.createNextVersion(userId, { education });
  }

  replaceProjects(userId: string, projects: CandidateProjectInput[]) {
    return this.createNextVersion(userId, { projects });
  }

  replaceCertifications(userId: string, certifications: CandidateCertificationInput[]) {
    return this.createNextVersion(userId, { certifications });
  }

  replaceAwards(userId: string, awards: CandidateAwardInput[]) {
    return this.createNextVersion(userId, { awards });
  }

  replaceLanguages(userId: string, languages: CandidateLanguageInput[]) {
    return this.createNextVersion(userId, { languages });
  }

  replaceLinks(userId: string, links: CandidateLinkInput[]) {
    return this.createNextVersion(userId, { links });
  }

  replaceLocationPreferences(
    userId: string,
    locationPreferences: CandidateLocationPreferenceInput[],
  ) {
    return this.createNextVersion(userId, { locationPreferences });
  }

  replaceCustomSections(userId: string, customSections: CandidateCustomSectionInput[]) {
    return this.createNextVersion(userId, { customSections });
  }

  private async requireCandidate(userId: string) {
    const candidate = await this.database.candidate.findUnique({ where: { userId } });
    if (!candidate) throw candidateNotInitialized();
    return candidate;
  }

  private async createNextVersion(
    userId: string,
    replacement: {
      contactInformation?: CandidateContactInformationInput;
      overview?: CandidateProfileOverviewInput;
      skills?: CandidateSkillInput[];
      employments?: CandidateEmploymentInput[];
      education?: CandidateEducationInput[];
      projects?: CandidateProjectInput[];
      certifications?: CandidateCertificationInput[];
      awards?: CandidateAwardInput[];
      languages?: CandidateLanguageInput[];
      links?: CandidateLinkInput[];
      locationPreferences?: CandidateLocationPreferenceInput[];
      customSections?: CandidateCustomSectionInput[];
    },
  ) {
    const candidate = await this.database.candidate.findUnique({
      where: { userId },
      include: { currentProfileVersion: { include: profileInclude } },
    });
    if (!candidate?.currentProfileVersion) throw candidateNotInitialized();

    const current = candidate.currentProfileVersion;
    const contactInformation = replacement.contactInformation;
    const overview = replacement.overview;
    const employments = replacement.employments ?? current.employments;
    const education = replacement.education ?? current.education;
    const skills = replacement.skills ?? current.skills;
    const projects = replacement.projects ?? current.projects;
    const certifications = replacement.certifications ?? current.certifications;
    const awards = replacement.awards ?? current.awards;
    const languages = replacement.languages ?? current.languages;
    const links = replacement.links ?? current.links;
    const locationPreferences = replacement.locationPreferences ?? current.locationPreferences;
    const customSections = replacement.customSections ?? current.customSections;

    await this.database.$transaction(async (transaction) => {
      const next = await transaction.candidateProfileVersion.create({
        data: {
          candidateId: candidate.id,
          versionNumber: current.versionNumber + 1,
          status: 'APPROVED',
          source: 'MANUAL',
          contactFullName: contactInformation ? contactInformation.fullName : current.contactFullName,
          contactEmail: contactInformation ? contactInformation.email : current.contactEmail,
          contactPhone: contactInformation ? contactInformation.phone : current.contactPhone,
          contactLocation: contactInformation ? contactInformation.location : current.contactLocation,
          headline: overview?.headline !== undefined ? overview.headline : current.headline,
          summary: overview?.summary !== undefined ? overview.summary : current.summary,
          availabilityStatus:
            overview?.availabilityStatus !== undefined
              ? overview.availabilityStatus
              : current.availabilityStatus,
          availableFrom:
            overview?.availableFrom !== undefined ? overview.availableFrom : current.availableFrom,
          compensationCurrency:
            overview?.compensationCurrency !== undefined
              ? overview.compensationCurrency
              : current.compensationCurrency,
          compensationMinimum:
            overview?.compensationMinimum !== undefined
              ? overview.compensationMinimum
              : current.compensationMinimum,
          compensationTarget:
            overview?.compensationTarget !== undefined
              ? overview.compensationTarget
              : current.compensationTarget,
          compensationPeriod:
            overview?.compensationPeriod !== undefined
              ? overview.compensationPeriod
              : current.compensationPeriod,
          preferredWorkModes: overview?.preferredWorkModes ?? current.preferredWorkModes,
          preferredEmploymentTypes:
            overview?.preferredEmploymentTypes ?? current.preferredEmploymentTypes,
          approvedAt: new Date(),
          employments: {
            create: employments.map((employment, index) => ({
              companyName: employment.companyName,
              title: employment.title,
              employmentType: employment.employmentType,
              location: employment.location,
              workMode: employment.workMode,
              startDate: employment.startDate,
              endDate: employment.endDate,
              isCurrent: employment.isCurrent,
              summary: employment.summary,
              sortOrder: index,
            })),
          },
          education: {
            create: education.map((item, index) => ({
              institutionName: item.institutionName,
              degree: item.degree,
              fieldOfStudy: item.fieldOfStudy,
              location: item.location,
              startDate: item.startDate,
              endDate: item.endDate,
              isCurrent: item.isCurrent,
              description: item.description,
              sortOrder: index,
            })),
          },
          skills: {
            create: skills.map((skill, index) => ({
              name: skill.name,
              normalizedName: normalizeSkillName(skill.name),
              proficiency: skill.proficiency,
              experienceMonths: skill.experienceMonths,
              lastUsedAt: skill.lastUsedAt,
              sortOrder: index,
            })),
          },
          projects: {
            create: projects.map((project, index) => ({
              name: project.name,
              description: project.description,
              role: project.role,
              url: project.url,
              repositoryUrl: project.repositoryUrl,
              startDate: project.startDate,
              endDate: project.endDate,
              sortOrder: index,
            })),
          },
          certifications: {
            create: certifications.map((certification, index) => ({
              name: certification.name,
              issuer: certification.issuer,
              credentialId: certification.credentialId,
              credentialUrl: certification.credentialUrl,
              issuedAt: certification.issuedAt,
              expiresAt: certification.expiresAt,
              sortOrder: index,
            })),
          },
          awards: {
            create: awards.map((award, index) => ({
              title: award.title,
              issuer: award.issuer,
              awardedAt: award.awardedAt,
              description: award.description,
              url: award.url,
              sortOrder: index,
            })),
          },
          languages: {
            create: languages.map((language, index) => ({
              name: language.name,
              proficiency: language.proficiency,
              sortOrder: index,
            })),
          },
          links: {
            create: links.map((link, index) => ({
              label: link.label,
              url: link.url,
              kind: link.kind,
              sortOrder: index,
            })),
          },
          locationPreferences: {
            create: locationPreferences.map((location, index) => ({
              label: location.label,
              countryCode: location.countryCode,
              region: location.region,
              city: location.city,
              remoteOnly: location.remoteOnly,
              sortOrder: index,
            })),
          },
          customSections: {
            create: customSections.map((section, sectionIndex) => ({
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
            })),
          },
        },
      });
      await transaction.candidateProfileVersion.update({
        where: { id: current.id },
        data: { status: 'SUPERSEDED' },
      });
      await transaction.candidate.update({
        where: { id: candidate.id },
        data: { currentProfileVersionId: next.id },
      });
      await writeAuditEvent(transaction, {
        actorType: 'USER',
        actorId: userId,
        action: 'candidate.passport.updated',
        resourceType: 'CandidateProfileVersion',
        resourceId: next.id,
        metadata: { candidateId: candidate.id, versionNumber: next.versionNumber },
      });
      await writeOutboxEvent(transaction, {
        aggregateType: 'Candidate',
        aggregateId: candidate.id,
        eventType: 'candidate.passport.updated',
        payload: {
          candidateId: candidate.id,
          profileVersionId: next.id,
          versionNumber: next.versionNumber,
        },
      });
    });

    return this.database.candidate.findUniqueOrThrow({
      where: { id: candidate.id },
      include: { currentProfileVersion: { include: profileInclude } },
    });
  }
}

function candidateNotInitialized(): NotFoundException {
  return new NotFoundException({
    code: 'CANDIDATE_PASSPORT_NOT_INITIALIZED',
    message: 'Candidate Career Passport has not been initialized yet.',
  });
}

function normalizeSkillName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}
