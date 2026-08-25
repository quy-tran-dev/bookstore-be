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
import { ILike, IsNull, Not } from 'typeorm';

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
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('authorId') authorId?: string,
    @Query('status') status?: string,
    @Query('isVerified') isVerified?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    return this.productsService.fetchProductsWithQuery(page, limit, {
      keyword,
      categoryId,
      authorId,
      status,
      isVerified,
      orderBy,
      sort,
    });
  }

  @Get('category/:categoryId')
  findByCategory(
    @Param('categoryId') categoryId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('isVerified') isVerified?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    return this.productsService.fetchProductsWithQuery(page, limit, {
      keyword,
      categoryId, // Gán categoryId từ Param vào
      status,
      isVerified,
      orderBy,
      sort,
    });
  }

  @Get('author/:authorId')
  findByAuthor(
    @Param('authorId') authorId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('isVerified') isVerified?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    return this.productsService.fetchProductsWithQuery(page, limit, {
      keyword,
      authorId, 
      status,
      isVerified,
      orderBy,
      sort,
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
    this.discordService.sendNewUpdate(
      'WARN',
      ` **[Admin]** Vừa KHÔI PHỤC sách ID: \`${id}\``,
      'AdminProductsController',
    );
    return { message: 'Đã khôi phục sản phẩm' };
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

    return this.productsService.findPaginatedSoftDeleted(page, limit, {
      where: whereCondition,
      order: { deletedAt: 'DESC' },
    });
  }

  @Delete('hard/:id')
  async hardRemove(@Param('id') id: string, @Req() req: any) {
    await this.productsService.hardDelete(id);

    this.discordService.sendNewUpdate(
      'WARN',
      `**[Admin]** Vừa XÓA VĨNH VIỄN Sản phẩm ID: \`${id}\` và toàn bộ kho ảnh của nó`,
      'AdminProductsController',
    );

    return { message: 'Đã xóa vĩnh viễn sản phẩm và dọn sạch ổ cứng' };
  }
}
