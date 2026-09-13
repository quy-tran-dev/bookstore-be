import { StatusCategory } from '@app/common/enums/status-category.enum';
import { CategoriesService } from '@app/modules/categories/categories.service';
import {
  PublicCategoryDto,
  PublicCategoryResponseDto,
} from '@app/modules/categories/dto/public-category.dto';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ILike } from 'typeorm';
import { plainToInstance } from 'class-transformer';

@Controller('categories')
@UseInterceptors(CacheInterceptor)
export class PublicCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('tree')
  @CacheTTL(1800000)
  async getTree() {
    const rootCategories = await this.categoriesService.getPublicTree();
    // Vẫn giữ PublicCategoryDto cũ của bạn vì nó có thể chứa logic cho tree (đệ quy children)
    return rootCategories.map((cat) => new PublicCategoryDto(cat));
  }

  @Get()
  @CacheTTL(1800000)
  async findAll(
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
      orderCondition.createdAt = 'DESC';
    }

    const result = await this.categoriesService.findAllPaginated(page, limit, {
      where: whereCondition,
      order: orderCondition,
    });

    return {
      ...result,
      data: plainToInstance(PublicCategoryResponseDto, result?.data || []),
    };
  }

  @Get(':slug')
  @CacheTTL(1800000)
  async getDetail(@Param('slug') slug: string) {
    const result =
      await this.categoriesService.getCategoryWithBreadcrumbs(slug);
    if (!result) throw new NotFoundException('Không tìm thấy danh mục');

    // Nếu getCategoryWithBreadcrumbs trả về { category, breadcrumbs }
    // Bạn có thể bọc riêng phần category
    return result;
  }

  @Get('id/:id')
  @CacheTTL(1800000)
  async findOneById(@Param('id') id: string) {
    const category = await this.categoriesService.findOneBy({
      id: id,
      status: StatusCategory.ACTIVE,
    });

    if (!category) throw new NotFoundException('Không tìm thấy danh mục');

    return plainToInstance(PublicCategoryResponseDto, category);
  }
}
