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
import { ProductsService } from '@app/modules/products/products.service';
import {
  CreateProductDto,
  UpdateProductDto,
} from '@app/modules/products/dto/admin-product.dto';

@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly discordService: DiscordService,
  ) {}

  @Post()
  async create(@Body() dto: CreateProductDto, @Req() req: any) {
    const result = await this.productsService.create(dto, req.user?.id);
    this.discordService.sendNewUpdate(
        'WARN',
        ` **[Admin]** Vừa TẠO sách mới: **${result.name}**`,
        'AdminProductsController',
      );
    return result;
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.productsService.findAllPaginated(page, limit, {
      relations: {
        categories: true,
        authors: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOneWithDetails(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: any,
  ) {
    const result = await this.productsService.update(id, dto, req.user?.id);
    this.discordService.sendNewUpdate(
        'WARN',
        ` **[Admin]** Vừa CẬP NHẬT sách: **${result.name}**`,
        'AdminProductsController',
      );
      
    return result;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.productsService.softDelete(id, req.user?.id);
    this.discordService.sendNewUpdate(
        'WARN',
        ` **[Admin]** Vừa XÓA sách ID: \`${id}\``,
        'AdminProductsController',
      );
    return { message: 'Đã xóa sản phẩm' };
  }

  @Post('restore/:id')
  async restore(@Param('id') id: string, @Req() req: any) {
    await this.productsService.restore(id, req.user?.id);
    this.discordService
      .sendNewUpdate(
        'WARN',
        ` **[Admin]** Vừa KHÔI PHỤC sách ID: \`${id}\``,
        'AdminProductsController',
      );
    return { message: 'Đã khôi phục sản phẩm' };
  }

  @Get('soft-delete')
  getSoftDelete(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    // Nếu bạn có tuỳ chỉnh lại hàm findPaginatedSoftDeleted để nhận options thì thêm relations vào đây tương tự findAll nhé
    return this.productsService.findPaginatedSoftDeleted(page, limit);
  }
}
