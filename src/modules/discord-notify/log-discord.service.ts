import { DateFormatUtil } from '@app/common/utils/date-format.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class DiscordLogService {
  private webhookUrls: Record<string, string>;

  constructor(configService: ConfigService) {
    this.webhookUrls = {
      LOG: configService.get('DISCORD_WEBHOOK_URL_LOG') as string,
      UPDATE: configService.get('DISCORD_WEBHOOK_URL_UPDATE') as string,
      ORDER: configService.get('DISCORD_WEBHOOK_URL_ORDER') as string,
    };
  }

  // Hàm dùng chung cho mọi loại log (Gom code trùng lặp)
  private async sendToWebhook(
    url: string,
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    context?: string,
  ) {
    if (!url) return; // Bỏ qua nếu chưa config biến môi trường

    const safeMessage = message.substring(0, 2048);
    const safeContext = context ? context.substring(0, 250) : '';

    const embed = {
      title: `${level} ${safeContext ? `- ${safeContext}` : ''}`,
      description: safeMessage,
      color: this.getColor(level),
      footer: { text: DateFormatUtil.formatDate(new Date()) },
    };

    // KHÔNG dùng await bên ngoài, bắt lỗi ngay tại đây để không ảnh hưởng luồng chính
    axios.post(url, { embeds: [embed] }).catch((error) => {
      console.error('Failed to send Discord log:', error?.response?.data || error.message);
    });
  }

  // Các hàm public giờ chỉ còn 1 dòng duy nhất
  sendLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: string) {
    this.sendToWebhook(this.webhookUrls.LOG, level, message, context);
  }

  sendNewUpdate(level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: string) {
    this.sendToWebhook(this.webhookUrls.UPDATE, level, message, context);
  }

  sendOrder(level: 'INFO' | 'WARN' | 'ERROR', message: string, context?: string) {
    this.sendToWebhook(this.webhookUrls.ORDER, level, message, context);
  }

  private getColor(level: string): number {
    const colors = { INFO: 3447003, WARN: 16776960, ERROR: 16711680 };
    return colors[level] || 8421504;
  }
}