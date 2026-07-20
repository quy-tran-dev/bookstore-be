import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly configService: ConfigService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } =
      await this.authService.registerWithPassword(dto);
    this.setRefreshTokenCookie(res, refreshToken);
    return { accessToken };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } =
      await this.authService.loginWithPassword(dto);
    this.setRefreshTokenCookie(res, refreshToken);
    return { accessToken };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req: Request) {
    // Để trống. Passport tự động intercept và redirect tới web Google.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.googleLogin(
      req.user,
    );
    this.setRefreshTokenCookie(res, refreshToken);

    // Lấy link Frontend từ file .env, không hardcode localhost:3000 nữa
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    res.redirect(`${frontendUrl}/auth/success?token=${accessToken}`);
  }

  // Đăng xuất
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refresh_token');
    return { message: 'Đăng xuất thành công' };
  }

  // Hàm tiện ích set Cookie chuẩn bảo mật
  private setRefreshTokenCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('webauthn/login-verify')
  async verifyLogin(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { email, authResponse, challenge } = body;

    // Gọi hàm verify sinh trắc học
    const { accessToken, refreshToken } = await this.authService.verifyLogin(
      email,
      authResponse,
      challenge,
    );

    // BẢO MẬT CHỐNG XSS: Đính kèm Refresh Token vào HTTP-Only Cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true, // Chặn JavaScript (Document.cookie) đọc token này
      secure: process.env.NODE_ENV === 'production', // Chỉ gửi qua HTTPS ở Production
      sameSite: 'strict', // Chống CSRF Attack
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });

    // Chỉ trả Access Token về cho Frontend lưu vô Memory
    return { accessToken };
  }
}
