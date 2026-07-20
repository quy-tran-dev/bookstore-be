import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';

import { User } from '../users/entities/user.entity';
import { Authenticator } from './entities/authenticator.entity';

// Import các chiến lược xác thực
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { GoogleStrategy } from './strategies/google.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([User, Authenticator]),
    // Khởi tạo JWT cấu hình động từ .env
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        // Default tạm, thời gian sống thực tế sẽ định nghĩa đè lúc signAsync
        signOptions: { expiresIn: '15m' }, 
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService, 
    JwtAccessStrategy, 
    GoogleStrategy
  ],
})
export class AuthModule {}