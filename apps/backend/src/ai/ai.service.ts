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
import type {
  ChatImage,
  ChatMessage,
  ChatResponse,
  MediaState,
  DirectionsResult,
  NewsReport,
  PcAppId,
  PcPowerAction,
  PlacesResult,
  SystemVolumeAction,
  TravelMode,
  TripPlan,
  UserLocation,
  WeatherReport,
  YouTubeResults,
} from '@prime/shared';
import { env } from '../config/env';
import { PC_APP_IDS } from '../pc/apps';
import { BRIGHTNESS_ACTIONS, POWER_ACTIONS, type BrightnessAction } from '../pc/dto/pc-requests.dto';
import { VOLUME_ACTIONS } from '../pc/dto/volume-request.dto';
import { PcService } from '../pc/pc.service';
import { toVolumeAction } from '../pc/volume-action';
import { VolumeService } from '../pc/volume.service';
import { describeSnapshot, SystemService } from '../system/system.service';
import { CurrencyService } from '../tools/currency.service';
import { DirectionsService } from '../tools/directions.service';
import { GeoService } from '../tools/geo.service';
import { NewsService } from '../tools/news.service';
import { WeatherService } from '../tools/weather.service';
import { YouTubeService } from '../tools/youtube.service';
import { classifyModelError, ModelPool } from './model-pool';
import { buildSystemInstruction, SYSTEM_DISPLAY_TAG } from './prime.persona';

const REQUEST_TIMEOUT_MS = 45_000;
const RETRY_DELAY_MS = 1500;
// Upper bound on model <-> tool round trips per message.
const MAX_TOOL_ROUNDS = 4;

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
  {
    name: 'search_youtube',
    description:
      "Find YouTube videos or music and show them on Sir's display. Set 'play' to true when Sir asks to play something now; false when Sir only wants suggestions or links.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for, e.g. "Believer Imagine Dragons" or "lofi study music".' },
        play: { type: 'boolean', description: 'Start playing the best match immediately.' },
      },
      required: ['query'],
    },
  },
];

const TRAVEL_TOOLS: FunctionDeclaration[] = [
  {
    name: 'find_places',
    description:
      "Find places, businesses or addresses on the map. Set 'near_me' for searches around Sir's current location (e.g. \"cafes near me\").",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to find, e.g. "coffee shop", "Charminar, Hyderabad", "petrol pump".' },
        near_me: { type: 'boolean' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_directions',
    description: "Route, distance and travel time to a destination. Omit 'origin' to start from Sir's current location.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        origin: { type: 'string' },
        mode: { type: 'string', enum: ['driving', 'walking', 'cycling', 'transit'], description: 'Defaults to driving.' },
      },
      required: ['destination'],
    },
  },
  {
    name: 'convert_currency',
    description: 'Convert money between currencies at current reference exchange rates.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        from: { type: 'string', description: 'Three-letter code, e.g. USD.' },
        to: { type: 'string', description: 'Three-letter code, e.g. INR.' },
      },
      required: ['amount', 'from', 'to'],
    },
  },
  {
    name: 'show_trip_plan',
    description:
      "Display a structured travel itinerary and budget on Sir's screen. Call it whenever you plan a trip; costs are your best estimates.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        duration_days: { type: 'integer', minimum: 1, maximum: 30 },
        travellers: { type: 'integer', minimum: 1, maximum: 20 },
        summary: { type: 'string', description: 'One or two sentences.' },
        days: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              day: { type: 'integer' },
              title: { type: 'string' },
              activities: { type: 'array', items: { type: 'string' } },
            },
            required: ['day', 'title', 'activities'],
          },
        },
        currency: { type: 'string', description: 'Three-letter code for all amounts, e.g. INR.' },
        budget_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', description: 'e.g. Travel, Stay, Food, Activities, Local transport, Buffer.' },
              amount: { type: 'number' },
              note: { type: 'string' },
            },
            required: ['category', 'amount'],
          },
        },
        tips: { type: 'array', items: { type: 'string' } },
      },
      required: ['destination', 'duration_days', 'days', 'currency', 'budget_items'],
    },
  },
];

const TRAVEL_MODES: TravelMode[] = ['driving', 'walking', 'cycling', 'transit'];

