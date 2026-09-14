import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { assertCsrf, readSessionToken, type RequestLike } from '../auth/auth.http.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { OrganizationsService } from './organizations.service.js';

const createOrganizationSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(180).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});

const organizationIdSchema = z.string().uuid();

@Controller('organizations')
export class OrganizationsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AuthorizationService) private readonly authorizationService: AuthorizationService,
    @Inject(OrganizationsService) private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  async create(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const input = parseCreateOrganization(body);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.organizationsService.create(session.user.id, input);
  }

  @Get(':organizationId')
  async getById(@Param('organizationId') organizationIdValue: string, @Req() request: RequestLike) {
    const organizationId = parseOrganizationId(organizationIdValue);
    await this.authorizationService.authorizeOrganization(
      readSessionToken(request),
      organizationId,
      'organization.read',
    );
    return this.organizationsService.getById(organizationId);
  }
}

function parseCreateOrganization(body: unknown): z.infer<typeof createOrganizationSchema> {
  const parsed = createOrganizationSchema.safeParse(body);
  if (parsed.success) return parsed.data;

  throw new BadRequestException({
    code: 'INVALID_ORGANIZATION_PAYLOAD',
    message: 'Organization details are invalid.',
    details: parsed.error.flatten(),
  });
}

function parseOrganizationId(value: string): string {
  const parsed = organizationIdSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new BadRequestException('Organization id is invalid.');
}
