import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { UserRole } from '../../users/entities/user.entity';

export const GUEST_RATE_LIMIT = 2; // max requests per window
export const GUEST_RATE_WINDOW_SECONDS = 3600; // 1 hour

/**
 * Guest Rate Limit Guard.
 * Allows guest users a maximum of 2 chat requests per hour.
 * Uses Redis INCR + EXPIRE for atomic, TTL-backed counting.
 * Non-guest users bypass this guard entirely.
 */
@Injectable()
export class GuestRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(GuestRateLimitGuard.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host') ?? 'localhost',
      port: this.configService.get<number>('redis.port') ?? 6379,
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error in GuestRateLimitGuard', err);
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { sub: string; role: UserRole } | undefined;

    // Only enforce rate limit on guest users
    if (!user || user.role !== UserRole.GUEST) {
      return true;
    }

    const redisKey = `guest_rate:${user.sub}`;

    try {
      const count = await this.redis.incr(redisKey);

      // Set expiry only on the FIRST request (count === 1)
      if (count === 1) {
        await this.redis.expire(redisKey, GUEST_RATE_WINDOW_SECONDS);
      }

      if (count > GUEST_RATE_LIMIT) {
        const ttl = await this.redis.ttl(redisKey);
        throw new HttpException(
          {
            message:
              `Guest rate limit exceeded. You may send ${GUEST_RATE_LIMIT} messages per hour. ` +
              `Please try again in ${Math.ceil(ttl / 60)} minutes.`,
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Attach rate limit info to response headers for frontend awareness
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-RateLimit-Limit', GUEST_RATE_LIMIT);
      response.setHeader(
        'X-RateLimit-Remaining',
        Math.max(0, GUEST_RATE_LIMIT - count),
      );

      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // If Redis is down, allow the request through (fail open) and log the error
      this.logger.error('Redis error during guest rate limit check', err);
      return true;
    }
  }
}