/** Validates and normalises the model's trip plan arguments for display. */
function toTripPlan(args: Record<string, unknown>): TripPlan {
  const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim() : fallback);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const items = list(args.budget_items)
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({ category: str(item.category, 'Other'), amount: Math.max(0, Math.round(num(item.amount))), note: str(item.note) || undefined }))
    .slice(0, 12);
  return {
    destination: str(args.destination, 'Trip'),
    durationDays: Math.max(1, Math.min(30, Math.round(num(args.duration_days)) || 1)),
    travellers: Math.max(1, Math.min(20, Math.round(num(args.travellers)) || 1)),
    summary: str(args.summary),
    days: list(args.days)
      .map((day) => day as Record<string, unknown>)
      .map((day, i) => ({
        day: Math.round(num(day.day)) || i + 1,
        title: str(day.title, `Day ${i + 1}`),
        activities: list(day.activities).map((a) => str(a)).filter(Boolean).slice(0, 8),
      }))
      .slice(0, 30),
    budget: {
      currency: str(args.currency, 'INR').toUpperCase().slice(0, 3),
      items,
      total: items.reduce((sum, item) => sum + item.amount, 0),
    },
    tips: list(args.tips).map((t) => str(t)).filter(Boolean).slice(0, 6),
  };
}

const PC_TOOLS: FunctionDeclaration[] = [
  {
    name: 'open_app',
    description: "Open an application on Sir's computer. Only these apps are available.",
    parametersJsonSchema: {
      type: 'object',
      properties: { app: { type: 'string', enum: PC_APP_IDS } },
      required: ['app'],
    },
  },
  {
    name: 'set_brightness',
    description: "Read or change the screen brightness of Sir's laptop display.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...BRIGHTNESS_ACTIONS] },
        level: { type: 'integer', minimum: 0, maximum: 100, description: 'Target for "set", or step for "up"/"down" (default 10).' },
      },
      required: ['action'],
    },
  },
  {
    name: 'power_action',
    description: "Lock Sir's computer or put it to sleep. Only when Sir explicitly asks.",
    parametersJsonSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: POWER_ACTIONS } },
      required: ['action'],
    },
  },
];

const SYSTEM_VOLUME_TOOL: FunctionDeclaration = {
  name: 'set_system_volume',
  description:
    "Read or change the Windows system (master) volume of Sir's computer. Not for the YouTube player, which Sir's display controls directly.",
  parametersJsonSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['get', 'set', 'up', 'down', 'mute', 'unmute'] },
      level: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Target percentage for "set", or the step size for "up"/"down" (default 10).',
      },
    },
    required: ['action'],
  },
};

interface ToolResults {
  weather?: WeatherReport;
  news?: NewsReport;
  youtube?: YouTubeResults;
  places?: PlacesResult;
  directions?: DirectionsResult;
  trip?: TripPlan;
}

/** Per-request context from Sir's browser. */
export interface ChatContext {
  location?: UserLocation;
  media?: MediaState;
  image?: ChatImage;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DISPLAY_TAG_PATTERN = new RegExp(`\\s*${escapeRegExp(SYSTEM_DISPLAY_TAG)}\\s*`, 'g');

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly pool = new ModelPool([env.gemini.model, ...env.gemini.fallbackModels]);
  private readonly client: GoogleGenAI | null;
  private readonly tools: FunctionDeclaration[];

