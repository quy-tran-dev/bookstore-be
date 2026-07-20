import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { User } from '../users/entities/user.entity';
import { Authenticator } from './entities/authenticator.entity';
import { ConfigService } from '@nestjs/config';
import { UserDetail } from '../users/entities/user-detail.entity';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class AuthService {
  // Biến môi trường (Nên chuyển vào .env)
  private readonly rpID = 'localhost';
  private readonly origin = 'http://localhost:3000'; // Đổi thành URL Frontend Next.js của bạn

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Authenticator)
    private readonly authenticatorRepository: Repository<Authenticator>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ==========================================
  // 1. WEBAUTHN: Khởi tạo luồng Đăng nhập (Tạo Challenge)
  // ==========================================
  async getLoginChallenge(email: string) {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: { authenticators: true },
    });
    if (!user) throw new UnauthorizedException('Tài khoản không tồn tại');

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: user.authenticators.map((auth) => ({
        id: auth.credentialId, // Đã encode base64url ở Frontend
        type: 'public-key',
      })),
      userVerification: 'preferred',
    });

    // TRONG THỰC TẾ: Bạn phải lưu `options.challenge` vào Cache (Redis) hoặc DB tạm với thời hạn 2 phút để verify ở bước sau.
    // Tạm thời return về để test
    return options;
  }

  // ==========================================
  // 2. WEBAUTHN: Xác minh chữ ký Vân tay/FaceID
  // ==========================================
  async verifyLogin(email: string, body: any, expectedChallenge: string) {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: { authenticators: true },
    });
    const authenticator = user?.authenticators.find(
      (a) => a.credentialId === body.id,
    );

    if (!user || !authenticator)
      throw new UnauthorizedException('Không tìm thấy thiết bị sinh trắc học');

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: authenticator.credentialId,
          publicKey: new Uint8Array(authenticator.credentialPublicKey),
          counter: Number(authenticator.counter),
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Lỗi không xác định';
      throw new UnauthorizedException(`Xác thực thất bại: ${errorMessage}`);
    }

    if (verification.verified) {
      // Cập nhật lại counter chống Replay Attack
      authenticator.counter = verification.authenticationInfo.newCounter;
      await this.authenticatorRepository.save(authenticator);

      // Cấp phát Dual-Token
      return this.generateTokens(user);
    }
    throw new UnauthorizedException('Chữ ký không hợp lệ');
  }

  // ==========================================
  // 3. DUAL-TOKEN MECHANISM
  // ==========================================
  private async generateTokens(user: User) {
    const payload = { sub: user.id, role: user.role };

    const expDefault = this.configService.get<string>('EXP_DEFAULT') || '1d';

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: expDefault as any,
    });

    return { accessToken, refreshToken };
  }

  // ==========================================
  // LOCAL AUTH: Đăng ký & Đăng nhập bằng Mật khẩu
  // ==========================================
  async registerWithPassword(dto: any) {
    const existUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existUser) throw new BadRequestException('Email đã tồn tại');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      email: dto.email,
      password: hashedPassword,
      role: 'CUSTOMER',
      detail: {
        fullName: dto.fullName,
        phone: dto.phone,
      } as UserDetail,
    });

    await this.userRepository.save(user);
    return this.generateTokens(user);
  }

  async loginWithPassword(dto: any) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user || !user.password) {
      throw new BadRequestException('Tài khoản hoặc mật khẩu không đúng');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch)
      throw new BadRequestException('Tài khoản hoặc mật khẩu không đúng');

    return this.generateTokens(user);
  }

  // ==========================================
  // GOOGLE OAUTH: Đăng nhập/Đăng ký qua Google
  // ==========================================
  async googleLogin(reqUser: any) {
    if (!reqUser)
      throw new BadRequestException('Không lấy được thông tin từ Google');

    let user = await this.userRepository.findOne({
      where: { email: reqUser.email },
    });

    // Nếu chưa có tài khoản -> Tự động tạo mới (không cần password)
    if (!user) {
      user = this.userRepository.create({
        email: reqUser.email,
        role: 'CUSTOMER',
        detail: {
          fullName: `${reqUser.lastName} ${reqUser.firstName}`,
          avatarUrl: reqUser.picture,
        } as UserDetail,
      });
      user = await this.userRepository.save(user);
    }

    return this.generateTokens(user);
  }
}
