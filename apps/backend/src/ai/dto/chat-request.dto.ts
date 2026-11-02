import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { ChatMessage, ChatRequest, ChatRole, MediaState, UserLocation } from '@prime/shared';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_HISTORY_MESSAGES = 50;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ChatMessageDto implements ChatMessage {
  @IsIn(['user', 'assistant'])
  role: ChatRole;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH * 4)
  content: string;
}

export class UserLocationDto implements UserLocation {
  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class MediaStateDto implements MediaState {
  @IsString()
  @MaxLength(300)
  title: string;

  @IsBoolean()
  playing: boolean;
}

export class ChatRequestDto implements ChatRequest {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MESSAGE_LENGTH)
  message: string;

  @IsArray()
  @ArrayMaxSize(MAX_HISTORY_MESSAGES)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history: ChatMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UserLocationDto)
  location?: UserLocationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaStateDto)
  media?: MediaStateDto;
}
