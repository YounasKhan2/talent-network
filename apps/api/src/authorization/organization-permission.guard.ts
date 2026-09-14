import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';
import { readSessionToken, type RequestLike } from '../auth/auth.http.js';
import { AuthorizationService } from './authorization.service.js';
import {
  ORGANIZATION_PERMISSION_METADATA,
  type OrganizationIdSource,
  type OrganizationPermissionRequirement,
} from './organization-permission.decorator.js';

const organizationIdSchema = z.string().uuid();

interface GuardRequest extends RequestLike {
  params?: Record<string, string | undefined>;
}

@Injectable()
export class OrganizationPermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthorizationService) private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<OrganizationPermissionRequirement>(
      ORGANIZATION_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest<GuardRequest>();
    const organizationId = readOrganizationId(request, requirement.organizationIdSource);

    await this.authorizationService.authorizeOrganization(
      readSessionToken(request),
      organizationId,
      requirement.permission,
    );

    return true;
  }
}

function readOrganizationId(request: GuardRequest, source: OrganizationIdSource): string {
  const rawValue =
    source.kind === 'param'
      ? request.params?.[source.name]
      : readHeader(request, source.name.toLowerCase());

  const parsed = organizationIdSchema.safeParse(rawValue);
  if (parsed.success) return parsed.data;

  throw new BadRequestException({
    code: source.kind === 'header' ? 'ORGANIZATION_CONTEXT_REQUIRED' : 'INVALID_ORGANIZATION_ID',
    message:
      source.kind === 'header'
        ? `${source.name} must contain a valid organization id.`
        : 'Organization id is invalid.',
  });
}

function readHeader(request: GuardRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
