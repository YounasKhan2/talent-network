import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  liveness() {
    return this.healthService.liveness();
  }

  @Get('ready')
  async readiness() {
    const result = await this.healthService.readiness();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
