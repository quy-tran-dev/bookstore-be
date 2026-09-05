import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { MailService } from './mail.service';
import { DiscordService } from '../discord/discord.service';

@Processor('mail_queue')
export class MailProcessor {
  constructor(
    private readonly mailService: MailService,
    private readonly discordService: DiscordService, // Tận dụng Global Module
  ) {}

  @Process('job_welcome_email')
  async handleWelcomeEmail(job: Job) {
    await this.mailService.sendWelcomeEmail(job.data);
  }

  @Process('job_reset_pwd')
  async handleResetPwd(job: Job) {
    await this.mailService.sendResetPasswordEmail(job.data);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    // Tự động bắn Discord khi gửi mail thất bại hoàn toàn (sau 3 lần thử)
    this.discordService.sendLog(
      'ERROR',
      `Job [${job.name}] gửi tới ${job.data.to} thất bại!\nChi tiết: ${error.message}`,
      'MailProcessor'
    );
  }

  @Process('job_order_confirmation')
  async handleOrderConfirmation(job: Job) {
    await this.mailService.sendOrderConfirmationEmail(job.data);
  }
}