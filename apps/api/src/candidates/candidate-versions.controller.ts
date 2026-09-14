import { BadRequestException, Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { readSessionToken, type RequestLike } from '../auth/auth.http.js';
import { CandidateVersionsService } from './candidate-versions.service.js';

@Controller('candidate/passport/versions')
export class CandidateVersionsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CandidateVersionsService)
    private readonly candidateVersionsService: CandidateVersionsService,
  ) {}

  @Get()
  async list(
    @Query('before') rawBefore: string | undefined,
    @Query('limit') rawLimit: string | undefined,
    @Req() request: RequestLike,
  ) {
    const beforeVersionNumber = parseOptionalPositiveInteger(rawBefore, 'before');
    const limit = rawLimit === undefined ? 30 : parsePositiveInteger(rawLimit, 'limit');
    if (limit > 50) {
      throw new BadRequestException({
        code: 'INVALID_CANDIDATE_PROFILE_VERSION_LIMIT',
        message: 'Career Passport version history limit cannot exceed 50.',
      });
    }

    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidateVersionsService.list(session.user.id, {
      ...(beforeVersionNumber === undefined ? {} : { beforeVersionNumber }),
      limit,
    });
  }

  @Get(':versionNumber')
  async get(@Param('versionNumber') rawVersionNumber: string, @Req() request: RequestLike) {
    const versionNumber = parsePositiveInteger(rawVersionNumber, 'versionNumber');
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidateVersionsService.get(session.user.id, versionNumber);
  }
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  field: string,
): number | undefined {
  if (value === undefined) return undefined;
  return parsePositiveInteger(value, field);
}

function parsePositiveInteger(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new BadRequestException({
      code: 'INVALID_CANDIDATE_PROFILE_VERSION_QUERY',
      message: `${field} must be a positive integer.`,
    });
  }
  return parsed;
}
