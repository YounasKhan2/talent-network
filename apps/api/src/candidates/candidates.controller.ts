import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  CAREER_PASSPORT_CORE_SECTION_KEYS,
  CAREER_PASSPORT_EXTENSION_SECTION_KEYS,
} from '@talent-network/contracts';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { assertCsrf, readSessionToken, type RequestLike } from '../auth/auth.http.js';
import {
  CandidatesService,
  type CandidateCertificationInput,
  type CandidateCustomSectionInput,
  type CandidateEducationInput,
  type CandidateEmploymentInput,
  type CandidateLanguageInput,
  type CandidateLinkInput,
  type CandidateLocationPreferenceInput,
  type CandidateProfileOverviewInput,
  type CandidateProjectInput,
  type CandidateSettingsInput,
  type CandidateSkillInput,
} from './candidates.service.js';

const workModeSchema = z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE']);
const availabilitySchema = z.enum(['IMMEDIATE', 'NOTICE_PERIOD', 'OPEN_TO_OFFERS', 'NOT_LOOKING']);
const nullableUrlSchema = z.string().trim().url().max(2048).nullable().optional();
const nullableDateSchema = z.string().datetime().nullable().optional();
const sectionTypeKeys = new Set<string>([
  ...CAREER_PASSPORT_CORE_SECTION_KEYS,
  ...CAREER_PASSPORT_EXTENSION_SECTION_KEYS,
  'CUSTOM',
]);

const overviewSchema = z
  .object({
    headline: z.string().trim().max(180).nullable().optional(),
    summary: z.string().trim().max(4000).nullable().optional(),
    availabilityStatus: availabilitySchema.nullable().optional(),
    availableFrom: nullableDateSchema,
    compensationCurrency: z.string().trim().min(3).max(3).toUpperCase().nullable().optional(),
    compensationMinimum: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
    compensationTarget: z.number().int().nonnegative().max(1_000_000_000).nullable().optional(),
    compensationPeriod: z.string().trim().max(32).nullable().optional(),
    preferredWorkModes: z.array(workModeSchema).max(4).optional(),
    preferredEmploymentTypes: z.array(z.string().trim().min(1).max(64)).max(12).optional(),
  })
  .strict();

const settingsSchema = z
  .object({
    visibility: z.enum(['PRIVATE', 'NETWORK', 'VERIFIED_RECRUITERS']).optional(),
    discoverability: z.enum(['HIDDEN', 'SEARCHABLE']).optional(),
    primaryLocale: z.string().trim().min(2).max(16).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const skillSchema = z.object({
  name: z.string().trim().min(1).max(120),
  proficiency: z.string().trim().max(64).nullable().optional(),
  experienceMonths: z.number().int().min(0).max(960).nullable().optional(),
  lastUsedAt: nullableDateSchema,
});

const employmentSchema = z.object({
  companyName: z.string().trim().min(1).max(180),
  title: z.string().trim().min(1).max(180),
  employmentType: z.string().trim().max(64).nullable().optional(),
  location: z.string().trim().max(180).nullable().optional(),
  workMode: workModeSchema.nullable().optional(),
  startDate: nullableDateSchema,
  endDate: nullableDateSchema,
  isCurrent: z.boolean().optional(),
  summary: z.string().trim().max(3000).nullable().optional(),
});

const educationSchema = z.object({
  institutionName: z.string().trim().min(1).max(220),
  degree: z.string().trim().max(180).nullable().optional(),
  fieldOfStudy: z.string().trim().max(180).nullable().optional(),
  location: z.string().trim().max(180).nullable().optional(),
  startDate: nullableDateSchema,
  endDate: nullableDateSchema,
  isCurrent: z.boolean().optional(),
  description: z.string().trim().max(3000).nullable().optional(),
});

const projectSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(3000).nullable().optional(),
  role: z.string().trim().max(180).nullable().optional(),
  url: nullableUrlSchema,
  repositoryUrl: nullableUrlSchema,
  startDate: nullableDateSchema,
  endDate: nullableDateSchema,
});

