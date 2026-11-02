import { Module } from '@nestjs/common';
import { NewsService } from './news.service';
import { WeatherService } from './weather.service';
import { YouTubeService } from './youtube.service';

@Module({
  providers: [WeatherService, NewsService, YouTubeService],
  exports: [WeatherService, NewsService, YouTubeService],
})
export class ToolsModule {}
