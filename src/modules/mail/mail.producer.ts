import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { MailWelcomePayload, MailResetPwdPayload } from './interfaces/mail-payload.interface';

@Injectable()
export class MailProducer {
  constructor(@InjectQueue('mail_queue') private readonly mailQueue: Queue) {}

  private defaultOptions = {
    attempts: 3, // Thử lại 3 lần nếu lỗi
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true, // Xong thì xóa luôn khỏi Redis cho nhẹ RAM
  };

  async queueWelcomeEmail(payload: MailWelcomePayload) {
    await this.mailQueue.add('job_welcome_email', payload, this.defaultOptions);
  }

  async queueResetPassword(payload: MailResetPwdPayload) {
    await this.mailQueue.add('job_reset_pwd', payload, this.defaultOptions);
  }
}