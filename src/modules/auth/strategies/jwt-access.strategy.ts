import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // Mặc định là false, sẽ báo lỗi nếu token hết hạn
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET') as string,
    });
  }

  // Hàm này tự động được gọi SAU KHI token đã được verify thành công
  async validate(payload: any) {
    // Trả về những gì bạn đã nhét vào payload lúc sign ở AuthService
    return { 
      id: payload.sub, 
      role: payload.role,
      isVerified: payload.isVerified 
    };
  }
}