const certificationSchema = z.object({
  name: z.string().trim().min(1).max(220),
  issuer: z.string().trim().max(220).nullable().optional(),
  credentialId: z.string().trim().max(180).nullable().optional(),
  credentialUrl: nullableUrlSchema,
  issuedAt: nullableDateSchema,
  expiresAt: nullableDateSchema,
});

const languageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  proficiency: z.string().trim().max(64).nullable().optional(),
});

const linkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2048),
  kind: z.string().trim().max(64).nullable().optional(),
});

const locationPreferenceSchema = z.object({
  label: z.string().trim().min(1).max(180),
  countryCode: z.string().trim().length(2).toUpperCase().nullable().optional(),
  region: z.string().trim().max(180).nullable().optional(),
  city: z.string().trim().max(180).nullable().optional(),
  remoteOnly: z.boolean().optional(),
});

const customSectionItemSchema = z
  .object({
    title: z.string().trim().min(1).max(220),
    subtitle: z.string().trim().max(220).nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    startDate: nullableDateSchema,
    endDate: nullableDateSchema,
    url: nullableUrlSchema,
  })
  .strict();

const customSectionSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    sectionTypeKey: z
      .string()
      .trim()
      .max(64)
      .nullable()
      .optional()
      .refine((value) => value == null || sectionTypeKeys.has(value), 'Unknown section type key.'),
    sourceHeading: z.string().trim().max(220).nullable().optional(),
    classificationConfidence: z.number().min(0).max(1).nullable().optional(),
    classificationStatus: z
      .enum(['AUTO_CLASSIFIED', 'NEEDS_REVIEW', 'CANDIDATE_CLASSIFIED'])
      .nullable()
      .optional(),
    items: z.array(customSectionItemSchema).max(50),
  })
  .strict();

const skillsPayloadSchema = z.object({ skills: z.array(skillSchema).max(100) }).strict();
const employmentPayloadSchema = z
  .object({ employments: z.array(employmentSchema).max(50) })
  .strict();
const educationPayloadSchema = z.object({ education: z.array(educationSchema).max(50) }).strict();
const projectsPayloadSchema = z.object({ projects: z.array(projectSchema).max(50) }).strict();
const certificationsPayloadSchema = z
  .object({ certifications: z.array(certificationSchema).max(50) })
  .strict();
const languagesPayloadSchema = z.object({ languages: z.array(languageSchema).max(30) }).strict();
const linksPayloadSchema = z.object({ links: z.array(linkSchema).max(30) }).strict();
const locationsPayloadSchema = z
  .object({ locationPreferences: z.array(locationPreferenceSchema).max(30) })
  .strict();
const customSectionsPayloadSchema = z
  .object({ customSections: z.array(customSectionSchema).max(20) })
  .strict();

@Controller('candidate')
export class CandidatesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CandidatesService) private readonly candidatesService: CandidatesService,
  ) {}

  @Post('passport/initialize')
  async initialize(@Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.initialize(session.user.id);
  }

  @Get('passport')
  async getPassport(@Req() request: RequestLike) {
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.getPassport(session.user.id);
  }

  @Patch('passport/overview')
  async updateOverview(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.updateOverview(session.user.id, parseOverview(body));
  }

  @Put('passport/skills')
  async replaceSkills(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceSkills(session.user.id, parseSkills(body));
  }

  @Put('passport/experience')
  async replaceEmployment(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceEmployment(session.user.id, parseEmployment(body));
  }

  @Put('passport/education')
  async replaceEducation(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceEducation(session.user.id, parseEducation(body));
  }

  @Put('passport/projects')
  async replaceProjects(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceProjects(session.user.id, parseProjects(body));
  }

  @Put('passport/certifications')
  async replaceCertifications(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceCertifications(session.user.id, parseCertifications(body));
  }

  @Put('passport/languages')
  async replaceLanguages(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceLanguages(session.user.id, parseLanguages(body));
  }

  @Put('passport/links')
  async replaceLinks(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceLinks(session.user.id, parseLinks(body));
  }

  @Put('passport/locations')
  async replaceLocationPreferences(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceLocationPreferences(
      session.user.id,
      parseLocationPreferences(body),
    );
  }

  @Put('passport/custom-sections')
  async replaceCustomSections(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceCustomSections(session.user.id, parseCustomSections(body));
  }

  @Patch('settings')
  async updateSettings(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    await this.candidatesService.updateSettings(session.user.id, parseSettings(body));
    return this.candidatesService.getPassport(session.user.id);
  }
}