  constructor(
    private readonly systemService: SystemService,
    private readonly weatherService: WeatherService,
    private readonly newsService: NewsService,
    private readonly youtubeService: YouTubeService,
    private readonly volumeService: VolumeService,
    private readonly geoService: GeoService,
    private readonly directionsService: DirectionsService,
    private readonly currencyService: CurrencyService,
    private readonly pcService: PcService,
  ) {
    this.tools = [...TOOLS, ...TRAVEL_TOOLS, ...(volumeService.enabled ? [SYSTEM_VOLUME_TOOL, ...PC_TOOLS] : [])];
    const { apiKey } = env.gemini;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set; /api/chat will return 503.');
    }
    this.client = apiKey
      ? new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } })
      : null;
    this.logger.log(`Gemini models (in order of preference): ${this.pool.models.join(', ')}`);
  }

  async chat(message: string, history: ChatMessage[], context: ChatContext = {}): Promise<ChatResponse> {
    if (!this.client) {
      throw new ServiceUnavailableException('My apologies, Sir. My AI link has not been configured yet.');
    }

    const telemetry = await this.getTelemetry();
    const config = {
      systemInstruction: buildSystemInstruction(telemetry, context.media, this.volumeService.enabled),
      tools: [{ functionDeclarations: this.tools }],
    };
    const contents = toGeminiContents(message, history, context.image);
    const results: ToolResults = {};

    // Models not resting after earlier limits, in preference order.
    const candidates = this.pool.available();
    let model = candidates.shift();
    if (!model) throw this.allModelsResting();

    try {
      let raw = '';
      for (let round = 0; ; round++) {
        let response;
        for (;;) {
          try {
            response = await this.generateWithRetry({ model, contents, config });
            break;
          } catch (error) {
            const verdict = classifyModelError(error);
            if (!verdict) throw error;
            this.pool.rest(model, verdict.restSeconds);
            const next = candidates.shift();
            if (!next) throw this.pool.available().length ? error : this.allModelsResting();
            this.logger.warn(`${model} ${verdict.reason}; switching to ${next}`);
            // A different model can't validate the previous model's thought signatures.
            if (round > 0) neutraliseThoughtSignatures(contents);
            model = next;
          }
        }
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
            functionResponse: { id: call.id, name: call.name, response: await this.runTool(call, context, results) },
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
      return { reply, model, ...(showSystem && { display: 'system' as const }), ...results };
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /** Every model is resting after hitting its limits. */
  private allModelsResting(): HttpException {
    const seconds = this.pool.secondsUntilNextAvailable();
    const wait =
      seconds === null
        ? 'later'
        : seconds < 90
          ? `in about ${Math.max(seconds, 5)} seconds`
          : seconds < 2 * 3600
            ? `in about ${Math.ceil(seconds / 60)} minutes`
            : `in about ${Math.round(seconds / 3600)} hours`;
    return new HttpException(
      `My apologies, Sir. All of my free AI models have reached their limits for now. Kindly try again ${wait}.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** One retry for transient Gemini failures (overloaded, deadline exceeded, dropped connection). */
  private async generateWithRetry(params: Parameters<GoogleGenAI['models']['generateContent']>[0]) {
    try {
      return await this.client!.models.generateContent(params);
    } catch (error) {
      const transient =
        (error instanceof ApiError && [500, 503, 504].includes(error.status)) ||
        (error instanceof TypeError && /fetch failed/i.test(error.message));
      if (!transient) throw error;
      this.logger.warn(`Transient Gemini error (${error instanceof ApiError ? error.status : error.message}); retrying once`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return this.client!.models.generateContent(params);
    }
  }

  /** Executes one tool call; failures are reported back to the model so it can apologise gracefully. */
  private async runTool(
    call: FunctionCall,
    context: ChatContext,
    results: ToolResults,
  ): Promise<Record<string, unknown>> {
    const args = (call.args ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
    try {
      switch (call.name) {
        case 'get_weather':
          results.weather = await this.weatherService.getWeather(text(args.location), context.location);
          return { output: results.weather };
        case 'find_places': {
          const query = text(args.query)?.trim();
          if (!query) return { error: 'A search query is required.' };
          const nearMe = args.near_me === true;
          if (nearMe && !context.location) {
            return { error: "Sir's location is unknown. Politely ask for a city or area, or for location access." };
          }
          const places = await this.geoService.searchPlaces(query, nearMe ? context.location : undefined);
          if (!places.length) return { error: `Nothing matching "${query}" was found${nearMe ? ' nearby' : ''}.` };
          results.places = { query, near: nearMe ? (context.location?.label ?? 'your location') : null, places };
          return {
            output: places.map(({ name, address, category, distanceKm }) => ({ name, address, category, distanceKm })),
          };
        }
        case 'get_directions': {
          const destination = text(args.destination)?.trim();
          if (!destination) return { error: 'A destination is required.' };
          const mode = TRAVEL_MODES.includes(args.mode as TravelMode) ? (args.mode as TravelMode) : 'driving';
          results.directions = await this.directionsService.getDirections(destination, text(args.origin), mode, context.location);
          const { steps, navigationUrl: _url, ...summary } = results.directions;
          return {
            output: {
              ...summary,
              firstSteps: steps.slice(0, 3).map((s) => s.instruction),
              note:
                mode === 'transit'
                  ? 'Public transport routes are not computed; a Google Maps link with transit directions is shown on the display.'
                  : 'Times exclude live traffic. Full steps and a navigation link are shown on the display.',
            },
          };
        }
        case 'convert_currency': {
          const amount = typeof args.amount === 'number' ? args.amount : NaN;
          if (!Number.isFinite(amount)) return { error: 'A numeric amount is required.' };
          return { output: await this.currencyService.convert(amount, text(args.from) ?? '', text(args.to) ?? '') };
        }
        case 'show_trip_plan': {
          results.trip = toTripPlan(args);
          return { output: { displayed: true, total: results.trip.budget.total, currency: results.trip.budget.currency } };
        }
        case 'open_app': {
          const app = text(args.app) as PcAppId | undefined;
          if (!app || !PC_APP_IDS.includes(app)) return { error: `That application is not on the allowed list: ${PC_APP_IDS.join(', ')}.` };
          return { output: { opened: (await this.pcService.openApp(app)).app } };
        }
        case 'set_brightness': {
          const action = text(args.action) as BrightnessAction | undefined;
          if (!action || !BRIGHTNESS_ACTIONS.includes(action)) return { error: 'Unknown brightness action.' };
          const level = typeof args.level === 'number' ? args.level : undefined;
          return { output: { brightnessPercent: (await this.pcService.brightness(action, level)).percent } };
        }
        case 'power_action': {
          const action = text(args.action) as PcPowerAction | undefined;
          if (!action || !POWER_ACTIONS.includes(action)) return { error: 'Unknown power action.' };
          const { inSeconds } = this.pcService.power(action);
          return { output: { scheduled: action, inSeconds } };
        }
        case 'set_system_volume': {
          const action = text(args.action) as SystemVolumeAction | undefined;
          if (!action || !VOLUME_ACTIONS.includes(action)) return { error: 'Unknown volume action.' };
          const level = typeof args.level === 'number' ? Math.round(Math.max(0, Math.min(100, args.level))) : undefined;
          const volume = await this.volumeService.run(toVolumeAction(action, level));
          return { output: { systemVolumePercent: volume.percent, muted: volume.muted } };
        }
        case 'search_youtube': {
          const query = text(args.query)?.trim();
          if (!query) return { error: 'A search query is required.' };
          results.youtube = await this.youtubeService.search(query, args.play === true);
          const { videos, autoplay } = results.youtube;
          if (!videos.length) {
            return {
              output: {
                note: 'Specific videos are unavailable (no YouTube API key). A YouTube search link for the query is shown on the display; nothing is playing.',
              },
            };
          }
          return {
            output: {
              nowPlaying: autoplay ? { title: videos[0].title, channel: videos[0].channel } : null,
              suggestions: videos.map(({ title, channel }) => ({ title, channel })),
              note: autoplay
                ? 'The first video is starting in the player on the display.'
                : 'The suggestions are listed on the display; nothing is playing yet.',
            },
          };
        }
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
              "My apologies, Sir. Today's free allowance for my available AI models has been used up. It resets tomorrow.",
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

// Documented placeholder that tells Gemini to skip thought-signature validation for turns
// produced by another model (used only after switching models mid-request).
const SKIP_SIGNATURE = 'skip_thought_signature_validator';

function neutraliseThoughtSignatures(contents: Content[]) {
  for (const content of contents) {
    for (const part of content.parts ?? []) {
      if (part.thoughtSignature) part.thoughtSignature = SKIP_SIGNATURE;
    }
  }
}

function toGeminiContents(message: string, history: ChatMessage[], image?: ChatImage): Content[] {
  const contents: Content[] = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  // Gemini expects the conversation to open with a user turn (e.g. drop a UI greeting).
  while (contents[0]?.role === 'model') contents.shift();
  contents.push({
    role: 'user',
    parts: [{ text: message }, ...(image ? [{ inlineData: { mimeType: image.mimeType, data: image.data } }] : [])],
  });
  return contents;
}
