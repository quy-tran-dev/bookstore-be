import { CategoriesService } from '@app/modules/categories/categories.service';
import { PublicCategoryDto } from '@app/modules/categories/dto/public-category.dto';
import { Controller, Get, Param } from '@nestjs/common';
@Controller('categories')
export class PublicCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // API lấy toàn bộ cây Menu
  @Get('tree')
  async getTree() {
    const rootCategories = await this.categoriesService.getPublicTree();
    return rootCategories.map(cat => new PublicCategoryDto(cat));
  }

  

  // API lấy chi tiết 1 danh mục, trả về cả danh sách con và mảng Breadcrumbs
  @Get(':slug')
  async getDetail(@Param('slug') slug: string) {
    return this.categoriesService.getCategoryWithBreadcrumbs(slug);
  }
}