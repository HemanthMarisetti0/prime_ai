import { Body, Controller, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import type { ScreenBrightness, SystemVolume } from '@prime/shared';
import { BrightnessDto, OpenAppDto, PowerDto } from './dto/pc-requests.dto';
import { VolumeRequestDto } from './dto/volume-request.dto';
import { PcService } from './pc.service';
import { toVolumeAction } from './volume-action';
import { VolumeService } from './volume.service';

const DISABLED = 'My apologies, Sir. PC control is disabled on this server.';

@Controller('pc')
export class PcController {
  constructor(
    private readonly volumeService: VolumeService,
    private readonly pcService: PcService,
  ) {}

  @Post('volume')
  @HttpCode(200)
  async volume(@Body() body: VolumeRequestDto): Promise<SystemVolume> {
    if (!this.volumeService.enabled) throw new ServiceUnavailableException(DISABLED);
    try {
      return await this.volumeService.run(toVolumeAction(body.action, body.level));
    } catch {
      throw new ServiceUnavailableException('My apologies, Sir. I was unable to adjust the system volume.');
    }
  }

  @Post('app')
  @HttpCode(200)
  async openApp(@Body() body: OpenAppDto): Promise<{ app: string }> {
    return this.attempt(() => this.pcService.openApp(body.app));
  }

  @Post('brightness')
  @HttpCode(200)
  async brightness(@Body() body: BrightnessDto): Promise<ScreenBrightness> {
    return this.attempt(() => this.pcService.brightness(body.action, body.level));
  }

  @Post('power')
  @HttpCode(200)
  power(@Body() body: PowerDto) {
    return this.attempt(async () => this.pcService.power(body.action));
  }

  private async attempt<T>(action: () => Promise<T>): Promise<T> {
    if (!this.pcService.enabled) throw new ServiceUnavailableException(DISABLED);
    try {
      return await action();
    } catch (error) {
      throw new ServiceUnavailableException(
        `My apologies, Sir. ${error instanceof Error ? error.message : 'That action failed.'}`,
      );
    }
  }
}
