import { Module } from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthTokenDeliveryService } from './auth-token-delivery.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService, AuthTokenDeliveryService],
  exports: [AuthService],
})
export class AuthModule {}
