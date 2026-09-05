import { Injectable } from '@nestjs/common';
import { MailerService as BaseMailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import {
  MailWelcomePayload,
  MailResetPwdPayload,
} from './interfaces/mail-payload.interface';

@Injectable()
export class MailService {
  private current_year: number;
  private website_link: string;
  private contact_link: string;
  private privacy_policy_link: string;
  constructor(
    private readonly baseMailer: BaseMailerService,
    private readonly configService: ConfigService,
  ) {
    this.current_year = new Date().getFullYear();
    this.website_link = this.configService.get<string>('WEBSITE_LINK') ?? '';
    this.contact_link = this.configService.get<string>('CONTACT_LINK') ?? '';
    this.privacy_policy_link =
      this.configService.get<string>('PRIVACY_POLICY_LINK') ?? '';
  }

  async sendWelcomeEmail(payload: MailWelcomePayload) {
    const verifyLink = `${this.configService.get('FRONTEND_URL')}/auth/verify/${payload.verifyToken}`;

    await this.baseMailer.sendMail({
      to: payload.to,
      subject: 'Chào mừng bạn đến với Bookstore!',
      template: 'welcome', // map với file welcome.hbs
      context: {
        userName: payload.fullName,
        verifyLink: verifyLink,
        current_year: this.current_year,
        website_link: this.website_link,
        contact_link: this.contact_link,
        privacy_policy_link: this.privacy_policy_link,
      },
    });
  }

  async sendResetPasswordEmail(payload: MailResetPwdPayload) {
    const resetLink = `${this.configService.get('FRONTEND_URL')}/auth/reset-password/${payload.resetToken}`;
    await this.baseMailer.sendMail({
      to: payload.to,
      subject: 'Yêu cầu đặt lại mật khẩu',
      template: 'reset-password', // map với file reset-password.hbs
      context: {
        userName: payload.fullName,
        resetUrl: resetLink,
        current_year: this.current_year,
        website_link: this.website_link,
        contact_link: this.contact_link,
        privacy_policy_link: this.privacy_policy_link,
      },
    });
  }
}
