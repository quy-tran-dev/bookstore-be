import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
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
import { BadRequestException } from '@nestjs/common';
import { IGoogleUser } from '@app/common/interfaces/google-user.interface';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { v4 as uuidv4 } from 'uuid';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailProducer } from '../mail/mail.producer';
import { DiscordService } from '../discord/discord.service';

@Injectable()
export class AuthService {
  // Biến môi trường (Nên chuyển vào .env)
  private readonly rpID
  private readonly origin

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Authenticator)
    private readonly authenticatorRepository: Repository<Authenticator>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailProducer: MailProducer,
    private readonly discordService: DiscordService,
  ) {
    this.rpID = this.configService.get<string>('WEBAUTHN_RPID');
    this.origin = this.configService.get<string>('ORIGIN');
  }

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

    // Hash refresh token và lưu vào DB
    const hashedRT = await bcrypt.hash(refreshToken, 10);
    user.hashedRefreshToken = hashedRT;
    await this.userRepository.save(user);

    return { accessToken, refreshToken };
  }
  async logout(userId: string) {
    // Xóa hashedRefreshToken trong DB
    await this.userRepository.update(userId, {
      hashedRefreshToken: null,
    });

    return { 
      message: 'Đăng xuất thành công' 
    };
  }

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

    // 1. Đẩy việc gửi Mail vào Queue (Nhanh và không block HTTP request)
    await this.mailProducer.queueWelcomeEmail({
      to: user.email,
      fullName: user.userDetail?.fullName || '',
      verifyToken: verificationToken,
    });

    // 2. Bắn log Discord
    this.discordService.sendLog(
      'INFO',
      `Khách hàng mới đăng ký tài khoản: **${user.email}**`,
      'AuthService',
    );

    return this.generateTokens(user);
  }

  async loginWithPassword(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (!user || !user.password) {
      throw new BadRequestException('Tài khoản hoặc mật khẩu không đúng');
    }

    // Tùy chọn kiểm tra block (Nếu thêm cột isBlocked)
    if (user.isBlocked) throw new ForbiddenException('Tài khoản đã bị khóa');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch)
      throw new BadRequestException('Tài khoản hoặc mật khẩu không đúng');

    return this.generateTokens(user);
  }

  async verifyEmail(token: string) {
    const user = await this.userRepository.findOne({
      where: { verificationToken: token },
    });
    if (!user)
      throw new BadRequestException('Mã xác thực không hợp lệ hoặc đã hết hạn');

    user.isVerified = true;
    user.verificationToken = null; // Xóa token sau khi xác thực xong
    user.emailVerifiedAt = new Date();

    await this.userRepository.save(user);
    return { success: true, message: 'Xác thực email thành công' };
  }

  async googleLogin(reqUser: IGoogleUser) {
    if (!reqUser)
      throw new BadRequestException('Không lấy được thông tin từ Google');

    let user = await this.userRepository.findOne({
      where: { email: reqUser.email },
    });

    if (!user) {
      user = this.userRepository.create({
        email: reqUser.email,
        role: 'CUSTOMER',
        isVerified: true, // Google đã xác thực email rồi
        emailVerifiedAt: new Date(),
        userDetail: {
          fullName: `${reqUser.lastName} ${reqUser.firstName}`,
          avatarUrl: reqUser.picture,
        } as UserDetail,
      });
      user = await this.userRepository.save(user);
      this.discordService.sendLog(
        'INFO',
        `Khách hàng mới đăng nhập qua Google: **${user.email}**`,
        'AuthService',
      );
    }
    return this.generateTokens(user);
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
      // Để bảo mật, không báo lỗi "Email không tồn tại" mà trả về thành công
      // để hacker không dò được email trong hệ thống.
      return {
        success: true,
        message: 'Nếu email tồn tại, hệ thống đã gửi link đổi mật khẩu.',
      };
    }

    // Tạo token và thời hạn (ví dụ 15 phút)
    const resetToken = uuidv4();
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 15);

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = expires;
    await this.userRepository.save(user);

    // TODO: Gửi email tới `user.email` kèm link: http://localhost:3000/reset-password?token=${resetToken}
    // console.log(
    //   `Gửi email quên mật khẩu tới ${user.email} với token: ${resetToken}`,
    // );
    await this.mailProducer.queueResetPassword({
      to: user.email,
      fullName: user.userDetail?.fullName || 'Khách hàng',
      resetToken: resetToken,
    });

    return {
      success: true,
      message: 'Vui lòng kiểm tra email để đặt lại mật khẩu.',
    };
  }

  // ==========================================
  // ĐẶT LẠI MẬT KHẨU
  // ==========================================
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.userRepository.findOne({
      where: { resetPasswordToken: dto.token },
    });

    if (!user) {
      throw new BadRequestException('Mã xác thực không hợp lệ.');
    }

    if (user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Mã xác thực đã hết hạn.');
    }

    // Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    user.password = hashedPassword;

    // Xóa token để không dùng lại được
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await this.userRepository.save(user);

    this.discordService.sendLog(
      'INFO',
      `Người dùng **${user.email}** đã đặt lại mật khẩu thành công.`,
      'AuthService',
    );

    return {
      success: true,
      message: 'Đổi mật khẩu thành công. Bạn có thể đăng nhập.',
    };
  }

  // ==========================================
  // REFRESH TOKEN
  // ==========================================
  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Nếu không có user hoặc user đã bị đăng xuất (xóa hashedRefreshToken)
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    // So sánh refreshToken gửi lên với hash trong DB
    const rtMatches = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );
    if (!rtMatches) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    // Cấp lại 1 cặp token MỚI (xoay vòng Refresh Token để tăng bảo mật)
    return this.generateTokens(user);
  }
}
