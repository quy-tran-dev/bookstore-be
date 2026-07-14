import { DiscordLogService } from '@app/modules/discord-notify/log-discord.service';
import { Injectable, Logger } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
@Injectable()
export class LoggerService {
  constructor(private readonly discordService: DiscordLogService) {}
  private logger = new Logger();

  async logRequest(req: ExpressRequest, duration: number) {
    // req.url =
    const message = `Request: ${req.method} ${req.url} - ${duration}ms - SUCCESS`;
    this.logger.verbose(message);

    await this.discordService.sendLog('INFO', message, 'Request');
  }

  async logInfo(feature: string, mess: string) {
    const message = `Info on ${feature}:\n${mess}`;
    this.logger.log(message);
    await this.discordService.sendLog('INFO',  message,feature);
  }

  async logDebug(feature: string, mess: string, data: any) {
    const message = `Debug on ${feature}:\n${mess}`;
    this.logger.debug(message);
    this.logger.debug(JSON.stringify(data));
    await this.discordService.sendLog('WARN',message, feature );
  }

  async logError(req: ExpressRequest, mess: string, errString: string) {
    const message = `Error on ${req.method} ${req.url}:\n${mess}`;
    this.logger.error(message);
    await this.discordService.sendLog('ERROR',message, errString );
  }
}
