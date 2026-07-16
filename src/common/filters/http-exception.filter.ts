import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request as ExpressRequest, Response } from 'express';
import { LoggerService } from '../services/logger.service';

// 1. Dùng @Catch() trống để bắt TẤT CẢ các loại lỗi (Kể cả TypeORM Error, Runtime Error)
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  // 2. Đưa Logger lên làm class property (chỉ khởi tạo 1 lần)
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly loggerService: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<ExpressRequest>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal Server Error';
    let errorData = null;

    // 3. Xử lý phân loại lỗi rõ ràng
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      // Dùng Optional Chaining để code clean hơn
      message = exceptionResponse?.message || exception.message;
      errorData = exceptionResponse?.error || null;
    } else if (exception instanceof Error) {
      // Bắt các lỗi Runtime hệ thống (TypeORM, v.v...)
      message = exception.message;
      // Ở Production có thể giấu message lỗi DB đi để bảo mật
    }

    const logMessage = `Error on ${req.method} ${req.url}: Status ${status}, Message: ${JSON.stringify(message)}`;

    // Ghi log ra Console
    this.logger.error(
      logMessage,
      exception instanceof Error ? exception.stack : undefined,
    );

    // 4. Bỏ 'await' để xử lý bất đồng bộ (Fire-and-forget), không làm treo request của User
    this.loggerService.logError(
      req,
      `Status ${status}, Message: ${JSON.stringify(message)}`,
      errorData || 'Null',
    );

    // Gửi phản hồi tùy chỉnh
    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      message: message, // Message có thể là string hoặc mảng string (nếu do ValidationPipe ném ra)
      data: errorData,
      path: req.url, // Nên có thêm path để FE dễ trace lỗi
    });
  }
}
