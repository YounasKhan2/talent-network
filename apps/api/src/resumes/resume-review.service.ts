import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatabaseClient } from '@talent-network/database';
import { DATABASE_CLIENT } from '../database/database.module.js';

const passportVersionInclude = {
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

@Injectable()
export class ResumeReviewService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async getReview(userId: string, resumeId: string) {
    const resume = await this.database.resume.findFirst({
      where: { id: resumeId, candidate: { userId } },
      select: {
        id: true,
        title: true,
        currentVersionId: true,
        createdAt: true,
        updatedAt: true,
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
            processingState: true,
            failureCode: true,
            failureMetadata: true,
            processingPipelineVersion: true,
            uploadedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        candidate: {
          select: {
            id: true,
            currentProfileVersion: { include: passportVersionInclude },
          },
        },
      },
    });

    if (!resume) throw new NotFoundException({ code: 'RESUME_NOT_FOUND' });

    const currentVersion = resume.currentVersion;
    const parseResult = currentVersion
      ? await this.database.resumeParseResult.findFirst({
          where: { resumeVersionId: currentVersion.id, status: 'COMPLETED' },
          orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            sourceExtractionId: true,
            parserName: true,
            parserVersion: true,
            schemaVersion: true,
            parserPolicyVersion: true,
            evidencePolicyVersion: true,
            promptVersion: true,
            provider: true,
            model: true,
            status: true,
            parsedJson: true,
            confidenceSummary: true,
            warnings: true,
            completedAt: true,
            createdAt: true,
          },
        })
      : null;

    return {
      resume: {
        id: resume.id,
        title: resume.title,
        currentVersionId: resume.currentVersionId,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      },
      version: currentVersion,
      proposal: parseResult,
      passport: {
        candidateId: resume.candidate.id,
        currentProfileVersion: resume.candidate.currentProfileVersion,
      },
      review: {
        available: currentVersion?.processingState === 'READY_FOR_REVIEW' && parseResult !== null,
        blockingReason: readBlockingReason(
          currentVersion?.processingState ?? null,
          parseResult !== null,
        ),
      },
    };
  }
}

function readBlockingReason(processingState: string | null, hasProposal: boolean): string | null {
  if (!processingState) return 'RESUME_VERSION_NOT_AVAILABLE';
  if (processingState === 'READY_FOR_REVIEW' && hasProposal) return null;
  if (processingState === 'FAILED_TERMINAL') return 'PROCESSING_FAILED_TERMINAL';
  if (processingState === 'REJECTED') return 'RESUME_REJECTED';
  if (processingState === 'APPROVED') return 'REVIEW_ALREADY_APPROVED';
  if (!hasProposal && processingState === 'READY_FOR_REVIEW') {
    return 'PARSE_PROPOSAL_NOT_AVAILABLE';
  }
  return 'PROCESSING_IN_PROGRESS';
}
