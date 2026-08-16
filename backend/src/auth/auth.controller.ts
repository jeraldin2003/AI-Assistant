import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const REFRESH_COOKIE = 'refreshToken';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Guest Token ─────────────────────────────────────────────────────────────

  @Public()
  @Post('guest-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtain a guest token',
    description:
      'Issues a JWT for anonymous users. Guests can use /chat up to 2 times per hour.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async guestToken(@Res({ passthrough: true }) res: Response) {
    const result = await this.authService.guestToken();
    this.setRefreshCookie(res, result.refreshToken);
    const { refreshToken: _, ...publicResult } = result;
    return publicResult;
  }

  // ─── Register ─────────────────────────────────────────────────────────────────

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result.refreshToken);
    const { refreshToken: _, ...publicResult } = result;
    return publicResult;
  }

  // ─── Login ────────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(res, result.refreshToken);
    const { refreshToken: _, ...publicResult } = result;
    return publicResult;
  }

  // ─── Refresh ──────────────────────────────────────────────────────────────────

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refreshToken')
  @ApiOperation({
    summary: 'Rotate access + refresh tokens using the HttpOnly refresh cookie',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as {
      sub: string;
      email: string;
      role: string;
      refreshToken: string;
    };

    const result = await this.authService.refreshTokens(
      user.sub,
      user.refreshToken,
    );
    this.setRefreshCookie(res, result.refreshToken);
    const { refreshToken: _, ...publicResult } = result;
    return publicResult;
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out — revokes refresh token and clears cookie' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] as string;
    if (refreshToken) {
      await this.authService.logout(userId, refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { message: 'Logged out successfully' };
  }

  // ─── Me ───────────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the currently authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  async me(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  // ─── Cookie Helper ────────────────────────────────────────────────────────────

  private setRefreshCookie(res: Response, token: string) {
    const maxAge =
      this.configService.get<number>('jwt.refreshExpiresInMs') ??
      7 * 24 * 60 * 60 * 1000;

    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.configService.get<string>('nodeEnv') === 'production',
      sameSite: 'lax',
      maxAge,
      path: '/api/v1/auth', // Scope the cookie to /api/v1/auth paths only
    });
  }
}
