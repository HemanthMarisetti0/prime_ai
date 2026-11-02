import type { ChatResponse } from '@prime/shared';

export class ChatResponseDto implements ChatResponse {
  reply: string;
}
