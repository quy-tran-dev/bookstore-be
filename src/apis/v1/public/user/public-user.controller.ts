import { Controller, Get, Put, Body, Req, UseGuards, Param, Patch } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '@app/common/decorators/roles.decorator';
import { Role } from '@app/common/enums/role.enum';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { UsersService } from '@app/modules/users/users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class PublicUsersController {
  constructor(private readonly usersService: UsersService) {}


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

}