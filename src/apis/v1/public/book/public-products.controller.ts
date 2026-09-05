import {
  Controller,
  Get,
  Query,
  DefaultValuePipe,
  BadRequestException,
  ParseIntPipe,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ProductsService } from '@app/modules/products/products.service';
import { StatusProduct } from '@app/common/enums/status-product.enum';

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

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('authorId') authorId?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    // Gọi thẳng vào hàm QueryBuilder đã tối ưu của bạn

    return this.productsService.fetchProductsWithQuery(page, limit, {
      keyword,
      categoryId,
      authorId,
      status: StatusProduct.ACTIVE + '',
      isVerified: 'true',
      orderBy,
      sort,
    });
  }

  @Get('cart-items')
  async getCartItems(@Query('ids') ids: string) {
    if (!ids) {
      return [];
    }

    const productIds = ids.split(',').map((id) => id.trim());

    return this.productsService.getProductsForCart(productIds);
  }

  @Get(':slug')
  async findOneBySlug(@Param('slug') slug: string) {
    // Dùng TypeORM findOne để kéo toàn bộ thông tin chi tiết
    const product = await this.productsService.findOneBy(
      {
        slug: slug,
        status: StatusProduct.ACTIVE,
        isVerified: true,
      },
      {
        relations: {
          categories: true,
          authors: true,
          albums: { media: true },
          bookDetail: true,
        },
      },
    );
    return product;
  }

  @Get('id/:id')
  async findOneById(@Param('id') id: string) {
    const product = await this.productsService.findOneBy(
      { 
        id: id,
        status: StatusProduct.ACTIVE, 
        isVerified: true 
      },
      {
        relations: {
          categories: true,
          authors: true,
          albums: { media: true },
          bookDetail: true 
        },
      }
    );
    
    return product;
  }
}
