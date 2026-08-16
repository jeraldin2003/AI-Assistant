import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let httpServiceMock: any;
  let configServiceMock: any;

  beforeEach(async () => {
    httpServiceMock = {
      post: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn().mockReturnValue('http://localhost:8000'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: HttpService, useValue: httpServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should proxy chat requests to microservice', async () => {
    const mockResponse = {
      data: {
        response: 'RAG response answer',
        sources: [],
        timings: { total: 0.5 },
        search_mode: 'vector',
      },
    };

    httpServiceMock.post.mockReturnValue(of(mockResponse));

    const result = await service.chat({ prompt: 'Hello microservice' });

    expect(httpServiceMock.post).toHaveBeenCalledWith('http://localhost:8000/chat', {
      prompt: 'Hello microservice',
    });
    expect(result).toEqual(mockResponse.data);
  });
});
