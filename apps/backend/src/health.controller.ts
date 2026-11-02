import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@prime/shared';
import { Public } from './auth/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
