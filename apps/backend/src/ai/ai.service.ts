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
import type { ChatMessage, ChatResponse } from '@prime/shared';
import { describeSnapshot, SystemService } from '../system/system.service';
import { buildSystemInstruction, SYSTEM_DISPLAY_TAG } from './prime.persona';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 30_000;

// Backup for the model's display tag: questions that are clearly about the machine.
const SYSTEM_QUESTION =
  /\b(cpu|processor|ram|memory usage|disk|storage|drive space|battery|gpu|graphics card|temperature|diagnos\w*|uptime|system (status|stats|health|report|check)|(pc|computer|laptop|machine)('s)? (status|health|performance|stats))\b/i;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DISPLAY_TAG_PATTERN = new RegExp(`\\s*${escapeRegExp(SYSTEM_DISPLAY_TAG)}\\s*`, 'g');

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  private readonly client: GoogleGenAI | null;

  constructor(private readonly systemService: SystemService) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set; /api/chat will return 503.');
    }
    this.client = apiKey
      ? new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } })
      : null;
  }

  async chat(message: string, history: ChatMessage[]): Promise<ChatResponse> {
    if (!this.client) {
      throw new ServiceUnavailableException('My apologies, Sir. My AI link has not been configured yet.');
    }

    const telemetry = await this.getTelemetry();
    const systemInstruction = buildSystemInstruction(telemetry);

    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: toGeminiContents(message, history),
        config: { systemInstruction },
      });

      const raw = response.text?.trim() ?? '';
      const tagged = raw.includes(SYSTEM_DISPLAY_TAG);
      const reply = raw.replace(DISPLAY_TAG_PATTERN, ' ').trim();
      if (!reply) {
        throw new BadGatewayException('My apologies, Sir. I received an empty response. Would you kindly try again?');
      }

      const showSystem = Boolean(telemetry) && (tagged || SYSTEM_QUESTION.test(message));
      return showSystem ? { reply, display: 'system' } : { reply };
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private async getTelemetry(): Promise<string | null> {
    if (!this.systemService.enabled) return null;
    try {
      return describeSnapshot(await this.systemService.getSnapshot());
    } catch (error) {
      this.logger.warn(`Telemetry unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private toHttpException(error: unknown): HttpException {
    if (error instanceof HttpException) return error;

    if (error instanceof ApiError) {
      this.logger.error(`Gemini API error ${error.status}: ${error.message.slice(0, 300)}`);
      switch (error.status) {
        case 429: {
          if (/PerDay/i.test(error.message)) {
            return new HttpException(
              `My apologies, Sir. Today's free allowance for ${this.model} has been used up. It resets tomorrow, or another model can be set in GEMINI_MODEL.`,
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
          const retrySeconds = Number(/retry in ([\d.]+)s/i.exec(error.message)?.[1]);
          const wait = retrySeconds > 0 ? `about ${Math.ceil(retrySeconds)} seconds` : 'a moment';
          return new HttpException(
            `My apologies, Sir. I have reached my request limit. Kindly allow me ${wait} before trying again.`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        case 400:
        case 401:
        case 403:
          return new BadGatewayException('My apologies, Sir. My AI provider declined the request. The server configuration may need checking.');
        case 503:
          return new ServiceUnavailableException('My apologies, Sir. The AI model is rather busy at the moment. Please try again shortly.');
        default:
          return new BadGatewayException('My apologies, Sir. My AI provider returned an error. Would you kindly try again?');
      }
    }

    if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) {
      this.logger.error(`Gemini request timed out: ${error.message}`);
      return new GatewayTimeoutException('My apologies, Sir. That took longer than expected. Would you kindly try again?');
    }

    this.logger.error('Unexpected error calling Gemini', error instanceof Error ? error.stack : String(error));
    return new BadGatewayException('My apologies, Sir. I am unable to reach my AI provider just now. Please try again.');
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
