import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
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
import type {
  ChatImage,
  ChatImageMimeType,
  ChatMessage,
  ChatRequest,
  ChatRole,
  MediaState,
  UserLocation,
} from '@prime/shared';

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

// ~4.5 MB of image data once decoded; the frontend downsizes images well below this.
export const MAX_IMAGE_BASE64_LENGTH = 6_000_000;

export class ChatImageDto implements ChatImage {
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType: ChatImageMimeType;

  @IsBase64()
  @MaxLength(MAX_IMAGE_BASE64_LENGTH)
  data: string;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatImageDto)
  image?: ChatImageDto;
}
