import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { JwtRefreshGuard } from '@app/common/guards/jwt-refresh.guard';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { DiscordService } from '../discord/discord.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly discordService: DiscordService, // Inject Discord vào Controller
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.registerWithPassword(dto);
    this.setRefreshTokenCookie(res, refreshToken);
    
    // Ghi Log Discord tại Controller
    this.discordService.sendLog(
      'INFO',
      `Khách hàng mới đăng ký tài khoản: **${dto.email}**`,
      'AuthController',
    );

    return { accessToken };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.loginWithPassword(dto);
    this.setRefreshTokenCookie(res, refreshToken);
    return { accessToken };
  }

  // ==========================================
  // XÁC THỰC EMAIL
  // ==========================================
  @Post('verify-email')
  async verifyEmail(@Body('token') token: string) {
    if (!token) throw new BadRequestException('Thiếu mã xác thực (token)');
    const result = await this.authService.verifyEmail(token);
    
    this.discordService.sendLog(
      'INFO',
      `Tài khoản **${result.email}** đã xác thực email thành công.`,
      'AuthController',
    );

    return { success: result.success, message: result.message };
  }

  @Post('resend-verification')
  async resendVerification(@Body('email') email: string) {
    if (!email) throw new BadRequestException('Email không được để trống');
    return this.authService.resendVerificationToken(email);
  }

  // ==========================================
  // GOOGLE AUTH
  // ==========================================
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req: Request) {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { accessToken, refreshToken, isNewUser, email } = await this.authService.googleLogin(req.user);
    this.setRefreshTokenCookie(res, refreshToken);

    // Chỉ bắn log nếu đây là User mới tinh
    if (isNewUser) {
      this.discordService.sendLog(
        'INFO',
        `Khách hàng mới đăng nhập qua Google: **${email}**`,
        'AuthController',
      );
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/auth/success?token=${accessToken}`);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    await this.authService.logout(userId);
    res.clearCookie('refresh_token');
    return { message: 'Đăng xuất thành công' };
  }

  // ==========================================
  // WEBAUTHN (PASSKEYS / SINH TRẮC HỌC)
  // ==========================================
  @UseGuards(JwtAuthGuard)
  @Post('webauthn/register-options')
  async getRegisterOptions(@Req() req: any) {
    return this.authService.getRegisterChallenge(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('webauthn/register-verify')
  async verifyRegister(@Req() req: any, @Body() body: any) {
    const { registrationResponse, challenge } = body;
    return this.authService.verifyRegister(
      req.user.id,
      registrationResponse,
      challenge,
    );
  }

  @Post('webauthn/login-challenge')
  async getLoginChallenge(@Body('email') email: string) {
    if (!email) throw new BadRequestException('Email không được để trống');
    return this.authService.getLoginChallenge(email);
  }

  @Post('webauthn/login-verify')
  async verifyLogin(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { email, authResponse, challenge } = body;
    const { accessToken, refreshToken } = await this.authService.verifyLogin(
      email,
      authResponse,
      challenge,
    );

    this.setRefreshTokenCookie(res, refreshToken);
    return { accessToken };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  async refreshTokens(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const refreshToken = req.user.refreshToken;

    const tokens = await this.authService.refreshTokens(userId, refreshToken);
    this.setRefreshTokenCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);
    
    // Ghi Log Discord sau khi đổi pass thành công
    this.discordService.sendLog(
      'INFO',
      `Người dùng **${result.email}** đã đặt lại mật khẩu thành công.`,
      'AuthController',
    );

    return { success: result.success, message: result.message };
  }

  // ==========================================
  // HÀM TIỆN ÍCH SET COOKIE
  // ==========================================
  private setRefreshTokenCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}