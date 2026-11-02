import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { DirectionsService } from './directions.service';
import { GeoService } from './geo.service';
import { NewsService } from './news.service';
import { PersonService } from './person.service';
import { WeatherService } from './weather.service';
import { YouTubeService } from './youtube.service';

const SERVICES = [WeatherService, NewsService, YouTubeService, GeoService, DirectionsService, CurrencyService, PersonService];

@Module({
  providers: SERVICES,
  exports: SERVICES,
})
export class ToolsModule {}
