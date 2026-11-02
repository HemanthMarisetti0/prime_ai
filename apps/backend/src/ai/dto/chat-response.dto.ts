import type {
  ChatDisplay,
  ChatResponse,
  DirectionsResult,
  NewsReport,
  PlacesResult,
  TripPlan,
  WeatherReport,
  YouTubeResults,
} from '@prime/shared';

export class ChatResponseDto implements ChatResponse {
  reply: string;
  model?: string;
  display?: ChatDisplay;
  weather?: WeatherReport;
  news?: NewsReport;
  youtube?: YouTubeResults;
  places?: PlacesResult;
  directions?: DirectionsResult;
  trip?: TripPlan;
}
