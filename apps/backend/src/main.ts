import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: env.isProduction ? ['log', 'warn', 'error'] : undefined,
  });

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
