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
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { assertCsrf, readSessionToken, type RequestLike } from '../auth/auth.http.js';
import {
  CandidatesService,
  type CandidateEducationInput,
  type CandidateEmploymentInput,
  type CandidateProfileOverviewInput,
  type CandidateSettingsInput,
  type CandidateSkillInput,
} from './candidates.service.js';

const workModeSchema = z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE']);
const availabilitySchema = z.enum(['IMMEDIATE', 'NOTICE_PERIOD', 'OPEN_TO_OFFERS', 'NOT_LOOKING']);

const overviewSchema = z
  .object({
    headline: z.string().trim().max(180).nullable().optional(),
    summary: z.string().trim().max(4000).nullable().optional(),
    availabilityStatus: availabilitySchema.nullable().optional(),
    availableFrom: z.string().datetime().nullable().optional(),
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
  lastUsedAt: z.string().datetime().nullable().optional(),
});

const employmentSchema = z.object({
  companyName: z.string().trim().min(1).max(180),
  title: z.string().trim().min(1).max(180),
  employmentType: z.string().trim().max(64).nullable().optional(),
  location: z.string().trim().max(180).nullable().optional(),
  workMode: workModeSchema.nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  isCurrent: z.boolean().optional(),
  summary: z.string().trim().max(3000).nullable().optional(),
});

const educationSchema = z.object({
  institutionName: z.string().trim().min(1).max(220),
  degree: z.string().trim().max(180).nullable().optional(),
  fieldOfStudy: z.string().trim().max(180).nullable().optional(),
  location: z.string().trim().max(180).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  isCurrent: z.boolean().optional(),
  description: z.string().trim().max(3000).nullable().optional(),
});

const skillsPayloadSchema = z.object({ skills: z.array(skillSchema).max(100) }).strict();
const employmentPayloadSchema = z
  .object({ employments: z.array(employmentSchema).max(50) })
  .strict();
const educationPayloadSchema = z.object({ education: z.array(educationSchema).max(50) }).strict();

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

  const { availableFrom, ...rest } = parsed.data;
  return {
    ...rest,
    ...(availableFrom !== undefined
      ? { availableFrom: availableFrom ? new Date(availableFrom) : null }
      : {}),
  };
}

function parseSettings(body: unknown): CandidateSettingsInput {
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_SETTINGS', parsed.error.flatten());
  return parsed.data;
}

function parseSkills(body: unknown): CandidateSkillInput[] {
  const parsed = skillsPayloadSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_SKILLS', parsed.error.flatten());
  const seen = new Set<string>();
  return parsed.data.skills.map((skill) => {
    const normalized = skill.name.toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
    if (seen.has(normalized)) {
      throw invalidPayload('DUPLICATE_CANDIDATE_SKILL', { skill: skill.name });
    }
    seen.add(normalized);
    return {
      name: skill.name,
      proficiency: skill.proficiency ?? null,
      experienceMonths: skill.experienceMonths ?? null,
      lastUsedAt: skill.lastUsedAt ? new Date(skill.lastUsedAt) : null,
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
    startDate: item.startDate ? new Date(item.startDate) : null,
    endDate: item.endDate ? new Date(item.endDate) : null,
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
    startDate: item.startDate ? new Date(item.startDate) : null,
    endDate: item.endDate ? new Date(item.endDate) : null,
    isCurrent: item.isCurrent ?? false,
    description: item.description ?? null,
  }));
}

function invalidPayload(code: string, details: unknown): BadRequestException {
  return new BadRequestException({
    code,
    message: 'Candidate Career Passport details are invalid.',
    details,
  });
}
