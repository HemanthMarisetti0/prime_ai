import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { ChatMessage, ChatRequest, ChatRole } from '@prime/shared';

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
}
