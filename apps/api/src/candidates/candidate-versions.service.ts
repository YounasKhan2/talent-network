import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatabaseClient } from '@talent-network/database';
import { DATABASE_CLIENT } from '../database/database.module.js';

const versionInclude = {
  employments: { orderBy: { sortOrder: 'asc' as const } },
  education: { orderBy: { sortOrder: 'asc' as const } },
  skills: { orderBy: { sortOrder: 'asc' as const } },
  projects: { orderBy: { sortOrder: 'asc' as const } },
  certifications: { orderBy: { sortOrder: 'asc' as const } },
  languages: { orderBy: { sortOrder: 'asc' as const } },
  links: { orderBy: { sortOrder: 'asc' as const } },
  locationPreferences: { orderBy: { sortOrder: 'asc' as const } },
  customSections: {
    orderBy: { sortOrder: 'asc' as const },
    include: { items: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

export interface CandidateVersionListOptions {
  beforeVersionNumber?: number;
  limit: number;
}

@Injectable()
export class CandidateVersionsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async list(userId: string, options: CandidateVersionListOptions) {
    const candidate = await this.database.candidate.findUnique({
      where: { userId },
      select: { id: true, currentProfileVersionId: true },
    });
    if (!candidate) throw candidateNotInitialized();

    const versions = await this.database.candidateProfileVersion.findMany({
      where: {
        candidateId: candidate.id,
        ...(options.beforeVersionNumber === undefined
          ? {}
          : { versionNumber: { lt: options.beforeVersionNumber } }),
      },
      orderBy: { versionNumber: 'desc' },
      take: options.limit + 1,
      select: {
        id: true,
        versionNumber: true,
        status: true,
        source: true,
        approvedAt: true,
        createdAt: true,
      },
    });

    const hasMore = versions.length > options.limit;
    const page = hasMore ? versions.slice(0, options.limit) : versions;
    const nextCursor = hasMore ? (page.at(-1)?.versionNumber ?? null) : null;

    return {
      currentProfileVersionId: candidate.currentProfileVersionId,
      versions: page.map((version) => ({
        ...version,
        isCurrent: version.id === candidate.currentProfileVersionId,
      })),
      nextCursor,
    };
  }

  async get(userId: string, versionNumber: number) {
    const candidate = await this.database.candidate.findUnique({
      where: { userId },
      select: { id: true, currentProfileVersionId: true },
    });
    if (!candidate) throw candidateNotInitialized();

    const version = await this.database.candidateProfileVersion.findFirst({
      where: { candidateId: candidate.id, versionNumber },
      include: versionInclude,
    });
    if (!version) {
      throw new NotFoundException({
        code: 'CANDIDATE_PROFILE_VERSION_NOT_FOUND',
        message: 'The requested Career Passport version was not found.',
      });
    }

    return {
      ...version,
      isCurrent: version.id === candidate.currentProfileVersionId,
    };
  }
}

function candidateNotInitialized(): NotFoundException {
  return new NotFoundException({
    code: 'CANDIDATE_PASSPORT_NOT_INITIALIZED',
    message: 'Candidate Career Passport has not been initialized yet.',
  });
}
