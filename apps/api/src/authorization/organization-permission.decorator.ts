import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@talent-network/contracts';

export const ORGANIZATION_PERMISSION_METADATA = 'talent-network:organization-permission';

export type OrganizationIdSource =
  { kind: 'param'; name: string } | { kind: 'header'; name: string };

export interface OrganizationPermissionRequirement {
  permission: Permission;
  organizationIdSource: OrganizationIdSource;
}

export function RequireOrganizationPermission(
  permission: Permission,
  organizationIdSource: OrganizationIdSource = { kind: 'param', name: 'organizationId' },
) {
  return SetMetadata(ORGANIZATION_PERMISSION_METADATA, {
    permission,
    organizationIdSource,
  } satisfies OrganizationPermissionRequirement);
}
