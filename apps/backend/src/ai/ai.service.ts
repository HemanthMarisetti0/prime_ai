import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiError, GoogleGenAI, type Content, type FunctionCall, type FunctionDeclaration } from '@google/genai';
import type { ChatMessage, ChatResponse, NewsReport, UserLocation, WeatherReport } from '@prime/shared';
import { env } from '../config/env';
import { describeSnapshot, SystemService } from '../system/system.service';
import { NewsService } from '../tools/news.service';
import { WeatherService } from '../tools/weather.service';
import { buildSystemInstruction, SYSTEM_DISPLAY_TAG } from './prime.persona';

const REQUEST_TIMEOUT_MS = 30_000;
// Upper bound on model <-> tool round trips per message.
const MAX_TOOL_ROUNDS = 3;

// Backup for the model's display tag: questions that are clearly about the machine.
const SYSTEM_QUESTION =
  /\b(cpu|processor|ram|memory usage|disk|storage|drive space|battery|gpu|graphics card|(cpu|gpu) temp\w*|diagnos\w*|uptime|system (status|stats|health|report|check)|(pc|computer|laptop|machine)('s)? (status|health|performance|stats))\b/i;

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_weather',
    description: "Current weather and a 3-day forecast. Omit 'location' to use Sir's current location.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'A place name such as "London" or "Mumbai, India".' },
      },
    },
  },
  {
    name: 'get_news',
    description: "Latest news headlines. Omit 'topic' for today's top stories.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'A short search topic such as "cricket" or "artificial intelligence".' },
      },
    },
  },
];

interface ToolResults {
  weather?: WeatherReport;
  news?: NewsReport;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DISPLAY_TAG_PATTERN = new RegExp(`\\s*${escapeRegExp(SYSTEM_DISPLAY_TAG)}\\s*`, 'g');

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model = env.gemini.model;
  private readonly client: GoogleGenAI | null;

  constructor(
    private readonly systemService: SystemService,
    private readonly weatherService: WeatherService,
    private readonly newsService: NewsService,
  ) {
    const { apiKey } = env.gemini;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set; /api/chat will return 503.');
    }
    this.client = apiKey
      ? new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } })
      : null;
  }

  async chat(message: string, history: ChatMessage[], location?: UserLocation): Promise<ChatResponse> {
    if (!this.client) {
      throw new ServiceUnavailableException('My apologies, Sir. My AI link has not been configured yet.');
    }

    const telemetry = await this.getTelemetry();
    const config = { systemInstruction: buildSystemInstruction(telemetry), tools: [{ functionDeclarations: TOOLS }] };
    const contents = toGeminiContents(message, history);
    const results: ToolResults = {};

    try {
      let raw = '';
      for (let round = 0; ; round++) {
        const response = await this.client.models.generateContent({ model: this.model, contents, config });
        const calls = response.functionCalls ?? [];
        if (!calls.length || round === MAX_TOOL_ROUNDS) {
          raw = response.text?.trim() ?? '';
          break;
        }
        // Keep the model's turn verbatim (it carries thought signatures), then answer each call.
        const modelTurn = response.candidates?.[0]?.content;
        if (modelTurn) contents.push(modelTurn);
        const parts = await Promise.all(
          calls.map(async (call) => ({
            functionResponse: { id: call.id, name: call.name, response: await this.runTool(call, location, results) },
          })),
        );
        contents.push({ role: 'user', parts });
      }

      const tagged = raw.includes(SYSTEM_DISPLAY_TAG);
      const reply = raw.replace(DISPLAY_TAG_PATTERN, ' ').trim();
      if (!reply) {
        throw new BadGatewayException('My apologies, Sir. I received an empty response. Would you kindly try again?');
      }

      const showSystem = Boolean(telemetry) && (tagged || SYSTEM_QUESTION.test(message));
      return { reply, ...(showSystem && { display: 'system' as const }), ...results };
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /** Executes one tool call; failures are reported back to the model so it can apologise gracefully. */
  private async runTool(
    call: FunctionCall,
    location: UserLocation | undefined,
    results: ToolResults,
  ): Promise<Record<string, unknown>> {
    const args = (call.args ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
    try {
      switch (call.name) {
        case 'get_weather':
          results.weather = await this.weatherService.getWeather(text(args.location), location);
          return { output: results.weather };
        case 'get_news': {
          results.news = await this.newsService.getNews(text(args.topic));
          // The model only needs headlines; links are shown on the display.
          const { topic, items } = results.news;
          return { output: { topic, headlines: items.map(({ title, source, publishedAt }) => ({ title, source, publishedAt })) } };
        }
        default:
          return { error: `Unknown tool ${call.name}` };
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Tool ${call.name} failed: ${reason}`);
      return { error: reason };
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
