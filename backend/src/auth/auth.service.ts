import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  AuthResponseDto,
  AuthTokensInternal,
} from './dto/auth-response.dto';

const BCRYPT_ROUNDS = 10;
const GUEST_EMAIL_DOMAIN = '@guest.internal';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Registration ────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthTokensInternal> {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.userRepo.create({
      email: dto.email,
      password: passwordHash,
      role: dto.role ?? UserRole.USER,
    });

    await this.userRepo.save(user);
    this.logger.log(`User registered: ${user.email} (role: ${user.role})`);

    return this.issueTokens(user);
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthTokensInternal> {
    // Must explicitly select password since it has select: false on entity
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${user.email}`);
    return this.issueTokens(user);
  }

  // ─── Guest Token ─────────────────────────────────────────────────────────────

  async guestToken(): Promise<AuthTokensInternal> {
    const guestEmail = `guest_${Date.now()}_${Math.random().toString(36).slice(2)}${GUEST_EMAIL_DOMAIN}`;

    const guest = this.userRepo.create({
      email: guestEmail,
      password: null,
      role: UserRole.GUEST,
    });

    await this.userRepo.save(guest);
    this.logger.log(`Guest token issued for: ${guest.id}`);

    return this.issueTokens(guest);
  }

  // ─── Refresh Tokens ───────────────────────────────────────────────────────────

  async refreshTokens(
    userId: string,
    rawRefreshToken: string,
  ): Promise<AuthTokensInternal> {
    const tokens = await this.refreshTokenRepo.find({
      where: { user: { id: userId }, isRevoked: false },
      relations: { user: true },
    });

    // Find the matching, unexpired token
    let matchedToken: RefreshToken | null = null;
    for (const t of tokens) {
      const isMatch = await bcrypt.compare(rawRefreshToken, t.tokenHash);
      if (isMatch && t.expiresAt > new Date()) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke the used token (rotation)
    matchedToken.isRevoked = true;
    await this.refreshTokenRepo.save(matchedToken);

    return this.issueTokens(matchedToken.user);
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────

  async logout(userId: string, rawRefreshToken: string): Promise<void> {
    const tokens = await this.refreshTokenRepo.find({
      where: { user: { id: userId }, isRevoked: false },
    });

    for (const t of tokens) {
      const isMatch = await bcrypt.compare(rawRefreshToken, t.tokenHash);
      if (isMatch) {
        t.isRevoked = true;
        await this.refreshTokenRepo.save(t);
        break;
      }
    }

    this.logger.log(`User logged out: ${userId}`);
  }

  // ─── Get Profile ──────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<AuthResponseDto['user']> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────────────

  private async issueTokens(user: User): Promise<AuthTokensInternal> {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessSecret = this.configService.getOrThrow<string>('jwt.accessSecret');
    const refreshSecret = this.configService.getOrThrow<string>('jwt.refreshSecret');
    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn') ?? '15m';
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d';

    const accessToken = this.jwtService.sign(payload, {
      secret: accessSecret,
      expiresIn: accessExpiresIn as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn as any,
    });

    const tokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    const refreshExpiresMs =
      this.configService.get<number>('jwt.refreshExpiresInMs') ??
      7 * 24 * 60 * 60 * 1000;

    const rtEntity = this.refreshTokenRepo.create({
      tokenHash,
      user,
      expiresAt: new Date(Date.now() + refreshExpiresMs),
      isRevoked: false,
    });
    await this.refreshTokenRepo.save(rtEntity);

    // Housekeeping — remove old revoked tokens for this user
    await this.refreshTokenRepo.delete({
      user: { id: user.id },
      isRevoked: true,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }
}
