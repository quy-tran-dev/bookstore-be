console.log('>>> FILE jwt-refresh.strategy.ts LOADED');
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

// Hàm helper để trích xuất token từ Cookie thay vì Header
const cookieExtractor = (req: Request) => {
  let token = null;
  if (req && req.cookies) {
    token = req.cookies['refresh_token']; // Trùng với tên cookie bạn đã set ở AuthController
  }
  return token;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    super({
      // BẢO MẬT: Đọc token từ hàm custom cookieExtractor
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') as string,
      passReqToCallback: true, 
    });
    console.log('JwtRefreshStrategy ĐÃ ĐƯỢC KHỞI TẠO!');
  }
  async validate(req: Request, payload: any) {
    // Lấy lại đúng cái token nguyên bản từ cookie
    const refreshToken = req.cookies?.refresh_token;
    
    if (!refreshToken) {
      throw new UnauthorizedException('Không tìm thấy Refresh Token trong Cookie');
    }

    return { 
      id: payload.sub, 
      role: payload.role, 
      refreshToken 
    };
  }
}