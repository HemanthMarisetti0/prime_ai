import { Module } from '@nestjs/common';
import { SystemModule } from '../system/system.module';
import { ToolsModule } from '../tools/tools.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [SystemModule, ToolsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
