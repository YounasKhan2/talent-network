import { BadRequestException, Controller, Get, Inject, Param, Req } from '@nestjs/common';
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
  async list(@Req() request: RequestLike) {
    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidateVersionsService.list(session.user.id);
  }

  @Get(':versionNumber')
  async get(@Param('versionNumber') rawVersionNumber: string, @Req() request: RequestLike) {
    const versionNumber = Number(rawVersionNumber);
    if (!Number.isSafeInteger(versionNumber) || versionNumber < 1) {
      throw new BadRequestException({
        code: 'INVALID_CANDIDATE_PROFILE_VERSION',
        message: 'Career Passport version number must be a positive integer.',
      });
    }

    const session = await this.authService.getSession(readSessionToken(request));
    return this.candidateVersionsService.get(session.user.id, versionNumber);
  }
}
