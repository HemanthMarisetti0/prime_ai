import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { SystemSnapshot } from '@prime/shared';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get()
  async snapshot(): Promise<SystemSnapshot> {
    if (!this.systemService.enabled) {
      throw new ServiceUnavailableException('System monitoring is disabled on this server.');
    }
    return this.systemService.getSnapshot();
  }
}
