import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DATABASE_JSON_DB_NULL,
  type DatabaseClient,
  type PrismaInputJsonValue,
} from '@talent-network/database';
import { DATABASE_CLIENT } from '../database/database.module.js';
import { writeAuditEvent, writeOutboxEvent } from '../events/transactional-events.js';

export interface ResumeReviewEdits {
  headline?: string | null;
  summary?: string | null;
}

export type ResumeReviewDecisionInput =
  { decision: 'ACCEPT' } | { decision: 'EDIT'; edits: ResumeReviewEdits } | { decision: 'IGNORE' };

const passportVersionInclude = {
  employments: { orderBy: { sortOrder: 'asc' as const } },
  education: { orderBy: { sortOrder: 'asc' as const } },
  skills: { orderBy: { sortOrder: 'asc' as const } },
  projects: { orderBy: { sortOrder: 'asc' as const } },
  certifications: { orderBy: { sortOrder: 'asc' as const } },
  languages: { orderBy: { sortOrder: 'asc' as const } },
  links: { orderBy: { sortOrder: 'asc' as const } },
  locationPreferences: { orderBy: { sortOrder: 'asc' as const } },
  customSections: {
    orderBy: { sortOrder: 'asc' as const },
    include: { items: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

type WorkMode = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'FLEXIBLE';

interface CurrentEmployment {
  companyName: string;
  title: string;
  employmentType: string | null;
  location: string | null;
  workMode: WorkMode | null;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
  summary: string | null;
}

interface CurrentEducation {
  institutionName: string;
  degree: string | null;
  fieldOfStudy: string | null;
  location: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
  description: string | null;
}

interface CurrentSkill {
  name: string;
  normalizedName: string;
  proficiency: string | null;
  experienceMonths: number | null;
  lastUsedAt: Date | null;
}

interface CurrentProject {
  name: string;
  description: string | null;
  role: string | null;
  url: string | null;
  repositoryUrl: string | null;
  startDate: Date | null;
  endDate: Date | null;
}

interface CurrentCertification {
  name: string;
  issuer: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
}

interface CurrentLanguage {
  name: string;
  proficiency: string | null;
}

interface CurrentLink {
  label: string;
  url: string;
  kind: string | null;
}

interface CurrentLocation {
  label: string;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  remoteOnly: boolean;
}

@Injectable()
export class ResumeReviewService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async getReview(userId: string, resumeId: string) {
    const context = await this.loadContext(userId, resumeId);
    const reviewRecord = context.parseResult
      ? await this.database.resumeReview.findUnique({
          where: { parseResultId: context.parseResult.id },
          select: {
            id: true,
            decision: true,
            candidateEdits: true,
            appliedProfileVersionId: true,
            decidedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : null;

    const processingState = context.currentVersion?.processingState ?? null;
    const hasProposal = context.parseResult !== null;
    const decided = reviewRecord !== null && reviewRecord.decision !== 'PENDING';

    return {
      resume: {
        id: context.resume.id,
        title: context.resume.title,
        currentVersionId: context.resume.currentVersionId,
        createdAt: context.resume.createdAt,
        updatedAt: context.resume.updatedAt,
      },
      version: context.currentVersion,
      proposal: context.parseResult,
      passport: {
        candidateId: context.resume.candidate.id,
        currentProfileVersion: context.resume.candidate.currentProfileVersion,
      },
      review: {
        available: processingState === 'READY_FOR_REVIEW' && hasProposal && !decided,
        blockingReason: readBlockingReason(
          processingState,
          hasProposal,
          reviewRecord?.decision ?? null,
        ),
        record: reviewRecord,
      },
    };
  }

  async decide(userId: string, resumeId: string, input: ResumeReviewDecisionInput) {
    const context = await this.loadContext(userId, resumeId);
    const version = context.currentVersion;
    const parseResult = context.parseResult;
    const currentProfile = context.resume.candidate.currentProfileVersion;

    if (!version) throw new BadRequestException({ code: 'RESUME_VERSION_NOT_AVAILABLE' });
    if (!parseResult) throw new BadRequestException({ code: 'PARSE_PROPOSAL_NOT_AVAILABLE' });
    if (!currentProfile) {
      throw new ConflictException({ code: 'CANDIDATE_PASSPORT_NOT_INITIALIZED' });
    }

    const existing = await this.database.resumeReview.findUnique({
      where: { resumeVersionId: version.id },
    });
    if (existing && existing.decision !== 'PENDING') {
      if (matchesFinalDecision(existing.decision, input.decision)) {
        return this.getReview(userId, resumeId);
      }
      throw new ConflictException({ code: 'RESUME_REVIEW_ALREADY_DECIDED' });
    }

    if (version.processingState !== 'READY_FOR_REVIEW') {
      throw new ConflictException({
        code: 'RESUME_NOT_READY_FOR_REVIEW',
        processingState: version.processingState,
      });
    }

    if (input.decision === 'IGNORE') {
      await this.database.$transaction(async (transaction) => {
        await transaction.resumeReview.upsert({
          where: { resumeVersionId: version.id },
          create: {
            resumeVersionId: version.id,
            parseResultId: parseResult.id,
            baseProfileVersionId: currentProfile.id,
            decision: 'IGNORED',
            decidedAt: new Date(),
          },
          update: {
            decision: 'IGNORED',
            candidateEdits: DATABASE_JSON_DB_NULL,
            decidedAt: new Date(),
          },
        });
        await transaction.resumeVersion.update({
          where: { id: version.id },
          data: { processingState: 'REJECTED' },
        });
        await writeAuditEvent(transaction, {
          actorType: 'USER',
          actorId: userId,
          action: 'candidate.resume.review_ignored',
          resourceType: 'ResumeVersion',
          resourceId: version.id,
          metadata: { resumeId, parseResultId: parseResult.id },
        });
        await writeOutboxEvent(transaction, {
          aggregateType: 'ResumeVersion',
          aggregateId: version.id,
          eventType: 'candidate.resume.review_ignored',
          payload: { resumeId, resumeVersionId: version.id, parseResultId: parseResult.id },
        });
      });
      return this.getReview(userId, resumeId);
    }

    const proposal = readParsedProposal(
      parseResult.parsedJson,
      version.id,
      parseResult.sourceExtractionId,
    );
    const edits = input.decision === 'EDIT' ? input.edits : {};
    const decision = input.decision === 'EDIT' ? 'EDITED' : 'ACCEPTED';
    const now = new Date();

    try {
      await this.database.$transaction(async (transaction) => {
        const candidate = await transaction.candidate.findFirst({
          where: { id: context.resume.candidate.id, userId },
          select: { currentProfileVersionId: true },
        });
        if (!candidate || candidate.currentProfileVersionId !== currentProfile.id) {
          throw new ConflictException({ code: 'CAREER_PASSPORT_CHANGED_DURING_REVIEW' });
        }

        const alreadyReviewed = await transaction.resumeReview.findUnique({
          where: { resumeVersionId: version.id },
        });
        if (alreadyReviewed?.appliedProfileVersionId) return;
        if (alreadyReviewed && alreadyReviewed.decision !== 'PENDING') {
          throw new ConflictException({ code: 'RESUME_REVIEW_ALREADY_DECIDED' });
        }

        const next = await transaction.candidateProfileVersion.create({
          data: {
            candidateId: context.resume.candidate.id,
            versionNumber: currentProfile.versionNumber + 1,
            status: 'APPROVED',
            source: 'RESUME_IMPORT',
            headline:
              edits.headline !== undefined
                ? edits.headline
                : (readStringClaim(proposal.headline) ?? currentProfile.headline),
            summary:
              edits.summary !== undefined
                ? edits.summary
                : (readStringClaim(proposal.summary) ?? currentProfile.summary),
            availabilityStatus: currentProfile.availabilityStatus,
            availableFrom: currentProfile.availableFrom,
            compensationCurrency: currentProfile.compensationCurrency,
            compensationMinimum: currentProfile.compensationMinimum,
            compensationTarget: currentProfile.compensationTarget,
            compensationPeriod: currentProfile.compensationPeriod,
            preferredWorkModes: currentProfile.preferredWorkModes,
            preferredEmploymentTypes: currentProfile.preferredEmploymentTypes,
            approvedAt: now,
            employments: {
              create: mergeEmployments(currentProfile.employments, proposal.experiences),
            },
            education: { create: mergeEducation(currentProfile.education, proposal.education) },
            skills: { create: mergeSkills(currentProfile.skills, proposal.skills) },
            projects: { create: mergeProjects(currentProfile.projects, proposal.projects) },
            certifications: {
              create: mergeCertifications(currentProfile.certifications, proposal.certifications),
            },
            languages: { create: mergeLanguages(currentProfile.languages, proposal.languages) },
            links: { create: mergeLinks(currentProfile.links, proposal.links) },
            locationPreferences: {
              create: mergeLocations(currentProfile.locationPreferences, proposal.locations),
            },
            customSections: {
              create: currentProfile.customSections.map((section, sectionIndex) => ({
                title: section.title,
                description: section.description,
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
          where: { id: currentProfile.id },
          data: { status: 'SUPERSEDED' },
        });
        await transaction.candidate.update({
          where: { id: context.resume.candidate.id },
          data: { currentProfileVersionId: next.id },
        });
        await transaction.resumeVersion.update({
          where: { id: version.id },
          data: { processingState: 'APPROVED', approvedProfileVersionId: next.id },
        });
        await transaction.resumeReview.upsert({
          where: { resumeVersionId: version.id },
          create: {
            resumeVersionId: version.id,
            parseResultId: parseResult.id,
            baseProfileVersionId: currentProfile.id,
            decision,
            candidateEdits: edits as PrismaInputJsonValue,
            appliedProfileVersionId: next.id,
            decidedAt: now,
          },
          update: {
            decision,
            candidateEdits: edits as PrismaInputJsonValue,
            appliedProfileVersionId: next.id,
            decidedAt: now,
          },
        });
        await writeAuditEvent(transaction, {
          actorType: 'USER',
          actorId: userId,
          action: 'candidate.resume.review_applied',
          resourceType: 'CandidateProfileVersion',
          resourceId: next.id,
          metadata: {
            candidateId: context.resume.candidate.id,
            resumeId,
            resumeVersionId: version.id,
            parseResultId: parseResult.id,
            decision,
            versionNumber: next.versionNumber,
          },
        });
        await writeOutboxEvent(transaction, {
          aggregateType: 'Candidate',
          aggregateId: context.resume.candidate.id,
          eventType: 'candidate.passport.resume_imported',
          payload: {
            candidateId: context.resume.candidate.id,
            profileVersionId: next.id,
            resumeVersionId: version.id,
            parseResultId: parseResult.id,
            decision,
            versionNumber: next.versionNumber,
          },
        });
      });
    } catch (error) {
      if (isReviewRace(error)) {
        const final = await this.database.resumeReview.findUnique({
          where: { resumeVersionId: version.id },
        });
        if (final && matchesFinalDecision(final.decision, input.decision)) {
          return this.getReview(userId, resumeId);
        }
      }
      throw error;
    }

    return this.getReview(userId, resumeId);
  }

  private async loadContext(userId: string, resumeId: string) {
    const resume = await this.database.resume.findFirst({
      where: { id: resumeId, candidate: { userId } },
      select: {
        id: true,
        title: true,
        currentVersionId: true,
        createdAt: true,
        updatedAt: true,
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            processingState: true,
            failureCode: true,
            failureMetadata: true,
            processingPipelineVersion: true,
            uploadedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        candidate: {
          select: {
            id: true,
            currentProfileVersion: { include: passportVersionInclude },
          },
        },
      },
    });
    if (!resume) throw new NotFoundException({ code: 'RESUME_NOT_FOUND' });

    const currentVersion = resume.currentVersion;
    const parseResult = currentVersion
      ? await this.database.resumeParseResult.findFirst({
          where: { resumeVersionId: currentVersion.id, status: 'COMPLETED' },
          orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            sourceExtractionId: true,
            parserName: true,
            parserVersion: true,
            schemaVersion: true,
            parserPolicyVersion: true,
            evidencePolicyVersion: true,
            promptVersion: true,
            provider: true,
            model: true,
            status: true,
            parsedJson: true,
            confidenceSummary: true,
            warnings: true,
            completedAt: true,
            createdAt: true,
          },
        })
      : null;

    return { resume, currentVersion, parseResult };
  }
}

function matchesFinalDecision(
  stored: string,
  requested: ResumeReviewDecisionInput['decision'],
): boolean {
  return (
    (stored === 'IGNORED' && requested === 'IGNORE') ||
    (stored === 'ACCEPTED' && requested === 'ACCEPT') ||
    (stored === 'EDITED' && requested === 'EDIT')
  );
}

function isReviewRace(error: unknown): boolean {
  const record = asRecord(error);
  return record?.code === 'P2002' || record?.code === 'P2034';
}

function readBlockingReason(
  processingState: string | null,
  hasProposal: boolean,
  decision: string | null,
): string | null {
  if (!processingState) return 'RESUME_VERSION_NOT_AVAILABLE';
  if (decision === 'IGNORED') return 'REVIEW_IGNORED';
  if (decision === 'ACCEPTED' || decision === 'EDITED') return 'REVIEW_ALREADY_APPROVED';
  if (processingState === 'READY_FOR_REVIEW' && hasProposal) return null;
  if (processingState === 'FAILED_TERMINAL') return 'PROCESSING_FAILED_TERMINAL';
  if (processingState === 'REJECTED') return 'RESUME_REJECTED';
  if (processingState === 'APPROVED') return 'REVIEW_ALREADY_APPROVED';
  if (!hasProposal && processingState === 'READY_FOR_REVIEW') {
    return 'PARSE_PROPOSAL_NOT_AVAILABLE';
  }
  return 'PROCESSING_IN_PROGRESS';
}

type JsonRecord = Record<string, unknown>;

function readParsedProposal(
  value: unknown,
  resumeVersionId: string,
  sourceExtractionId: string,
): JsonRecord {
  const proposal = asRecord(value);
  if (
    !proposal ||
    proposal.resumeVersionId !== resumeVersionId ||
    proposal.sourceExtractionId !== sourceExtractionId
  ) {
    throw new BadRequestException({ code: 'INVALID_RESUME_PARSE_PROPOSAL' });
  }
  return proposal;
}

function readStringClaim(value: unknown): string | null {
  const claim = asRecord(value);
  return claim && typeof claim.value === 'string' && claim.value.trim() ? claim.value.trim() : null;
}

function readDateRange(value: unknown): {
  start: Date | null;
  end: Date | null;
  isCurrent: boolean;
} {
  const claim = asRecord(value);
  const range = asRecord(claim?.value);
  return {
    start: safeDate(range?.start),
    end: safeDate(range?.end),
    isCurrent: range?.isCurrent === true,
  };
}

function safeDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mergeEmployments(current: readonly CurrentEmployment[], value: unknown) {
  const rows = current.map((item, index) => ({
    companyName: item.companyName,
    title: item.title,
    employmentType: item.employmentType,
    location: item.location,
    workMode: item.workMode,
    startDate: item.startDate,
    endDate: item.endDate,
    isCurrent: item.isCurrent,
    summary: item.summary,
    sortOrder: index,
  }));
  const seen = new Set(rows.map((item) => `${item.companyName}|${item.title}`.toLowerCase()));
  for (const raw of asArray(value)) {
    const item = asRecord(raw);
    const companyName = readStringClaim(item?.company);
    const title = readStringClaim(item?.role);
    if (!companyName || !title) continue;
    const key = `${companyName}|${title}`.toLowerCase();
    if (seen.has(key)) continue;
    const dates = readDateRange(item?.dates);
    const summary = readStringClaim(item?.summary);
    const highlights = asArray(item?.highlights).map(readStringClaim).filter(isString);
    rows.push({
      companyName,
      title,
      employmentType: null,
      location: readStringClaim(item?.location),
      workMode: null,
      startDate: dates.start,
      endDate: dates.end,
      isCurrent: dates.isCurrent,
      summary: summary ?? (highlights.length ? highlights.join('\n') : null),
      sortOrder: rows.length,
    });
    seen.add(key);
  }
  return rows;
}

function mergeEducation(current: readonly CurrentEducation[], value: unknown) {
  const rows = current.map((item, index) => ({
    institutionName: item.institutionName,
    degree: item.degree,
    fieldOfStudy: item.fieldOfStudy,
    location: item.location,
    startDate: item.startDate,
    endDate: item.endDate,
    isCurrent: item.isCurrent,
    description: item.description,
    sortOrder: index,
  }));
  const seen = new Set(
    rows.map((item) => `${item.institutionName}|${item.degree ?? ''}`.toLowerCase()),
  );
  for (const raw of asArray(value)) {
    const item = asRecord(raw);
    const institutionName = readStringClaim(item?.institution);
    if (!institutionName) continue;
    const degree = readStringClaim(item?.qualification);
    const key = `${institutionName}|${degree ?? ''}`.toLowerCase();
    if (seen.has(key)) continue;
    const dates = readDateRange(item?.dates);
    const details = asArray(item?.details).map(readStringClaim).filter(isString);
    rows.push({
      institutionName,
      degree,
      fieldOfStudy: readStringClaim(item?.fieldOfStudy),
      location: readStringClaim(item?.location),
      startDate: dates.start,
      endDate: dates.end,
      isCurrent: dates.isCurrent,
      description: details.length ? details.join('\n') : null,
      sortOrder: rows.length,
    });
    seen.add(key);
  }
  return rows;
}

function mergeSkills(current: readonly CurrentSkill[], value: unknown) {
  const rows = current.map((item, index) => ({
    name: item.name,
    normalizedName: item.normalizedName,
    proficiency: item.proficiency,
    experienceMonths: item.experienceMonths,
    lastUsedAt: item.lastUsedAt,
    sortOrder: index,
  }));
  const seen = new Set(rows.map((item) => item.normalizedName));
  for (const raw of asArray(value)) {
    const item = asRecord(raw);
    const name = readStringClaim(item?.name);
    if (!name) continue;
    const normalizedName = name.toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();
    if (seen.has(normalizedName)) continue;
    rows.push({
      name,
      normalizedName,
      proficiency: null,
      experienceMonths: null,
      lastUsedAt: null,
      sortOrder: rows.length,
    });
    seen.add(normalizedName);
  }
  return rows;
}

function mergeProjects(current: readonly CurrentProject[], value: unknown) {
  const rows = current.map((item, index) => ({
    name: item.name,
    description: item.description,
    role: item.role,
    url: item.url,
    repositoryUrl: item.repositoryUrl,
    startDate: item.startDate,
    endDate: item.endDate,
    sortOrder: index,
  }));
  const seen = new Set(rows.map((item) => item.name.toLowerCase()));
  for (const raw of asArray(value)) {
    const item = asRecord(raw);
    const name = readStringClaim(item?.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    rows.push({
      name,
      description: readStringClaim(item?.description),
      role: null,
      url: readStringClaim(item?.url),
      repositoryUrl: null,
      startDate: null,
      endDate: null,
      sortOrder: rows.length,
    });
    seen.add(name.toLowerCase());
  }
  return rows;
}

function mergeCertifications(current: readonly CurrentCertification[], value: unknown) {
  const rows = current.map((item, index) => ({
    name: item.name,
    issuer: item.issuer,
    credentialId: item.credentialId,
    credentialUrl: item.credentialUrl,
    issuedAt: item.issuedAt,
    expiresAt: item.expiresAt,
    sortOrder: index,
  }));
  const seen = new Set(rows.map((item) => item.name.toLowerCase()));
  for (const raw of asArray(value)) {
    const item = asRecord(raw);
    const name = readStringClaim(item?.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    rows.push({
      name,
      issuer: readStringClaim(item?.issuer),
      credentialId: readStringClaim(item?.credentialId),
      credentialUrl: readStringClaim(item?.credentialUrl),
      issuedAt: safeDate(readStringClaim(item?.issuedAt)),
      expiresAt: safeDate(readStringClaim(item?.expiresAt)),
      sortOrder: rows.length,
    });
    seen.add(name.toLowerCase());
  }
  return rows;
}

function mergeLanguages(current: readonly CurrentLanguage[], value: unknown) {
  const rows = current.map((item, index) => ({
    name: item.name,
    proficiency: item.proficiency,
    sortOrder: index,
  }));
  const seen = new Set(rows.map((item) => item.name.toLowerCase()));
  for (const raw of asArray(value)) {
    const item = asRecord(raw);
    const name = readStringClaim(item?.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    rows.push({ name, proficiency: readStringClaim(item?.proficiency), sortOrder: rows.length });
    seen.add(name.toLowerCase());
  }
  return rows;
}

function mergeLinks(current: readonly CurrentLink[], value: unknown) {
  const rows = current.map((item, index) => ({
    label: item.label,
    url: item.url,
    kind: item.kind,
    sortOrder: index,
  }));
  const seen = new Set(rows.map((item) => item.url.toLowerCase()));
  for (const raw of asArray(value)) {
    const item = asRecord(raw);
    const url = readStringClaim(item?.url);
    if (!url || seen.has(url.toLowerCase())) continue;
    rows.push({
      label: readStringClaim(item?.label) ?? 'Resume link',
      url,
      kind: null,
      sortOrder: rows.length,
    });
    seen.add(url.toLowerCase());
  }
  return rows;
}

function mergeLocations(current: readonly CurrentLocation[], value: unknown) {
  const rows = current.map((item, index) => ({
    label: item.label,
    countryCode: item.countryCode,
    region: item.region,
    city: item.city,
    remoteOnly: item.remoteOnly,
    sortOrder: index,
  }));
  const seen = new Set(rows.map((item) => item.label.toLowerCase()));
  for (const raw of asArray(value)) {
    const item = asRecord(raw);
    const label = readStringClaim(item?.value);
    if (!label || seen.has(label.toLowerCase())) continue;
    rows.push({
      label,
      countryCode: null,
      region: null,
      city: null,
      remoteOnly: false,
      sortOrder: rows.length,
    });
    seen.add(label.toLowerCase());
  }
  return rows;
}

function isString(value: string | null): value is string {
  return value !== null;
}
