import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiError, GoogleGenAI, type Content } from '@google/genai';
import type { ChatMessage } from '@prime/shared';
import { PRIME_SYSTEM_INSTRUCTION } from './prime.persona';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  private readonly client: GoogleGenAI | null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set; /api/chat will return 503.');
    }
    this.client = apiKey
      ? new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } })
      : null;
  }

  async chat(message: string, history: ChatMessage[]): Promise<string> {
    if (!this.client) {
      throw new ServiceUnavailableException('AI provider is not configured.');
    }

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: toGeminiContents(message, history),
        config: { systemInstruction: PRIME_SYSTEM_INSTRUCTION },
      });

      const reply = response.text?.trim();
      if (!reply) {
        throw new BadGatewayException('The AI returned an empty response. Please try again.');
      }
      return reply;
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private toHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) return error;

    if (error instanceof ApiError) {
      this.logger.error(`Gemini API error ${error.status}: ${error.message.slice(0, 300)}`);
      switch (error.status) {
        case 429: {
          const retrySeconds = Number(/retry in ([\d.]+)s/i.exec(error.message)?.[1]);
          const wait = retrySeconds > 0 ? `about ${Math.ceil(retrySeconds)} seconds` : 'a moment';
          return new HttpException(
            `Rate limit reached. Please try again in ${wait}.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        case 400:
        case 401:
        case 403:
          return new BadGatewayException('The AI provider rejected the request. Check the server configuration.');
        case 503:
          return new ServiceUnavailableException('The AI model is overloaded right now. Please try again shortly.');
        default:
          return new BadGatewayException('The AI provider returned an error. Please try again.');
      }
    }

    if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) {
      this.logger.error(`Gemini request timed out: ${error.message}`);
      return new GatewayTimeoutException('The AI took too long to respond. Please try again.');
    }

    this.logger.error('Unexpected error calling Gemini', error instanceof Error ? error.stack : String(error));
    return new BadGatewayException('Unable to reach the AI provider. Please try again.');
  }
}

function toGeminiContents(message: string, history: ChatMessage[]): Content[] {
  const contents: Content[] = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  // Gemini expects the conversation to open with a user turn (e.g. drop a UI greeting).
  while (contents[0]?.role === 'model') contents.shift();
  contents.push({ role: 'user', parts: [{ text: message }] });
  return contents;
}
