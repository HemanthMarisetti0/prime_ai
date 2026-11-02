import type { ChatDisplay, ChatResponse, NewsReport, WeatherReport, YouTubeResults } from '@prime/shared';

export class ChatResponseDto implements ChatResponse {
  reply: string;
  display?: ChatDisplay;
  weather?: WeatherReport;
  news?: NewsReport;
  youtube?: YouTubeResults;
}
