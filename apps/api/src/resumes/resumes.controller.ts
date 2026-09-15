import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { assertCsrf, readSessionToken, type RequestLike } from '../auth/auth.http.js';
import { ResumeReviewService } from './resume-review.service.js';
import { ResumesService } from './resumes.service.js';

const uploadAuthorizationSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    originalFilename: z.string().trim().min(1).max(255),
    mimeType: z.enum([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .strict();

const uploadCompletionSchema = z.object({ resumeVersionId: z.string().uuid() }).strict();

@Controller('candidate/resumes')
export class ResumesController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(ResumesService) private readonly resumesService: ResumesService,
    @Inject(ResumeReviewService) private readonly resumeReviewService: ResumeReviewService,
  ) {}

  @Get()
  async list(@Req() request: RequestLike) {
    const session = await this.authService.getSession(readSessionToken(request));
    return this.resumesService.list(session.user.id);
  }

  @Get(':resumeId/review')
  async getReview(@Param('resumeId') resumeId: string, @Req() request: RequestLike) {
    const session = await this.authService.getSession(readSessionToken(request));
    return this.resumeReviewService.getReview(session.user.id, resumeId);
  }

  @Get(':resumeId')
  async get(@Param('resumeId') resumeId: string, @Req() request: RequestLike) {
    const session = await this.authService.getSession(readSessionToken(request));
    return this.resumesService.get(session.user.id, resumeId);
  }

  @Post('upload-authorization')
  async authorizeUpload(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    const parsed = uploadAuthorizationSchema.parse(body);
    return this.resumesService.createUploadAuthorization(session.user.id, parsed);
  }

  @Post('upload-complete')
  async completeUpload(@Body() body: unknown, @Req() request: RequestLike) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    const parsed = uploadCompletionSchema.parse(body);
    return this.resumesService.completeDirectUpload(session.user.id, parsed.resumeVersionId);
  }

  @Post(':resumeVersionId/download-authorization')
  async authorizeDownload(
    @Param('resumeVersionId') resumeVersionId: string,
    @Req() request: RequestLike,
  ) {
    assertCsrf(request);
    const session = await this.authService.getSession(readSessionToken(request));
    return this.resumesService.createDownloadAuthorization(session.user.id, resumeVersionId);
  }
}
