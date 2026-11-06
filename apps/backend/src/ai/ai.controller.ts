import { Body, Controller, HttpCode, HttpException, HttpStatus, Logger, Post, Res } from '@nestjs/common';
import type { ChatStreamEvent } from '@prime/shared';
import type { Response } from 'express';
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

const toContext = (body: ChatRequestDto) => ({
  location: body.location,
  media: body.media,
  image: body.image,
  profile: body.profile,
});

@Controller('chat')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  /** Complete reply in one response. */
  @Post()
  @HttpCode(200)
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponseDto> {
    return this.aiService.chat(body.message, body.history, toContext(body));
  }

  /**
   * The same reply as a stream of newline-delimited JSON events (see ChatStreamEvent), so the
   * HUD can show and speak the answer while it is still being written. Errors raised before
   * anything is streamed use normal HTTP status codes; later ones arrive as an `error` event.
   */
  @Post('stream')
  async stream(@Body() body: ChatRequestDto, @Res() res: Response): Promise<void> {
    const abort = new AbortController();
    // Stop generating (and spending quota) when Sir cancels or leaves.
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    const write = (event: ChatStreamEvent) => {
      if (res.writableEnded || abort.signal.aborted) return;
      if (!res.headersSent) {
        res.status(HttpStatus.OK);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        // Keep proxies (Render, Vercel, nginx) from buffering the stream.
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
      }
      res.write(`${JSON.stringify(event)}\n`);
    };

    try {
      const response = await this.aiService.chat(body.message, body.history, toContext(body), {
        onEvent: write,
        signal: abort.signal,
      });
      write({ type: 'done', response });
      res.end();
    } catch (error) {
      if (abort.signal.aborted) {
        res.end();
        return;
      }
      const http =
        error instanceof HttpException
          ? error
          : new HttpException('My apologies, Sir. Something went wrong on my side.', HttpStatus.INTERNAL_SERVER_ERROR);
      if (!(error instanceof HttpException)) this.logger.error('Chat stream failed', error instanceof Error ? error.stack : String(error));
      const status = http.getStatus();
      const message = errorMessage(http);
      if (res.headersSent) {
        write({ type: 'error', status, message });
        res.end();
      } else {
        res.status(status).json({ statusCode: status, message });
      }
    }
  }
}

function errorMessage(error: HttpException): string {
  const body = error.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: unknown }).message;
  return Array.isArray(message) ? message.join('; ') : typeof message === 'string' ? message : error.message;
}
