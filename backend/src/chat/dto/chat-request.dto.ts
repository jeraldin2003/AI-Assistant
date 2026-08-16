import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({ example: 'user', description: 'Role: user or assistant' })
  @IsString()
  role: string;

  @ApiProperty({ example: 'Hello, what is this document about?' })
  @IsString()
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({
    example: 'What are the main topics covered in the uploaded document?',
    description: 'The user prompt / question',
  })
  @IsString()
  @MinLength(1)
  prompt: string;

  @ApiPropertyOptional({
    type: [ChatMessageDto],
    description: 'Optional conversation history for multi-turn chat',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 50,
    description: 'Number of document chunks to retrieve (default: auto)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  top_k?: number;
}
