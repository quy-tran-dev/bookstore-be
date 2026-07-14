import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { LoggerService } from '../services/logger.service';
import { Observable, tap } from 'rxjs';
import { Request as RequestExpress } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly loggerService: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<RequestExpress>();
    const now = Date.now();

    return next.handle().pipe(
      tap(async () => {
        const duration = Date.now() - now;
        await this.loggerService.logRequest(req, duration);
      }),
    );
  }
}
