import type { ChatDisplay, ChatResponse } from '@prime/shared';

export class ChatResponseDto implements ChatResponse {
  reply: string;
  display?: ChatDisplay;
}
