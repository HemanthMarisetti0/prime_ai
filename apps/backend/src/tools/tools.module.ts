import { Module } from '@nestjs/common';
import { NewsService } from './news.service';
import { WeatherService } from './weather.service';

@Module({
  providers: [WeatherService, NewsService],
  exports: [WeatherService, NewsService],
})
export class ToolsModule {}
