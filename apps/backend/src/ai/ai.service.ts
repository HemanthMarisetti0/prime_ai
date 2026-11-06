import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type Part,
  type ThinkingConfig,
} from '@google/genai';
import type {
  ChatImage,
  ChatMessage,
  ChatResponse,
  ChatStreamEvent,
  MediaState,
  DirectionsResult,
  EmailDraft,
  OwnerLink,
  OwnerSite,
  NewsReport,
  PcAppId,
  PersonProfile,
  PcPowerAction,
  PlacesResult,
  SystemVolumeAction,
  TravelMode,
  TripPlan,
  UserLocation,
  UserProfile,
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
import { CONTACTS, OWNER_LINKS, OwnerProfileService } from '../tools/owner-profile.service';
import { PersonService } from '../tools/person.service';
import { WeatherService } from '../tools/weather.service';
import { YouTubeService } from '../tools/youtube.service';
import { classifyModelError, ModelPool, type FallbackReason } from './model-pool';
import { buildSystemInstruction, SYSTEM_DISPLAY_TAG } from './prime.persona';

const REQUEST_TIMEOUT_MS = 30_000;
// Only used when no other model is left to switch to.
const RETRY_DELAY_MS = 800;
// Telemetry younger than this is reused as is; older readings refresh in the background.
const TELEMETRY_FRESH_MS = 15_000;
const TELEMETRY_FIRST_WAIT_MS = 1200;
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
    name: 'lookup_person',
    description:
      "Look up a person (or a well-known character, band or group) on Wikipedia and show a profile card with their photo and key facts on Sir's display.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full name, with a hint when ambiguous, e.g. "Virat Kohli" or "Michael Jordan basketball".' },
      },
      required: ['name'],
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

const OWNER_SITES = Object.keys(OWNER_LINKS) as OwnerSite[];

const OPEN_PROFILE_TOOL: FunctionDeclaration = {
  name: 'open_my_profile',
  description:
    "Open one of Sir's own pages: his portfolio website, GitHub or LinkedIn. Omit 'where' unless Sir said where; the display then offers both choices.",
  parametersJsonSchema: {
    type: 'object',
    properties: {
      site: { type: 'string', enum: OWNER_SITES },
      where: {
        type: 'string',
        enum: ['inside', 'new_tab'],
        description: '"inside" shows it within P.R.I.M.E. (portfolio only); "new_tab" opens a browser tab.',
      },
    },
    required: ['site'],
  },
};

const EMAIL_TOOL: FunctionDeclaration = {
  name: 'compose_email',
  description:
    "Draft an email for Sir to review. It appears on his display and is sent from his Gmail only after he confirms. Only call it once you know the recipient(s) and what the email should say. Recipients can be contacts by name (e.g. 'wife', 'me') or email addresses.",
  parametersJsonSchema: {
    type: 'object',
    properties: {
      to: { type: 'array', items: { type: 'string' }, description: "Contact names ('me', 'wife', 'Neeraja') or email addresses." },
      subject: { type: 'string' },
      body: { type: 'string', description: 'The full email text, signed off with Sir\'s name unless he asks otherwise.' },
    },
    required: ['to', 'subject', 'body'],
  },
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "Email my wife ...", "send a mail to x@y.com", "write an email to Neeraja": unmistakable requests to draft
// an email (questions such as "what is my wife's email?" don't match).
const EMAIL_REQUEST =
  /^(?:(?:please|prime|hey|ok|okay|can you|could you|would you|kindly)[\s,]+)*(?:e-?mail|mail)\s+(?:me|my|to|him|her|them|\S+@)|\b(?:send|write|draft|compose|drop|shoot)\b[^.?!]{0,40}\b(?:e-?mail|mail)\b/i;

/** The tool a message unmistakably asks for, which the model must then call. */
// Words showing the request already says what to write ("email my wife THAT ...", "... ABOUT the meeting").
const EMAIL_CONTENT = /\b(that|saying|say|says|about|regarding|to tell|telling|asking|to ask|to let|letting|wish|wishing|inviting|thanking|reminding|with)\b|:/i;

/** The tool a message unmistakably asks for, which the model must then call. */
function forcedTool(message: string): string | null {
  // Only when it is clear what to write; otherwise the model should first ask Sir.
  const text = message.trim();
  return EMAIL_REQUEST.test(text) && EMAIL_CONTENT.test(text) ? 'compose_email' : null;
}

/** Turns "wife", "me", "Neeraja" or an address into a recipient; null when unknown. */
function resolveRecipient(value: string): { name?: string; email: string } | null {
  const wanted = value.trim().toLowerCase();
  if (EMAIL_PATTERN.test(wanted)) {
    const contact = CONTACTS.find((c) => c.email === wanted);
    return { email: wanted, ...(contact && { name: contact.name }) };
  }
  const contact = CONTACTS.find(
    (c) => c.name.toLowerCase().includes(wanted) || c.aliases.some((alias) => alias === wanted || wanted.endsWith(` ${alias}`)),
  );
  return contact ? { name: contact.name, email: contact.email } : null;
}

function gmailComposeUrl(to: string[], subject: string, body: string): string {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to: to.join(','), su: subject, body });
  return `https://mail.google.com/mail/?${params}`;
}

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
  person?: PersonProfile;
  link?: OwnerLink;
  email?: EmailDraft;
}

