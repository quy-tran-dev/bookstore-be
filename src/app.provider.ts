import { Provider } from '@nestjs/common';
import { AppService } from './app.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformResponseInterceptor } from './common/interceptors/transform.interceptor';
import { LoggerService } from './common/services/logger.service';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { DiscordService } from './modules/discord/discord.service';

export const providers: Provider[] = [
  AppService,
  {
    provide: APP_GUARD,
    useClass: ThrottlerGuard,
  },
  {
    provide: APP_INTERCEPTOR,
    useClass: LoggingInterceptor,
  },
  {
    provide: APP_INTERCEPTOR,
    useClass: TransformResponseInterceptor,
  },
  {
    provide: APP_FILTER,
    useClass: AllExceptionsFilter,
  },
  LoggerService,
  DiscordService,
];
