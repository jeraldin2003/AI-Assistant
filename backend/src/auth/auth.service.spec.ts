import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { User, UserRole } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';

describe('AuthService', () => {
  let service: AuthService;
  let userRepoMock: any;
  let refreshTokenRepoMock: any;
  let jwtServiceMock: any;
  let configServiceMock: any;

  beforeEach(async () => {
    userRepoMock = {
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'user-uuid-1', createdAt: new Date() })),
      save: jest.fn((user) => Promise.resolve(user)),
      createQueryBuilder: jest.fn(),
    };

    refreshTokenRepoMock = {
      find: jest.fn(),
      create: jest.fn((dto) => ({ ...dto, id: 'token-uuid-1' })),
      save: jest.fn((token) => Promise.resolve(token)),
      delete: jest.fn(),
    };

    jwtServiceMock = {
      sign: jest.fn(() => 'mocked-jwt-token'),
    };

    configServiceMock = {
      getOrThrow: jest.fn((key) => {
        if (key === 'jwt.accessSecret') return 'access-secret';
        if (key === 'jwt.refreshSecret') return 'refresh-secret';
        return 'secret';
      }),
      get: jest.fn((key) => {
        if (key === 'jwt.accessExpiresIn') return '15m';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        if (key === 'jwt.refreshExpiresInMs') return 604800000;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepoMock },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepoMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      userRepoMock.findOne.mockResolvedValue(null);

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(userRepoMock.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
      expect(userRepoMock.create).toHaveBeenCalled();
      expect(userRepoMock.save).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe(UserRole.USER);
    });

    it('should throw ConflictException if user already exists', async () => {
      userRepoMock.findOne.mockResolvedValue({ id: 'existing-id', email: 'test@example.com' });

      await expect(
        service.register({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        password: hashedPassword,
        role: UserRole.USER,
        createdAt: new Date(),
      };

      userRepoMock.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockUser),
      });

      const result = await service.login({ email: 'test@example.com', password: 'password123' });

      expect(result).toHaveProperty('accessToken');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw UnauthorizedException with invalid credentials', async () => {
      userRepoMock.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.login({ email: 'wrong@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('guestToken', () => {
    it('should issue a guest token with GUEST role', async () => {
      const result = await service.guestToken();

      expect(result).toHaveProperty('accessToken');
      expect(result.user.role).toBe(UserRole.GUEST);
      expect(result.user.email).toContain('@guest.internal');
    });
  });
});
