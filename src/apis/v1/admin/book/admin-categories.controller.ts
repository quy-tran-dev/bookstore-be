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
import { ILike, IsNull, Not } from 'typeorm';

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
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('isVerified') isVerified?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    // 1. Khởi tạo object điều kiện lọc (Where)
    const whereCondition: any = {};

    if (keyword) {
      whereCondition.name = ILike(`%${keyword}%`); // Tìm kiếm theo tên
    }

    if (status !== undefined) {
      whereCondition.status = parseInt(status, 10);
    }

    if (isVerified !== undefined) {
      // Chuyển chuỗi 'true'/'false' từ Query URL thành boolean
      whereCondition.isVerified = isVerified === 'true';
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
    return this.categoriesService.findAllPaginated(page, limit, {
      where: whereCondition,
      order: orderCondition,
      relations: { parent: true }, // Vẫn Join parent để hiển thị trên Data Table
    });
  }

  @Get("/tree")
  findAllTree(
    // Bỏ page và limit đi vì dùng Tree thì trả về hết
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('isVerified') isVerified?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    
    // Convert dữ liệu từ query string (mặc định là string) sang đúng kiểu
    const parsedStatus = status !== undefined ? parseInt(status, 10) : undefined;
    const parsedIsVerified = isVerified !== undefined ? isVerified === 'true' : undefined;

    return this.categoriesService.getAdminTree({
      keyword,
      status: parsedStatus,
      isVerified: parsedIsVerified,
      orderBy,
      sort
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    // Gọi hàm chuyên dụng cho Admin để lấy full Audit fields và Parent relation
    return this.categoriesService.findAdminDetail(id);
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

    // Truyền điều kiện lọc vào hàm thùng rác
    // Lưu ý: BaseService của bạn phải hỗ trợ truyền options vào findPaginatedSoftDeleted nhé
    return this.categoriesService.findPaginatedSoftDeleted(page, limit, {
      where: whereCondition,
      relations: { parent: true },
      order: { deletedAt: 'DESC' } // Xếp theo thời gian xóa gần nhất
    });
  }
}
