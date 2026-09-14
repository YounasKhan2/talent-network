import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ORGANIZATION_ROLE_KEYS,
  type OrganizationRoleKey,
} from '@talent-network/contracts';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { assertCsrf, readSessionToken, type RequestLike } from '../auth/auth.http.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  OrganizationInvitationsService,
  type CreateOrganizationInvitationInput,
} from './organization-invitations.service.js';
import { OrganizationsService, type CreateOrganizationInput } from './organizations.service.js';

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

const createInvitationSchema = z.object({
  email: z.string().trim().email().max(320),
  roleKey: z.enum(ORGANIZATION_ROLE_KEYS).refine((role) => role !== 'ORG_OWNER', {
    message: 'ORG_OWNER cannot be assigned through an invitation.',
  }),
});

const invitationTokenSchema = z.object({
  token: z.string().min(20).max(512),
});

const organizationIdSchema = z.string().uuid();
const invitationIdSchema = z.string().uuid();

@Controller('organizations')
export class OrganizationsController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AuthorizationService) private readonly authorizationService: AuthorizationService,
    @Inject(OrganizationsService) private readonly organizationsService: OrganizationsService,
    @Inject(OrganizationInvitationsService)
    private readonly organizationInvitationsService: OrganizationInvitationsService,
  ) {}

  @Post()
  async create(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const input = parseCreateOrganization(body);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.organizationsService.create(session.user.id, input);
  }

  @Get('active-context')
  async getActiveContext(@Req() request: RequestLike) {
    const organizationId = readOrganizationIdHeader(request);
    const authorization = await this.authorizationService.authorizeOrganizationContext(
      readSessionToken(request),
      organizationId,
      'organization.read',
    );
    const organization = await this.organizationsService.getById(organizationId);

    return {
      organization,
      membership: authorization.membership,
    };
  }

  @Post('invitations/accept')
  async acceptInvitation(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const token = parseInvitationToken(body);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.organizationInvitationsService.accept(
      session.user.id,
      session.user.primaryEmail,
      token,
    );
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

  @Post(':organizationId/invitations')
  async createInvitation(
    @Param('organizationId') organizationIdValue: string,
    @Body() body: unknown,
    @Req() request: RequestLike,
  ) {
    assertCsrf(request);
    const organizationId = parseOrganizationId(organizationIdValue);
    const input = parseCreateInvitation(body);
    const session = await this.authorizationService.authorizeOrganization(
      readSessionToken(request),
      organizationId,
      'organization.members.manage',
    );

    return this.organizationInvitationsService.create(organizationId, session.user.id, input);
  }

  @Get(':organizationId/invitations')
  async listInvitations(
    @Param('organizationId') organizationIdValue: string,
    @Req() request: RequestLike,
  ) {
    const organizationId = parseOrganizationId(organizationIdValue);
    await this.authorizationService.authorizeOrganization(
      readSessionToken(request),
      organizationId,
      'organization.members.read',
    );
    return this.organizationInvitationsService.list(organizationId);
  }

  @Delete(':organizationId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvitation(
    @Param('organizationId') organizationIdValue: string,
    @Param('invitationId') invitationIdValue: string,
    @Req() request: RequestLike,
  ): Promise<void> {
    assertCsrf(request);
    const organizationId = parseOrganizationId(organizationIdValue);
    const invitationId = parseInvitationId(invitationIdValue);
    const session = await this.authorizationService.authorizeOrganization(
      readSessionToken(request),
      organizationId,
      'organization.members.manage',
    );
    await this.organizationInvitationsService.revoke(
      organizationId,
      invitationId,
      session.user.id,
    );
  }
}

function parseCreateOrganization(body: unknown): CreateOrganizationInput {
  const parsed = createOrganizationSchema.safeParse(body);
  if (parsed.success) {
    return {
      displayName: parsed.data.displayName,
      ...(parsed.data.legalName ? { legalName: parsed.data.legalName } : {}),
      ...(parsed.data.slug ? { slug: parsed.data.slug } : {}),
    };
  }

  throw new BadRequestException({
    code: 'INVALID_ORGANIZATION_PAYLOAD',
    message: 'Organization details are invalid.',
    details: parsed.error.flatten(),
  });
}

function parseCreateInvitation(body: unknown): CreateOrganizationInvitationInput {
  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'INVALID_ORGANIZATION_INVITATION_PAYLOAD',
      message: 'Organization invitation details are invalid.',
      details: parsed.error.flatten(),
    });
  }

  return {
    email: parsed.data.email,
    roleKey: parsed.data.roleKey as OrganizationRoleKey,
  };
}

function parseInvitationToken(body: unknown): string {
  const parsed = invitationTokenSchema.safeParse(body);
  if (parsed.success) return parsed.data.token;

  throw new BadRequestException({
    code: 'INVALID_ORGANIZATION_INVITATION_TOKEN_PAYLOAD',
    message: 'Invitation token is invalid.',
    details: parsed.error.flatten(),
  });
}

function parseOrganizationId(value: string): string {
  const parsed = organizationIdSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new BadRequestException('Organization id is invalid.');
}

function parseInvitationId(value: string): string {
  const parsed = invitationIdSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new BadRequestException('Invitation id is invalid.');
}

function readOrganizationIdHeader(request: RequestLike): string {
  const value = request.headers['x-organization-id'];
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) {
    throw new BadRequestException({
      code: 'ORGANIZATION_CONTEXT_REQUIRED',
      message: 'X-Organization-Id is required for this workspace request.',
    });
  }
  return parseOrganizationId(header);
}
