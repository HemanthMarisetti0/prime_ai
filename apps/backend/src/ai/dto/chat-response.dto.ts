import type { ChatDisplay, ChatResponse, NewsReport, WeatherReport } from '@prime/shared';

export class ChatResponseDto implements ChatResponse {
  reply: string;
  display?: ChatDisplay;
  weather?: WeatherReport;
  news?: NewsReport;
}
