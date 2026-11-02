import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AiModule } from './ai/ai.module';
import { FirebaseAuthGuard } from './auth/firebase-auth.guard';
import { HealthController } from './health.controller';

@Module({
  imports: [AiModule],
  controllers: [HealthController],
  // Every route requires a signed-in owner unless marked @Public().
  providers: [{ provide: APP_GUARD, useClass: FirebaseAuthGuard }],
})
export class AppModule {}