/** What the HUD shows while a tool runs. */
const TOOL_STATUS: Record<string, string> = {
  get_weather: 'Checking the weather',
  get_news: 'Gathering the latest headlines',
  lookup_person: 'Looking them up',
  search_youtube: 'Searching YouTube',
  find_places: 'Searching the map',
  get_directions: 'Plotting a route',
  convert_currency: 'Fetching exchange rates',
  show_trip_plan: 'Drafting your itinerary',
  open_app: 'Opening the application',
  set_brightness: 'Adjusting the display',
  power_action: 'Contacting your computer',
  set_system_volume: 'Adjusting the volume',
  open_my_profile: 'Opening your page',
  compose_email: 'Drafting your email',
};

export interface ChatStreamOptions {
  /** Receives the reply text, tool status and panel data as they become available. */
  onEvent?: (event: ChatStreamEvent) => void;
  /** Cancels the request (e.g. Sir pressed stop or closed the page). */
  signal?: AbortSignal;
}

interface StreamedTurn {
  parts: Part[];
  calls: FunctionCall[];
  text: string;
}

const NETWORK_BLIP = { reason: 'unreachable' as FallbackReason, restSeconds: 10 };

/** A dropped connection or similar network failure, worth another attempt. */
function isNetworkBlip(error: unknown): boolean {
  return error instanceof TypeError && /fetch failed|network|socket|ECONNRESET/i.test(error.message);
}

/** A model that doesn't accept our thinking setting (falls back to its own default). */
function isThinkingConfigRejected(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && /thinking/i.test(error.message ?? '');
}

/**
 * Keep "thinking" to a minimum: for a short spoken assistant it mostly adds seconds of silence.
 * Gemini 2.5 Flash thinks by default (often 5-10 s); Gemini 3 models take a level instead of a budget.
 */
export function fastThinking(model: string): ThinkingConfig | undefined {
  if (!env.gemini.fastThinking) return undefined;
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-3/.test(model)) return { thinkingLevel: /flash/.test(model) ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW };
  return undefined;
}

const TAG_PREFIXES = Array.from({ length: SYSTEM_DISPLAY_TAG.length - 1 }, (_, i) => SYSTEM_DISPLAY_TAG.slice(0, i + 1)).reverse();

/**
 * Turns the growing raw reply into clean `delta` events: the display tag is removed, and a
 * trailing fragment that might be the start of the tag is held back until it is complete.
 */
class ReplyEmitter {
  private sent = '';

  constructor(private readonly emit: (event: ChatStreamEvent) => void) {}

  update(raw: string) {
    let clean = raw.replace(DISPLAY_TAG_PATTERN, ' ').trimStart();
    const partial = TAG_PREFIXES.find((prefix) => clean.endsWith(prefix));
    if (partial) clean = clean.slice(0, -partial.length);
    if (clean.length <= this.sent.length) return;
    if (!clean.startsWith(this.sent)) {
      this.emit({ type: 'reset' });
      this.sent = '';
    }
    this.emit({ type: 'delta', text: clean.slice(this.sent.length) });
    this.sent = clean;
  }

  reset() {
    if (this.sent) this.emit({ type: 'reset' });
    this.sent = '';
  }
}

