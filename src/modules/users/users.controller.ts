import { Controller, Get, Put, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard) // Toàn bộ route trong này bắt buộc đăng nhập
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@Req() req: Request) {
    // req.user được Inject vào nhờ JwtAccessStrategy
    const userId = (req.user as any).id;
    return this.usersService.getProfile(userId);
  }

  @Put('profile')
  async updateProfile(@Req() req: Request, @Body() body: any) {
    const userId = (req.user as any).id;
    return this.usersService.updateProfile(userId, body);
  }
}