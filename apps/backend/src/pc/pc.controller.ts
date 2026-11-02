import { Body, Controller, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import type { SystemVolume } from '@prime/shared';
import { VolumeRequestDto } from './dto/volume-request.dto';
import { toVolumeAction } from './volume-action';
import { VolumeService } from './volume.service';

@Controller('pc')
export class PcController {
  constructor(private readonly volumeService: VolumeService) {}

  @Post('volume')
  @HttpCode(200)
  async volume(@Body() body: VolumeRequestDto): Promise<SystemVolume> {
    if (!this.volumeService.enabled) {
      throw new ServiceUnavailableException('My apologies, Sir. System volume control is disabled on this server.');
    }
    try {
      return await this.volumeService.run(toVolumeAction(body.action, body.level));
    } catch {
      throw new ServiceUnavailableException('My apologies, Sir. I was unable to adjust the system volume.');
    }
  }
}
