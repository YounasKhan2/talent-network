import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ResumesService } from './resumes.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ResumesService],
  exports: [ResumesService],
})
export class ResumesModule {}
