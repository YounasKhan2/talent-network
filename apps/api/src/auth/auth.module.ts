import { Module } from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService],
  exports: [AuthService],
})
export class AuthModule {}
