import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { GuestRateLimitGuard } from '../common/guards/guest-rate-limit.guard';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * POST /chat
   * Accessible by: admin, user, guest (max 2/hr)
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.USER, UserRole.GUEST)
  @UseGuards(GuestRateLimitGuard)
  @ApiOperation({
    summary: 'Send a chat message to the RAG chatbot',
    description:
      'Proxies the request to the FastAPI microservice. ' +
      'Guest users are limited to 2 requests per hour. ' +
      'Rate limit info is returned in X-RateLimit-* response headers.',
  })
  @ApiResponse({ status: 200, description: 'Chat response from the RAG model' })
  @ApiResponse({ status: 429, description: 'Guest rate limit exceeded' })
  @ApiResponse({ status: 502, description: 'Microservice error' })
  @ApiResponse({ status: 503, description: 'Microservice unavailable' })
  async chat(@Body() dto: ChatRequestDto) {
    return this.chatService.chat(dto);
  }

  /**
   * POST /documents/upload
   * Accessible by: admin only
   */
  @Post('documents/upload')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
      fileFilter: (_req, file, cb) => {
        if (!file.originalname.toLowerCase().endsWith('.pdf')) {
          cb(new Error('Only PDF files are supported'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a PDF document for RAG indexing (admin only)',
    description:
      'Streams the uploaded PDF to the FastAPI microservice for ingestion into the vector store.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF file' },
        force: {
          type: 'boolean',
          description: 'Force re-index even if document already exists',
        },
      },
      required: ['file'],
    },
  })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'Re-index even if document already exists',
  })
  @ApiResponse({ status: 201, description: 'Document ingested successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or empty file' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Query('force') force?: string,
  ) {
    return this.chatService.uploadDocument(file, force === 'true');
  }
}
