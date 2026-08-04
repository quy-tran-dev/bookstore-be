import { Controller, Post, UseGuards, Get } from '@nestjs/common';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { Roles } from '@app/common/decorators/roles.decorator';
import { Role } from '@app/common/enums/role.enum';
import { RolesGuard } from '@app/common/guards/role.guard';

@Controller('admin/books')
@UseGuards(JwtAuthGuard, RolesGuard) // Phải đăng nhập VÀ có quyền
@Roles(Role.ADMIN) // Chỉ Admin mới được vào toàn bộ các API trong file này
export class AdminBookController {
  
  @Post()
  createBook() {
    return 'Admin tạo sách mới';
  }
}