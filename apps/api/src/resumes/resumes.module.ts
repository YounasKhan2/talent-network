import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ResumesController } from './resumes.controller.js';
import { ResumesService } from './resumes.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule],
  controllers: [ResumesController],
  providers: [ResumesService],
  exports: [ResumesService],
})
export class ResumesModule {}
