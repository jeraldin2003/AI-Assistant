import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data') as typeof import('form-data');
import { ChatRequestDto } from './dto/chat-request.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly ragUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.ragUrl = this.configService.get<string>('microservice.url')!;
  }

  /**
   * Proxy a chat request to the FastAPI RAG microservice.
   */
  async chat(dto: ChatRequestDto): Promise<unknown> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.ragUrl}/chat`, dto),
      );
      return response.data;
    } catch (err: unknown) {
      this.handleProxyError(err, 'chat');
    }
  }

  /**
   * Proxy a document upload to the FastAPI RAG microservice.
   * Streams the multipart file directly to the microservice.
   */
  async uploadDocument(
    file: Express.Multer.File,
    force = false,
  ): Promise<unknown> {
    try {
      const form = new FormData();
      form.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
        knownLength: file.size,
      });

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.ragUrl}/documents/upload?force=${force}`,
          form,
          { headers: form.getHeaders() },
        ),
      );
      return response.data;
    } catch (err: unknown) {
      this.handleProxyError(err, 'upload');
    }
  }

  private handleProxyError(err: unknown, context: string): never {
    const error = err as {
      response?: { status?: number; data?: unknown };
      code?: string;
      message?: string;
    };

    this.logger.error(
      `Microservice ${context} error: ${JSON.stringify(error?.response?.data ?? error?.message)}`,
    );

    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      throw new ServiceUnavailableException(
        'RAG microservice is currently unavailable. Please try again later.',
      );
    }

    throw new BadGatewayException(
      error?.response?.data ?? 'RAG microservice returned an error',
    );
  }
}
