import { DateFormatUtil } from '@app/common/utils/date-format.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class DiscordLogService {
  private webhookUrlLog: string;
  private webhookUrlUpdate: string;
  private webhookUrlOrder: string;
  constructor(configService: ConfigService) {
    this.webhookUrlLog = configService.get('DISCORD_WEBHOOK_URL_LOG') as string;
    this.webhookUrlUpdate = configService.get(
      'DISCORD_WEBHOOK_URL_UPDATE',
    ) as string;
    this.webhookUrlOrder = configService.get(
      'DISCORD_WEBHOOK_URL_ORDER',
    ) as string;
  }

  async sendLog(
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    context?: string,
  ) {
    // Cắt ngắn message và context nếu quá dài
    const maxDescriptionLength = 2048;
    const maxTitleLength = 256;

    const safeMessage = message.substring(0, maxDescriptionLength);
    const safeContext = context
      ? context.substring(0, maxTitleLength - level.length - 3)
      : ''; // -3 cho ' - '

    const timestamp = DateFormatUtil.formatDate(new Date());

    const embed = {
      title: `${level} ${safeContext ? `- ${safeContext}` : ''}`,
      description: safeMessage,
      color: this.getColor(level),
      footer: {
        text: timestamp,
      },
    };

    try {
      await axios.post(this.webhookUrlLog, {
        embeds: [embed],
      });
      console.log('Discord log sent successfully.');
    } catch (error) {
      console.error('Failed to send Discord log:', error);
      if (axios.isAxiosError(error) && error.response) {
        console.error('Discord API response error:', error.response.data);
      }
    }
  }

  async sendNewUpdate(
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    context?: string,
  ) {
    // Cắt ngắn message và context nếu quá dài
    const maxDescriptionLength = 2048;
    const maxTitleLength = 256;

    const safeMessage = message.substring(0, maxDescriptionLength);
    const safeContext = context
      ? context.substring(0, maxTitleLength - level.length - 3)
      : ''; // -3 cho ' - '

    const timestamp = DateFormatUtil.formatDate(new Date());

    const embed = {
      title: `${level} ${safeContext ? `- ${safeContext}` : ''}`,
      description: safeMessage,
      color: this.getColor(level),
      footer: {
        text: timestamp,
      },
    };

    try {
      await axios.post(this.webhookUrlUpdate, {
        embeds: [embed],
      });
      console.log('Discord log sent successfully.');
    } catch (error) {
      console.error('Failed to send Discord log:', error);
      if (axios.isAxiosError(error) && error.response) {
        console.error('Discord API response error:', error.response.data);
      }
    }
  }

  async sendOrder(
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    context?: string,
  ) {
    // Cắt ngắn message và context nếu quá dài
    const maxDescriptionLength = 2048;
    const maxTitleLength = 256;

    const safeMessage = message.substring(0, maxDescriptionLength);
    const safeContext = context
      ? context.substring(0, maxTitleLength - level.length - 3)
      : ''; // -3 cho ' - '

    const timestamp = DateFormatUtil.formatDate(new Date());

    const embed = {
      title: `${level} ${safeContext ? `- ${safeContext}` : ''}`,
      description: safeMessage,
      color: this.getColor(level),
      footer: {
        text: timestamp,
      },
    };

    try {
      await axios.post(this.webhookUrlOrder, {
        embeds: [embed],
      });
      console.log('Discord log sent successfully.');
    } catch (error) {
      console.error('Failed to send Discord log:', error);
      if (axios.isAxiosError(error) && error.response) {
        console.error('Discord API response error:', error.response.data);
      }
    }
  }

  private getColor(level: string): number {
    switch (level) {
      case 'INFO':
        return 3447003;
      case 'WARN':
        return 16776960;
      case 'ERROR':
        return 16711680;
      default:
        return 8421504;
    }
  }
}
// how to use
// constructor(private readonly discordLogService: DiscordLogService) {}

// await this.discordLogService.sendLog('ERROR', 'Không thể kết nối DB', 'UserService');
// await this.discordLogService.sendLog('INFO', 'Sách mới được tạo', 'BookController');
