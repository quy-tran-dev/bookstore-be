import { Injectable, Logger } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { DiscordLogService } from '@app/modules/discord-notify/log-discord.service';

@Injectable()
export class LoggerService {
  // Khởi tạo context cho Logger để dễ nhìn trên console
  private logger = new Logger(LoggerService.name);

  constructor(private readonly discordService: DiscordLogService) {}

  // Đã bỏ async/await vì DiscordLogService giờ tự chạy ngầm
  logRequest(req: ExpressRequest, duration: number) {
    const message = `Request: ${req.method} ${req.url} - ${duration}ms`;
    this.logger.log(message); // Đổi thành log để dễ thấy hơn verbose
    // Không cần bắn mọi request INFO lên Discord kẻo bị spam rate-limit
  }

  logInfo(feature: string, mess: string) {
    this.logger.log(`Info on ${feature}:\n${mess}`);
    this.discordService.sendLog('INFO', mess, feature);
  }

  logDebug(feature: string, mess: string, data: any) {
    this.logger.debug(`Debug on ${feature}:\n${mess}\n${JSON.stringify(data)}`);
    this.discordService.sendLog('WARN', mess, feature);
  }

  logError(req: ExpressRequest, mess: string, errString?: string) {
    const message = `Error on ${req.method} ${req.url}:\n${mess}`;
    this.logger.error(message, errString);
    this.discordService.sendLog('ERROR', message, errString);
  }
}