/** Per-request context from Sir's browser. */
export interface ChatContext {
  location?: UserLocation;
  media?: MediaState;
  image?: ChatImage;
  profile?: UserProfile;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DISPLAY_TAG_PATTERN = new RegExp(`\\s*${escapeRegExp(SYSTEM_DISPLAY_TAG)}\\s*`, 'g');

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly pool = new ModelPool([env.gemini.model, ...env.gemini.fallbackModels]);
  private readonly client: GoogleGenAI | null;
  private readonly tools: FunctionDeclaration[];
  /** Models that rejected our thinking setting; they use their own default. */
  private readonly plainThinkingModels = new Set<string>();
  private telemetry: { at: number; text: string } | null = null;
  private telemetryRefresh: Promise<string | null> | null = null;

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
    private readonly personService: PersonService,
    private readonly ownerProfile: OwnerProfileService,
  ) {
    this.tools = [...TOOLS, OPEN_PROFILE_TOOL, EMAIL_TOOL, ...TRAVEL_TOOLS, ...(volumeService.enabled ? [SYSTEM_VOLUME_TOOL, ...PC_TOOLS] : [])];
    const { apiKey } = env.gemini;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set; /api/chat will return 503.');
    }
    this.client = apiKey
      ? new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } })
      : null;
    this.logger.log(`Gemini models (in order of preference): ${this.pool.models.join(', ')}`);
  }

  /**
   * Answers one message. Text is generated as a stream: `onEvent` (optional) receives the reply
   * as it is written, tool status updates and panel data, so the HUD can show progress at once.
   */
  async chat(
    message: string,
    history: ChatMessage[],
    context: ChatContext = {},
    { onEvent, signal }: ChatStreamOptions = {},
  ): Promise<ChatResponse> {
    if (!this.client) {
      throw new ServiceUnavailableException('My apologies, Sir. My AI link has not been configured yet.');
    }

    const emit = onEvent ?? (() => {});
    const text = new ReplyEmitter(emit);
    const telemetry = await this.getTelemetry();
    const config = {
      systemInstruction: buildSystemInstruction(
        telemetry,
        context.media,
        this.volumeService.enabled,
        context.profile,
        this.ownerProfile.background(),
      ),
      tools: [{ functionDeclarations: this.tools }],
      ...(signal && { abortSignal: signal }),
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
        let turn: StreamedTurn;
        let retriedSameModel = false;
        for (;;) {
          try {
            // A clear request for an action must use its tool first (small models sometimes just claim it).
            const forced = round === 0 ? forcedTool(message) : null;
            const turnConfig: GenerateContentConfig = forced
              ? { ...config, toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY, allowedFunctionNames: [forced] } } }
              : config;
            turn = await this.streamTurn(model, contents, turnConfig, text);
            break;
          } catch (error) {
            if (signal?.aborted) throw error;
            text.reset();
            if (isThinkingConfigRejected(error) && !this.plainThinkingModels.has(model)) {
              this.logger.warn(`${model} rejected the thinking setting; using its default from now on`);
              this.plainThinkingModels.add(model);
              continue;
            }
            const verdict = classifyModelError(error) ?? (isNetworkBlip(error) ? NETWORK_BLIP : null);
            if (!verdict) throw error;
            const next = candidates.shift();
            if (!next) {
              // Last option: one quick retry of the same model for a passing hiccup.
              if (verdict.reason !== 'quota exhausted' && verdict.reason !== 'unavailable' && !retriedSameModel) {
                retriedSameModel = true;
                this.logger.warn(`${model} ${verdict.reason}; retrying once`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
                continue;
              }
              this.pool.rest(model, verdict.restSeconds);
              throw this.pool.available().length ? error : this.allModelsResting();
            }
            // Switch straight away rather than waiting on a struggling model.
            this.pool.rest(model, verdict.restSeconds);
            this.logger.warn(`${model} ${verdict.reason}; switching to ${next}`);
            // A different model can't validate the previous model's thought signatures.
            if (round > 0) neutraliseThoughtSignatures(contents);
            model = next;
          }
        }
        if (!turn.calls.length || round === MAX_TOOL_ROUNDS) {
          raw = turn.text.trim();
          break;
        }
        // Text written before a tool call is a preamble, not the answer.
        text.reset();
        // Keep the model's turn verbatim (it carries thought signatures), then answer each call.
        contents.push({ role: 'model', parts: turn.parts });
        const status = TOOL_STATUS[turn.calls[0].name ?? ''];
        if (status) emit({ type: 'status', text: status });
        const parts = await Promise.all(
          turn.calls.map(async (call) => ({
            functionResponse: { id: call.id, name: call.name, response: await this.runTool(call, context, results) },
          })),
        );
        if (Object.keys(results).length) emit({ type: 'extras', extras: { ...results } });
        contents.push({ role: 'user', parts });
        emit({ type: 'status', text: 'Composing a reply' });
      }

      const tagged = raw.includes(SYSTEM_DISPLAY_TAG);
      const reply = raw.replace(DISPLAY_TAG_PATTERN, ' ').trim();
      if (!reply) {
        throw new BadGatewayException('My apologies, Sir. I received an empty response. Would you kindly try again?');
      }

      const showSystem = Boolean(telemetry) && (tagged || SYSTEM_QUESTION.test(message));
      return { reply, model, ...(showSystem && { display: 'system' as const }), ...results };
    } catch (error) {
      // Cancelled by Sir: nothing went wrong, so there is nothing to report.
      if (signal?.aborted) throw error;
      throw this.toHttpException(error);
    }
  }

  /** Streams one model turn, forwarding its text as it arrives. */
  private async streamTurn(
    model: string,
    contents: Content[],
    config: GenerateContentConfig,
    text: ReplyEmitter,
  ): Promise<StreamedTurn> {
    const thinkingConfig = this.plainThinkingModels.has(model) ? undefined : fastThinking(model);
    const stream = await this.client!.models.generateContentStream({
      model,
      contents,
      config: { ...config, ...(thinkingConfig && { thinkingConfig }) },
    });
    const parts: Part[] = [];
    let written = '';
    for await (const chunk of stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part);
        if (part.text && !part.thought) {
          written += part.text;
          text.update(written);
        }
      }
    }
    const calls = parts.flatMap((part) => (part.functionCall ? [part.functionCall] : []));
    return { parts, calls, text: written };
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
        case 'compose_email': {
          const names = Array.isArray(args.to) ? args.to.filter((v): v is string => typeof v === 'string') : [];
          const subject = text(args.subject)?.trim() ?? '';
          // Models occasionally write line breaks as a literal "\n"; turn them into real ones.
          const rawBody = text(args.body)?.trim() ?? '';
          const body = !rawBody.includes('\n') && rawBody.includes('\\n') ? rawBody.replace(/(?:\\r)?\\n/g, '\n') : rawBody;
          if (!names.length) return { error: 'Ask Sir who the email is for.' };
          if (!body) return { error: 'The email needs some text.' };
          const recipients = names.map((name) => ({ name, recipient: resolveRecipient(name) }));
          const unknown = recipients.filter((r) => !r.recipient).map((r) => r.name);
          if (unknown.length) {
            return { error: `No email address is known for ${unknown.join(', ')}. Ask Sir for the address.` };
          }
          const to = recipients.map((r) => r.recipient!);
          results.email = { to, subject, body, gmailUrl: gmailComposeUrl(to.map((r) => r.email), subject, body) };
          return {
            output: {
              to: to.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)),
              subject,
              status: "Drafted and shown on Sir's display. NOT sent: ask Sir to confirm. His 'yes, send it' or the Send button sends it.",
            },
          };
        }
        case 'open_my_profile': {
          const site = text(args.site) as OwnerSite | undefined;
          const page = site && OWNER_LINKS[site];
          if (!site || !page?.url) return { error: 'That page is not configured.' };
          const asked = args.where === 'inside' || args.where === 'new_tab' ? args.where : null;
          // GitHub and LinkedIn refuse to be shown inside other sites, so they always get a tab.
          const open = page.embeddable ? asked : 'new_tab';
          results.link = { site, ...page, open };
          return {
            output: {
              page: page.label,
              url: page.url,
              status:
                open === null
                  ? "Both choices are on Sir's display. Ask whether to open it here or in a new tab."
                  : open === 'inside'
                    ? 'Shown inside the display.'
                    : asked === 'inside'
                      ? `${page.label} does not allow being shown inside other sites, so it is opening in a new tab instead.`
                      : 'Opening in a new tab.',
            },
          };
        }
        case 'lookup_person': {
          const name = text(args.name)?.trim();
          if (!name) return { error: 'A name is required.' };
          results.person = await this.personService.lookup(name);
          // The photo and link are on the display; the model only needs the text.
          const { imageUrl: _image, sourceUrl: _url, ...profile } = results.person;
          return { output: { ...profile, note: "A profile card with a photo is shown on Sir's display." } };
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

  /**
   * Telemetry for the model's context, without making Sir wait for hardware probes:
   * a recent reading is reused, a stale one is refreshed in the background.
   */
  private async getTelemetry(): Promise<string | null> {
    if (!this.systemService.enabled) return null;
    const cached = this.telemetry;
    if (cached && Date.now() - cached.at < TELEMETRY_FRESH_MS) return cached.text;

    this.telemetryRefresh ??= this.systemService
      .getSnapshot()
      .then((snapshot) => {
        this.telemetry = { at: Date.now(), text: describeSnapshot(snapshot) };
        return this.telemetry.text;
      })
      .catch((error: unknown) => {
        this.logger.warn(`Telemetry unavailable: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      })
      .finally(() => (this.telemetryRefresh = null));

    if (cached) return cached.text;
    // First reading: wait briefly, but never hold the conversation up for long.
    return Promise.race([
      this.telemetryRefresh,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TELEMETRY_FIRST_WAIT_MS)),
    ]);
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
