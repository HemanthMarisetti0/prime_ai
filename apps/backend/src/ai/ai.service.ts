import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ChatMessage } from '@prime/shared';

@Injectable()
export class AiService {
  // Gemini integration is added in Step 5.
  async chat(_message: string, _history: ChatMessage[]): Promise<string> {
    throw new ServiceUnavailableException('AI provider is not configured yet.');
  }
}
