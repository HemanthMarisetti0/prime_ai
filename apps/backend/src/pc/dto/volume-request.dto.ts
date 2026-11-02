import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { SystemVolumeAction, SystemVolumeRequest } from '@prime/shared';

export const VOLUME_ACTIONS: SystemVolumeAction[] = ['get', 'set', 'up', 'down', 'mute', 'unmute'];

export class VolumeRequestDto implements SystemVolumeRequest {
  @IsIn(VOLUME_ACTIONS)
  action: SystemVolumeAction;

  /** Target level for "set", or step size for "up"/"down". */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  level?: number;
}
