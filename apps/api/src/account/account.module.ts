import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AccountContextController } from './account-context.controller.js';
import { AccountContextService } from './account-context.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AccountContextController],
  providers: [AccountContextService],
})
export class AccountModule {}