function parseOverview(body: unknown): CandidateProfileOverviewInput {
  const parsed = overviewSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_OVERVIEW', parsed.error.flatten());

  const input: CandidateProfileOverviewInput = {};
  if (parsed.data.headline !== undefined) input.headline = parsed.data.headline;
  if (parsed.data.summary !== undefined) input.summary = parsed.data.summary;
  if (parsed.data.availabilityStatus !== undefined)
    input.availabilityStatus = parsed.data.availabilityStatus;
  if (parsed.data.availableFrom !== undefined)
    input.availableFrom = toDate(parsed.data.availableFrom);
  if (parsed.data.compensationCurrency !== undefined)
    input.compensationCurrency = parsed.data.compensationCurrency;
  if (parsed.data.compensationMinimum !== undefined)
    input.compensationMinimum = parsed.data.compensationMinimum;
  if (parsed.data.compensationTarget !== undefined)
    input.compensationTarget = parsed.data.compensationTarget;
  if (parsed.data.compensationPeriod !== undefined)
    input.compensationPeriod = parsed.data.compensationPeriod;
  if (parsed.data.preferredWorkModes !== undefined)
    input.preferredWorkModes = parsed.data.preferredWorkModes;
  if (parsed.data.preferredEmploymentTypes !== undefined)
    input.preferredEmploymentTypes = parsed.data.preferredEmploymentTypes;
  return input;
}

function parseSettings(body: unknown): CandidateSettingsInput {
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_SETTINGS', parsed.error.flatten());

  const input: CandidateSettingsInput = {};
  if (parsed.data.visibility !== undefined) input.visibility = parsed.data.visibility;
  if (parsed.data.discoverability !== undefined)
    input.discoverability = parsed.data.discoverability;
  if (parsed.data.primaryLocale !== undefined) input.primaryLocale = parsed.data.primaryLocale;
  if (parsed.data.timezone !== undefined) input.timezone = parsed.data.timezone;
  return input;
}

function parseSkills(body: unknown): CandidateSkillInput[] {
  const parsed = skillsPayloadSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_SKILLS', parsed.error.flatten());
  const seen = new Set<string>();
  return parsed.data.skills.map((skill) => {
    const normalized = normalizeLabel(skill.name);
    if (seen.has(normalized))
      throw invalidPayload('DUPLICATE_CANDIDATE_SKILL', { skill: skill.name });
    seen.add(normalized);
    return {
      name: skill.name,
      proficiency: skill.proficiency ?? null,
      experienceMonths: skill.experienceMonths ?? null,
      lastUsedAt: toDate(skill.lastUsedAt),
    };
  });
}

function parseEmployment(body: unknown): CandidateEmploymentInput[] {
  const parsed = employmentPayloadSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_EXPERIENCE', parsed.error.flatten());
  return parsed.data.employments.map((item) => ({
    companyName: item.companyName,
    title: item.title,
    employmentType: item.employmentType ?? null,
    location: item.location ?? null,
    workMode: item.workMode ?? null,
    startDate: toDate(item.startDate),
    endDate: toDate(item.endDate),
    isCurrent: item.isCurrent ?? false,
    summary: item.summary ?? null,
  }));
}

