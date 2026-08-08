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
import { CategoriesService } from '@app/modules/categories/categories.service';
import { CreateCategoryDto } from '@app/modules/categories/dto/admin-category.dto';
import { Role } from '@app/common/enums/role.enum';

// IMPORT DISCORD SERVICE
import { DiscordService } from '@app/modules/discord/discord.service';

@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminCategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly discordService: DiscordService, // <-- Inject vào đây
  ) {}

  @Post()
  async create(@Body() dto: CreateCategoryDto, @Req() req: any) {
    const result = await this.categoriesService.create(dto, req.user?.id);

    // Bắn log Fire-and-Forget
    this.discordService.sendNewUpdate(
      'INFO',
      `**[Admin]** User ID \`${req.user?.id}\` vừa TẠO danh mục: **${result.name}**`,
      'AdminCategoriesController',
    );

    return result;
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    // Tận dụng tham số options của BaseService để Join bảng Parent
    return this.categoriesService.findAllPaginated(page, limit, {
      relations: { parent: true },
      order: { createdAt: 'DESC' }, // Tiện tay sắp xếp mới nhất lên đầu luôn
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCategoryDto>,
    @Req() req: any,
  ) {
    const result = await this.categoriesService.update(id, dto, req.user?.id);

    this.discordService.sendNewUpdate(
      'INFO',
      `**[Admin]** User ID \`${req.user?.id}\` vừa CẬP NHẬT danh mục: **${result.name}**`,
      'AdminCategoriesController',
    );

    return result;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.categoriesService.softDelete(id, req.user?.id);

    this.discordService.sendNewUpdate(
      'WARN',
      `**[Admin]** User ID \`${req.user?.id}\` vừa XÓA danh mục ID: \`${id}\``,
      'AdminCategoriesController',
    );

    return { message: 'Đã xóa danh mục' };
  }

  @Post('restore/:id')
  async restore(@Param('id') id: string, @Req() req: any) {
    await this.categoriesService.restore(id, req.user?.id);

    this.discordService.sendNewUpdate(
      'WARN',
      `**[Admin]** User ID \`${req.user?.id}\` vừa KHÔI PHỤC danh mục ID: \`${id}\``,
      'AdminCategoriesController',
    );

    return { message: 'Đã khôi phục danh mục' };
  }

  @Get('soft-delete')
  getSoftDelete(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    // Nếu bạn có tuỳ chỉnh lại hàm findPaginatedSoftDeleted để nhận options thì thêm relations vào đây tương tự findAll nhé
    return this.categoriesService.findPaginatedSoftDeleted(page, limit);
  }
}
