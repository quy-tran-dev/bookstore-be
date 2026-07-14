import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger, // Đảm bảo bạn đã import Logger
} from '@nestjs/common';
import { Request as ExpressRequest, Response } from 'express';
import { LoggerService } from '../services/logger.service'; // Đảm bảo đường dẫn đúng


@Catch(HttpException) // <--- Thay đổi ở đây để bắt HttpException
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly loggerService: LoggerService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const logger = new Logger(AllExceptionsFilter.name); // Sử dụng tên lớp để log rõ ràng hơn

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<ExpressRequest>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? (exception.getResponse() as any) // Lấy response object của HttpException
        : null;

    const message =
      exception instanceof HttpException
        ? (typeof exceptionResponse === 'object' && exceptionResponse !== null && exceptionResponse.message) // Lấy message từ response object
          ? exceptionResponse.message
          : exception.message
        : 'Internal Server Error';

    const errorData =
      exception instanceof HttpException
        ? (typeof exceptionResponse === 'object' && exceptionResponse !== null && exceptionResponse.error) // Lấy error từ response object
          ? exceptionResponse.error
          : undefined
        : undefined;

    // Log lỗi
    logger.error(
      `Error on ${req.method} ${req.url}: Status ${status}, Message: ${message}`,
      (exception instanceof Error) ? exception.stack : undefined, // Log stack trace nếu là Error
    );

    await this.loggerService.logError(req, ` Status ${status}, Message: ${message}`, errorData);

    // Gửi phản hồi tùy chỉnh
    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(), 
      message: message,
      data: errorData || null,
    });
  }
}