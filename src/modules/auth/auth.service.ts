import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
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
import { IGoogleUser } from '@app/common/interfaces/google-user.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { v4 as uuidv4 } from 'uuid';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailProducer } from '../mail/mail.producer';

@Injectable()
export class AuthService {
  private readonly rpID;
  private readonly origin;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Authenticator)
    private readonly authenticatorRepository: Repository<Authenticator>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailProducer: MailProducer,
    // Đã gỡ DiscordService khỏi đây
  ) {
    this.rpID = this.configService.get<string>('WEBAUTHN_RPID');
    this.origin = this.configService.get<string>('ORIGIN');
  }

  // ==========================================
  // WEBAUTHN
  // ==========================================
  async getLoginChallenge(email: string) {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: { authenticators: true },
    });
    if (!user) throw new UnauthorizedException('Tài khoản không tồn tại');

    return await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: user.authenticators.map((auth) => ({
        id: auth.credentialId,
        type: 'public-key',
      })),
      userVerification: 'preferred',
    });
  }

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
      authenticator.counter = verification.authenticationInfo.newCounter;
      await this.authenticatorRepository.save(authenticator);
      return this.generateTokens(user);
    }
    throw new UnauthorizedException('Chữ ký không hợp lệ');
  }

  // ==========================================
  // DUAL-TOKEN MECHANISM
  // ==========================================
  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      role: user.role,
      isVerified: user.isVerified,
    };
    const expDefault = this.configService.get<string>('EXP_DEFAULT') || '7d';
    const expAccess = this.configService.get<string>('JWT_ACCESS_TIME') || '3h';
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: expAccess as any,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: expDefault as any,
    });

    const hashedRT = await bcrypt.hash(refreshToken, 10);
    user.hashedRefreshToken = hashedRT;
    await this.userRepository.save(user);

    return { accessToken, refreshToken };
  }

  async logout(userId: string) {
    await this.userRepository.update(userId, { hashedRefreshToken: null });
    return { message: 'Đăng xuất thành công' };
  }

  // ==========================================
  // REGISTER & LOGIN TRUYỀN THỐNG
  // ==========================================
  async registerWithPassword(dto: RegisterDto) {
    const existUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existUser) throw new BadRequestException('Email đã tồn tại');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationToken = uuidv4();

    const user = this.userRepository.create({
      email: dto.email,
      password: hashedPassword,
      role: 'CUSTOMER',
      isVerified: false,
      verificationToken,
      userDetail: {
        fullName: dto.fullName,
        phone: dto.phone,
      } as UserDetail,
    });

    await this.userRepository.save(user);

    await this.mailProducer.queueWelcomeEmail({
      to: user.email,
      fullName: user.userDetail?.fullName || '',
      verifyToken: verificationToken,
    });

    return this.generateTokens(user);
  }

  async loginWithPassword(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user || !user.password) {
      throw new BadRequestException('Tài khoản hoặc mật khẩu không đúng');
    }
    if (user.isBlocked) throw new ForbiddenException('Tài khoản đã bị khóa');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch)
      throw new BadRequestException('Tài khoản hoặc mật khẩu không đúng');

    return this.generateTokens(user);
  }

  // ==========================================
  // XÁC THỰC EMAIL & GỬI LẠI MÃ
  // ==========================================
  async verifyEmail(token: string) {
    const user = await this.userRepository.findOne({
      where: { verificationToken: token },
    });
    
    if (!user) {
      throw new BadRequestException('Mã xác thực không hợp lệ hoặc đã hết hạn');
    }

    user.isVerified = true;
    user.verificationToken = null; 
    user.emailVerifiedAt = new Date();

    await this.userRepository.save(user);
    return { success: true, message: 'Xác thực email thành công', email: user.email };
  }

  async resendVerificationToken(email: string) {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: { userDetail: true },
    });

    if (!user) {
      return { success: true, message: 'Nếu tài khoản tồn tại, email xác thực sẽ được gửi lại.' };
    }

    if (user.isVerified) {
      throw new BadRequestException('Tài khoản này đã được xác thực trước đó.');
    }

    // Cấp lại token mới
    const newVerificationToken = uuidv4();
    user.verificationToken = newVerificationToken;
    await this.userRepository.save(user);

    await this.mailProducer.queueWelcomeEmail({
      to: user.email,
      fullName: user.userDetail?.fullName || 'Khách hàng',
      verifyToken: newVerificationToken,
    });

    return { success: true, message: 'Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư.' };
  }

  // ==========================================
  // GOOGLE LOGIN
  // ==========================================
  async googleLogin(reqUser: IGoogleUser) {
    if (!reqUser) throw new BadRequestException('Không lấy được thông tin từ Google');

    let user = await this.userRepository.findOne({ where: { email: reqUser.email } });
    let isNewUser = false; // Flag để báo cho Controller biết

    if (!user) {
      isNewUser = true;
      user = this.userRepository.create({
        email: reqUser.email,
        role: 'CUSTOMER',
        isVerified: true, 
        emailVerifiedAt: new Date(),
        userDetail: {
          fullName: `${reqUser.lastName} ${reqUser.firstName}`,
          avatarUrl: reqUser.picture,
        } as UserDetail,
      });
      user = await this.userRepository.save(user);
    }
    
    const tokens = await this.generateTokens(user);
    return { ...tokens, isNewUser, email: user.email };
  }

  // ==========================================
  // QUÊN MẬT KHẨU
  // ==========================================
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      relations: { userDetail: true },
    });
    
    if (!user) {
      return { success: true, message: 'Nếu email tồn tại, hệ thống đã gửi link đổi mật khẩu.' };
    }

    const resetToken = uuidv4();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 15);

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = expires;
    await this.userRepository.save(user);

    await this.mailProducer.queueResetPassword({
      to: user.email,
      fullName: user.userDetail?.fullName || 'Khách hàng',
      resetToken: resetToken,
    });

    return { success: true, message: 'Vui lòng kiểm tra email để đặt lại mật khẩu.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userRepository.findOne({
      where: { resetPasswordToken: dto.token },
    });

    if (!user) throw new BadRequestException('Mã xác thực không hợp lệ.');
    if (user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Mã xác thực đã hết hạn.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await this.userRepository.save(user);

    // Trả về email để Controller log Discord
    return {
      success: true,
      message: 'Đổi mật khẩu thành công. Bạn có thể đăng nhập.',
      email: user.email 
    };
  }

  // ==========================================
  // REFRESH TOKEN
  // ==========================================
  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    const rtMatches = await bcrypt.compare(refreshToken, user.hashedRefreshToken);
    if (!rtMatches) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    return this.generateTokens(user);
  }
}