import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

@Controller('chat')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post()
  @HttpCode(200)
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponseDto> {
    return this.aiService.chat(body.message, body.history, { location: body.location, media: body.media, image: body.image });
  }
}
