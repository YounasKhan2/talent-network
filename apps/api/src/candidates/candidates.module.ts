import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CandidatePassportCoreController } from './candidate-passport-core.controller.js';
import { CandidateVersionsController } from './candidate-versions.controller.js';
import { CandidateVersionsService } from './candidate-versions.service.js';
import { CandidatesController } from './candidates.controller.js';
import { CandidatesService } from './candidates.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CandidatesController, CandidatePassportCoreController, CandidateVersionsController],
  providers: [CandidatesService, CandidateVersionsService],
  exports: [CandidatesService, CandidateVersionsService],
})
export class CandidatesModule {}
