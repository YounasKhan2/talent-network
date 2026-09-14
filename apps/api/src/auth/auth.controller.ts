import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { parseApiEnv } from '@talent-network/config';
import { z } from 'zod';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { AuthService } from './auth.service.js';
import {
  assertCsrf,
  clearAuthCookies,
  readOptionalSessionToken,
  readSessionToken,
  sessionContextFromRequest,
  setAuthCookies,
  type RequestLike,
  type ResponseLike,
} from './auth.http.js';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(128),
});

@Controller('auth')
export class AuthController {
  private readonly production = parseApiEnv().NODE_ENV === 'production';

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AuthRateLimitService) private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  @Post('signup')
  async signup(
    @Body() body: unknown,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    const credentials = parseCredentials(body);
    const context = sessionContextFromRequest(request);
    await this.authRateLimitService.assertSignupAllowed(credentials.email, context.ip);
    const result = await this.authService.signup(credentials.email, credentials.password, context);
    setAuthCookies(response, result.sessionToken, this.production);
    return result.session;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    const credentials = parseCredentials(body);
    const context = sessionContextFromRequest(request);
    await this.authRateLimitService.assertLoginAllowed(credentials.email, context.ip);
    const result = await this.authService.login(credentials.email, credentials.password, context);
    setAuthCookies(response, result.sessionToken, this.production);
    return result.session;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    assertCsrf(request);
    const result = await this.authService.refresh(
      readSessionToken(request),
      sessionContextFromRequest(request),
    );
    setAuthCookies(response, result.sessionToken, this.production);
    return result.session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    assertCsrf(request);
    const sessionToken = readOptionalSessionToken(request);
    if (sessionToken) await this.authService.logout(sessionToken);
    clearAuthCookies(response, this.production);
  }

  @Get('me')
  async me(@Req() request: RequestLike) {
    return this.authService.getSession(readSessionToken(request));
  }
}

function parseCredentials(body: unknown): z.infer<typeof credentialsSchema> {
  const parsed = credentialsSchema.safeParse(body);
  if (parsed.success) return parsed.data;

  throw new BadRequestException({
    code: 'INVALID_CREDENTIALS_PAYLOAD',
    message: 'Email and password are invalid.',
    details: parsed.error.flatten(),
  });
}
