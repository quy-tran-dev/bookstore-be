import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  canActivate(context: ExecutionContext) {
    // Thêm logic custom ở đây nếu cần, hiện tại dùng mặc định của Passport-JWT
    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    // Format lại lỗi Unauthorized cho đồng nhất
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException('Bạn chưa đăng nhập hoặc token không hợp lệ')
      );
    }
    return user;
  }
}
