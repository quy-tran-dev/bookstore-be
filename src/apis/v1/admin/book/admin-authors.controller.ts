import { Controller, Get, Post, Body, Patch, Param, Delete, Query, Req, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { Roles } from '@app/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Role } from '@app/common/enums/role.enum';
import { DiscordService } from '@app/modules/discord/discord.service';
import { AuthorsService } from '@app/modules/products/authors.service';
import {
  CreateAuthorDto,
  UpdateAuthorDto,
} from '@app/modules/products/dto/admin-author.dto';

@Controller('admin/authors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAuthorsController {
  constructor(
    private readonly authorsService: AuthorsService,
    private readonly discordService: DiscordService
  ) {}

  @Post()
  async create(@Body() dto: CreateAuthorDto, @Req() req: any) {
    const result = await this.authorsService.create(dto, req.user?.id);
    
    this.discordService.sendNewUpdate(
        'WARN',
        ` **[Admin]** Vừa THÊM tác giả mới: **${result.name}**`,
        'AdminAuthorsController',
      );
    
    return result;
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.authorsService.findAllPaginated(page, limit, {
      order: { createdAt: 'DESC' }
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    // BaseService yêu cầu object FindOptionsWhere
    return this.authorsService.findOne({ id } as any);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAuthorDto, @Req() req: any) {
    const result = await this.authorsService.update(id, dto, req.user?.id);
    
    this.discordService.sendNewUpdate(
        'WARN',
        ` **[Admin]** Vừa CẬP NHẬT tác giả: **${result.name}**`,
        'AdminAuthorsController',
      );
    
    return result;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.authorsService.softDelete(id, req.user?.id);
    
    this.discordService.sendNewUpdate(
        'WARN',
        ` **[Admin]** Vừa XÓA tác giả ID: \`${id}\``,
        'AdminAuthorsController',
      );
    
    return { message: 'Đã xóa tác giả' };
  }

  @Post('restore/:id')
  async restore(@Param('id') id: string, @Req() req: any) {
    await this.authorsService.restore(id, req.user?.id);
    
    this.discordService.sendNewUpdate(
        'WARN',
        ` **[Admin]** Vừa KHÔI PHỤC tác giả ID: \`${id}\``,
        'AdminAuthorsController',
      );
    
    return { message: 'Đã khôi phục tác giả' };
  }

  @Get('soft-delete')
  getSoftDelete(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    // Nếu trong BaseService của bạn có hàm findPaginatedSoftDeleted
    return (this.authorsService as any).findPaginatedSoftDeleted(page, limit);
  }
}