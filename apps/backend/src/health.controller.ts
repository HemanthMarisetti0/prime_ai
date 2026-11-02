import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@prime/shared';

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