function parseEducation(body: unknown): CandidateEducationInput[] {
  const parsed = educationPayloadSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_EDUCATION', parsed.error.flatten());
  return parsed.data.education.map((item) => ({
    institutionName: item.institutionName,
    degree: item.degree ?? null,
    fieldOfStudy: item.fieldOfStudy ?? null,
    location: item.location ?? null,
    startDate: toDate(item.startDate),
    endDate: toDate(item.endDate),
    isCurrent: item.isCurrent ?? false,
    description: item.description ?? null,
  }));
}

function parseProjects(body: unknown): CandidateProjectInput[] {
  const parsed = projectsPayloadSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_PROJECTS', parsed.error.flatten());
  return parsed.data.projects.map((item) => ({
    name: item.name,
    description: item.description ?? null,
    role: item.role ?? null,
    url: item.url ?? null,
    repositoryUrl: item.repositoryUrl ?? null,
    startDate: toDate(item.startDate),
    endDate: toDate(item.endDate),
  }));
}

function parseCertifications(body: unknown): CandidateCertificationInput[] {
  const parsed = certificationsPayloadSchema.safeParse(body);
  if (!parsed.success)
    throw invalidPayload('INVALID_CANDIDATE_CERTIFICATIONS', parsed.error.flatten());
  return parsed.data.certifications.map((item) => ({
    name: item.name,
    issuer: item.issuer ?? null,
    credentialId: item.credentialId ?? null,
    credentialUrl: item.credentialUrl ?? null,
    issuedAt: toDate(item.issuedAt),
    expiresAt: toDate(item.expiresAt),
  }));
}

function parseLanguages(body: unknown): CandidateLanguageInput[] {
  const parsed = languagesPayloadSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_LANGUAGES', parsed.error.flatten());
  const seen = new Set<string>();
  return parsed.data.languages.map((item) => {
    const normalized = normalizeLabel(item.name);
    if (seen.has(normalized))
      throw invalidPayload('DUPLICATE_CANDIDATE_LANGUAGE', { language: item.name });
    seen.add(normalized);
    return { name: item.name, proficiency: item.proficiency ?? null };
  });
}

function parseLinks(body: unknown): CandidateLinkInput[] {
  const parsed = linksPayloadSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_LINKS', parsed.error.flatten());
  return parsed.data.links.map((item) => ({
    label: item.label,
    url: item.url,
    kind: item.kind ?? null,
  }));
}

function parseLocationPreferences(body: unknown): CandidateLocationPreferenceInput[] {
  const parsed = locationsPayloadSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_LOCATIONS', parsed.error.flatten());
  return parsed.data.locationPreferences.map((item) => ({
    label: item.label,
    countryCode: item.countryCode ?? null,
    region: item.region ?? null,
    city: item.city ?? null,
    remoteOnly: item.remoteOnly ?? false,
  }));
}

function parseCustomSections(body: unknown): CandidateCustomSectionInput[] {
  const parsed = customSectionsPayloadSchema.safeParse(body);
  if (!parsed.success)
    throw invalidPayload('INVALID_CANDIDATE_CUSTOM_SECTIONS', parsed.error.flatten());
  return parsed.data.customSections.map((section) => ({
    title: section.title,
    description: section.description ?? null,
    sectionTypeKey: section.sectionTypeKey ?? null,
    sourceHeading: section.sourceHeading ?? null,
    classificationConfidence: section.classificationConfidence ?? null,
    classificationStatus: section.classificationStatus ?? null,
    items: section.items.map((item) => ({
      title: item.title,
      subtitle: item.subtitle ?? null,
      description: item.description ?? null,
      startDate: toDate(item.startDate),
      endDate: toDate(item.endDate),
      url: item.url ?? null,
    })),
  }));
}

function normalizeLabel(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function invalidPayload(code: string, details: unknown): BadRequestException {
  return new BadRequestException({
    code,
    message: 'Candidate Career Passport details are invalid.',
    details,
  });
}
