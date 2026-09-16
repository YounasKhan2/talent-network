import { BadRequestException, Body, Controller, Inject, Patch, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { assertCsrf, readSessionToken, type RequestLike } from '../auth/auth.http.js';
import {
  CandidatesService,
  type CandidateAwardInput,
  type CandidateContactInformationInput,
} from './candidates.service.js';

const contactInformationSchema = z
  .object({
    fullName: z.string().trim().max(180).nullable(),
    email: z.string().trim().email().max(320).nullable(),
    phone: z.string().trim().max(64).nullable(),
    location: z.string().trim().max(180).nullable(),
  })
  .strict();

const awardSchema = z
  .object({
    title: z.string().trim().min(1).max(220),
    issuer: z.string().trim().max(220).nullable().optional(),
    awardedAt: z.string().datetime().nullable().optional(),
    description: z.string().trim().max(3000).nullable().optional(),
    url: z.string().trim().url().max(2048).nullable().optional(),
  })
  .strict();

const awardsPayloadSchema = z.object({ awards: z.array(awardSchema).max(50) }).strict();

@Controller('candidate')
export class CandidatePassportCoreController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CandidatesService) private readonly candidatesService: CandidatesService,
  ) {}

  @Patch('passport/contact')
  async updateContactInformation(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.updateContactInformation(
      session.user.id,
      parseContactInformation(body),
    );
  }

  @Put('passport/awards')
  async replaceAwards(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidatesService.replaceAwards(session.user.id, parseAwards(body));
  }
}

function parseContactInformation(body: unknown): CandidateContactInformationInput {
  const parsed = contactInformationSchema.safeParse(body);
  if (!parsed.success) {
    throw invalidPayload('INVALID_CANDIDATE_CONTACT_INFORMATION', parsed.error.flatten());
  }
  return parsed.data;
}

function parseAwards(body: unknown): CandidateAwardInput[] {
  const parsed = awardsPayloadSchema.safeParse(body);
  if (!parsed.success) throw invalidPayload('INVALID_CANDIDATE_AWARDS', parsed.error.flatten());

  return parsed.data.awards.map((award) => ({
    title: award.title,
    issuer: award.issuer ?? null,
    awardedAt: award.awardedAt ? new Date(award.awardedAt) : null,
    description: award.description ?? null,
    url: award.url ?? null,
  }));
}

function invalidPayload(code: string, details: unknown): BadRequestException {
  return new BadRequestException({ code, message: 'Invalid candidate payload.', details });
}
