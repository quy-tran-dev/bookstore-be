import {
  Controller,
  Get,
  Query,
  DefaultValuePipe,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { ProductsService } from '@app/modules/products/products.service';

@Controller('products')
export class PublicProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('search-a')
  async searchA(
    @Query('keyword') keyword: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    if (!keyword || keyword.trim() === '') {
      throw new BadRequestException('Vui lòng nhập từ khóa tìm kiếm');
    }

    // Đẩy từ khóa xuống cỗ máy Hybrid Search
    const results = await this.productsService.searchHybridA(keyword, limit);

    // Trả kết quả về cho Frontend
    return {
      message: 'Tìm kiếm thành công',

      data: {
        keyword: keyword,
        results: results,
        totalRetrieved: results.length,
      },
    };
  }

   @Get('search-b')
  async searchB(
    @Query('keyword') keyword: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    if (!keyword || keyword.trim() === '') {
      throw new BadRequestException('Vui lòng nhập từ khóa tìm kiếm');
    }

    // Đẩy từ khóa xuống cỗ máy Hybrid Search
    const results = await this.productsService.searchHybridB(keyword, limit);

    // Trả kết quả về cho Frontend
    return {
      message: 'Tìm kiếm thành công',

      data: {
        keyword: keyword,
        results: results,
        totalRetrieved: results.length,
      },
    };
  }
}
