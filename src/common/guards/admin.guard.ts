import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.get<number>(
      ROLES_KEY,
      context.getHandler(),
    );
    if (requiredRole === undefined) {
      return true; // Không có yêu cầu vai trò cụ thể, cho phép
    }

    // const request = context.switchToHttp().getRequest<Request>();
    // const user = request.user; // User object từ JwtStrategy

    // if (!user || user.role === undefined) {
    //   throw new ForbiddenException(
    //     'Bạn không có quyền truy cập chức năng này.',
    //   );
    // }

    // // Kiểm tra cấp độ quyền: user.role phải LỚN HƠN HOẶC BẰNG cấp độ yêu cầu
    // if (user.role >= requiredRole) {
    //   return true;
    // }

    throw new ForbiddenException(
      'Bạn không có đủ quyền để truy cập chức năng này.',
    );
  }
}
