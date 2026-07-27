import { Controller, Get, Put, Body, Req, UseGuards, Param, Patch } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { Roles } from '@app/common/decorators/roles.decorator';
import { Role } from '@app/common/enums/role.enum';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RolesGuard } from '@app/common/guards/role.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ==========================================
  // API CHO USER BÌNH THƯỜNG
  // ==========================================
  @Get('me')
  async getProfile(@Req() req: Request) {
    const userId = (req.user as any).id;
    return this.usersService.getProfile(userId);
  }

  @Put('profile')
  async updateProfile(@Req() req: Request, @Body() body: any) {
    const userId = (req.user as any).id;
    return this.usersService.updateProfile(userId, body);
  }

  // ==========================================
  // API DÀNH RIÊNG CHO ADMIN
  // ==========================================
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  async getAllUsers() {
    // Dùng hàm từ BaseService
    return this.usersService.findAllPaginated(1, 20); // Có thể lấy page/limit từ @Query()
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/block')
  async blockUser(@Param('id') id: string) {
    await this.usersService.blockUser(id);
    return { message: 'Đã khóa tài khoản người dùng' };
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/unblock')
  async unblockUser(@Param('id') id: string) {
    await this.usersService.unblockUser(id);
    return { message: 'Đã mở khóa tài khoản người dùng' };
  }
}