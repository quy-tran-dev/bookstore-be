import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Thông tin user được JWT Strategy giải mã gán vào

    // Nếu không có thông tin user, AuthGuard chặn từ trước rồi. 
    // Ở đây chỉ kiểm tra cờ isVerified
    if (!user || user.isVerified === false) {
      throw new ForbiddenException(
        'Tài khoản của bạn chưa được xác thực email. Vui lòng kiểm tra hộp thư để thực hiện tính năng này.',
      );
    }

    return true;
  }
}