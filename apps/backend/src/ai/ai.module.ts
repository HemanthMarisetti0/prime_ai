import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [SystemModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
