import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { PcAppId, PcPowerAction } from '@prime/shared';
import { PC_APP_IDS } from '../apps';

export const BRIGHTNESS_ACTIONS = ['get', 'set', 'up', 'down'] as const;
export type BrightnessAction = (typeof BRIGHTNESS_ACTIONS)[number];
export const POWER_ACTIONS: PcPowerAction[] = ['lock', 'sleep'];

export class OpenAppDto {
  @IsIn(PC_APP_IDS)
  app: PcAppId;
}

export class BrightnessDto {
  @IsIn(BRIGHTNESS_ACTIONS)
  action: BrightnessAction;

  /** Target level for "set", or step size for "up"/"down". */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  level?: number;
}

export class PowerDto {
  @IsIn(POWER_ACTIONS)
  action: PcPowerAction;
}
