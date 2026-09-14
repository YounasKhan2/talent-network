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
import { AuthTokenDeliveryService } from './auth-token-delivery.service.js';
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

const emailSchema = z.object({
  email: z.string().trim().email().max(320),
});

const tokenSchema = z.object({
  token: z.string().trim().min(32).max(512),
});

const resetPasswordSchema = tokenSchema.extend({
  password: z.string().min(12).max(128),
});

@Controller('auth')
export class AuthController {
  private readonly production = parseApiEnv().NODE_ENV === 'production';

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AuthRateLimitService) private readonly authRateLimitService: AuthRateLimitService,
    @Inject(AuthTokenDeliveryService) private readonly authTokenDeliveryService: AuthTokenDeliveryService,
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

  @Post('email-verification/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestEmailVerification(@Req() request: RequestLike) {
    assertCsrf(request);
    const context = sessionContextFromRequest(request);
    await this.authRateLimitService.assertEmailVerificationRequestAllowed(context.ip);
    const session = await this.authService.getSession(readSessionToken(request));
    const delivery = await this.authService.requestEmailVerification(session.user.id);
    if (delivery) {
      await this.authTokenDeliveryService.sendEmailVerification(delivery.email, delivery.token);
    }
    return { status: 'accepted' as const };
  }

  @Post('email-verification/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmEmailVerification(@Body() body: unknown, @Req() request: RequestLike) {
    const input = parseToken(body);
    await this.authRateLimitService.assertTokenConsumeAllowed(sessionContextFromRequest(request).ip);
    await this.authService.verifyEmail(input.token);
    return { status: 'verified' as const };
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(@Body() body: unknown, @Req() request: RequestLike) {
    const input = parseEmail(body);
    const context = sessionContextFromRequest(request);
    await this.authRateLimitService.assertPasswordResetRequestAllowed(input.email, context.ip);
    const delivery = await this.authService.requestPasswordReset(input.email);
    if (delivery) {
      await this.authTokenDeliveryService.sendPasswordReset(delivery.email, delivery.token);
    }
    return { status: 'accepted' as const };
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body() body: unknown,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<void> {
    const input = parsePasswordReset(body);
    await this.authRateLimitService.assertTokenConsumeAllowed(sessionContextFromRequest(request).ip);
    await this.authService.resetPassword(input.token, input.password);
    clearAuthCookies(response, this.production);
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
  throw invalidPayload('INVALID_CREDENTIALS_PAYLOAD', 'Email and password are invalid.', parsed.error.flatten());
}

function parseEmail(body: unknown): z.infer<typeof emailSchema> {
  const parsed = emailSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  throw invalidPayload('INVALID_EMAIL_PAYLOAD', 'Email is invalid.', parsed.error.flatten());
}

function parseToken(body: unknown): z.infer<typeof tokenSchema> {
  const parsed = tokenSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  throw invalidPayload('INVALID_TOKEN_PAYLOAD', 'Authentication token is invalid.', parsed.error.flatten());
}

function parsePasswordReset(body: unknown): z.infer<typeof resetPasswordSchema> {
  const parsed = resetPasswordSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  throw invalidPayload('INVALID_PASSWORD_RESET_PAYLOAD', 'Password reset details are invalid.', parsed.error.flatten());
}

function invalidPayload(code: string, message: string, details: unknown): BadRequestException {
  return new BadRequestException({ code, message, details });
}
