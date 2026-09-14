import { Controller, Get, Inject, Req } from '@nestjs/common';
import { readSessionToken, type RequestLike } from '../auth/auth.http.js';
import { AccountContextService } from './account-context.service.js';

@Controller('account')
export class AccountContextController {
  constructor(
    @Inject(AccountContextService) private readonly accountContextService: AccountContextService,
  ) {}

  @Get('contexts')
  async getContexts(@Req() request: RequestLike) {
    return this.accountContextService.resolve(readSessionToken(request));
  }
}
