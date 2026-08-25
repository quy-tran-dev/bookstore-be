import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
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
import { ILike, IsNull, Not } from 'typeorm';

@Controller('admin/authors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAuthorsController {
  constructor(
    private readonly authorsService: AuthorsService,
    private readonly discordService: DiscordService,
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
    @Query('keyword') keyword?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    // 1. Khởi tạo object điều kiện lọc (Where)
    const whereCondition: any = {};

    if (keyword) {
      whereCondition.name = ILike(`%${keyword}%`); // Tìm kiếm theo tên
    }

    // 2. Khởi tạo object sắp xếp (Order)
    const orderCondition: any = {};
    if (orderBy) {
      // Nếu có truyền orderBy (vd: name, createdAt), xếp theo chiều sort (mặc định DESC)
      orderCondition[orderBy] = sort || 'DESC';
    } else {
      // Mặc định luôn xếp mới nhất lên đầu
      orderCondition.createdAt = 'DESC';
    }

    // 3. Đẩy vào BaseService
    return this.authorsService.findAllPaginated(page, limit, {
      where: whereCondition,
      order: orderCondition,
      relations: { avatar: true },
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authorsService.findOneAdmin(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAuthorDto,
    @Req() req: any,
  ) {
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

  @Get('soft-delete/get')
  getSoftDelete(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
  ) {
    const whereCondition: any = {};

    if (keyword) {
      whereCondition.name = ILike(`%${keyword}%`);
    }
    whereCondition.deletedAt = Not(IsNull());

    return this.authorsService.findPaginatedSoftDeleted(page, limit, {
      where: whereCondition,
      order: { deletedAt: 'DESC' },
    });
  }

  @Delete('hard/:id')
  async hardRemove(@Param('id') id: string, @Req() req: any) {
    await this.authorsService.hardDelete(id);

    this.discordService.sendNewUpdate(
      'WARN',
      `**[Admin]** Vừa XÓA VĨNH VIỄN Tác giả ID: \`${id}\` và dọn dẹp ổ cứng`,
      'AdminAuthorsController',
    );

    return { message: 'Đã xóa vĩnh viễn tác giả và file ảnh liên quan' };
  }
}
