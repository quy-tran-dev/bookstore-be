import { StatusCategory } from '@app/common/enums/status-category.enum';
import { CategoriesService } from '@app/modules/categories/categories.service';
import { PublicCategoryDto } from '@app/modules/categories/dto/public-category.dto';
import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ILike } from 'typeorm';
@Controller('categories')
export class PublicCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // API lấy toàn bộ cây Menu
  @Get('tree')
  async getTree() {
    const rootCategories = await this.categoriesService.getPublicTree();
    return rootCategories.map((cat) => new PublicCategoryDto(cat));
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    const whereCondition: any = {
      status: StatusCategory.ACTIVE,
      isVerified: true,
    };

    if (keyword) {
      whereCondition.name = ILike(`%${keyword}%`);
    }

    const orderCondition: any = {};
    if (orderBy) {
      orderCondition[orderBy] = sort || 'DESC';
    } else {
      orderCondition.createdAt = 'DESC'; // Hoặc order theo sortOrder nếu bạn có
    }

    // Tận dụng lại hàm findAllPaginated từ BaseService
    return this.categoriesService.findAllPaginated(page, limit, {
      where: whereCondition,
      order: orderCondition,
    });
  }

  // API lấy chi tiết 1 danh mục, trả về cả danh sách con và mảng Breadcrumbs
  @Get(':slug')
  async getDetail(@Param('slug') slug: string) {
    return this.categoriesService.getCategoryWithBreadcrumbs(slug);
  }

  @Get('id/:id')
  async findOneById(@Param('id') id: string) {
    const category = await this.categoriesService.findOneBy({
      id: id,
      status: StatusCategory.ACTIVE,
    });

    return category;
  }
}
