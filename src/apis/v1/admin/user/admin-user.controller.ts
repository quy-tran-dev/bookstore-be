import {
  Controller,
  Get,
  Put,
  Body,
  Req,
  UseGuards,
  Param,
  Patch,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '@app/common/decorators/roles.decorator';
import { Role } from '@app/common/enums/role.enum';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { UsersService } from '@app/modules/users/users.service';

@Controller('admin/users')
@UseGuards(JwtAuthGuard)
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  // ==========================================
  // API DÀNH RIÊNG CHO ADMIN
  // ==========================================
  @Get()
  async getAllUsers() {
    // Dùng hàm từ BaseService
    return this.usersService.findAllPaginated(1, 20);
  }

  @Patch(':id/block')
  async blockUser(@Param('id') id: string, @Req() req: Request) {
    const adminId = (req.user as any).id;
    await this.usersService.blockUser(id as string, adminId as string);
    return { message: 'Đã khóa tài khoản người dùng' };
  }

  @Patch(':id/unblock')
  async unblockUser(@Param('id') id: string, @Req() req: Request) {
    const adminId = (req.user as any).id;
    await this.usersService.unblockUser(id as string, adminId as string);
    return { message: 'Đã mở khóa tài khoản người dùng' };
  }
}
