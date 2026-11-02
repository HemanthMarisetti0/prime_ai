import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { env } from './config/env';

// Room for an attached image (the frontend downsizes images to well under this).
const JSON_BODY_LIMIT = '8mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.isProduction ? ['log', 'warn', 'error'] : undefined,
  });

  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (env.corsOrigins.length) {
    app.enableCors({ origin: env.corsOrigins, allowedHeaders: ['Content-Type', 'Authorization'] });
  }

  await app.listen(env.port);
  Logger.log(`P.R.I.M.E. backend (${env.nodeEnv}) listening on http://localhost:${env.port}/api`, 'Bootstrap');
}

void bootstrap();
