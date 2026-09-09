import {
  Controller,
  Get,
  Query,
  DefaultValuePipe,
  BadRequestException,
  ParseIntPipe,
  NotFoundException,
  Param,
  UseInterceptors,
} from '@nestjs/common';
import { ProductsService } from '@app/modules/products/products.service';
import { StatusProduct } from '@app/common/enums/status-product.enum';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { plainToInstance } from 'class-transformer';
import {
  PublicProductDetailResponseDto,
  PublicProductListResponseDto,
} from '@app/modules/products/dto/public-product.dto';

@Controller('products')
@UseInterceptors(CacheInterceptor)
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

    const results = await this.productsService.searchHybridA(keyword, limit);

    return {
      message: 'Tìm kiếm thành công',
      data: {
        keyword: keyword,
        // Ép kiểu mảng kết quả về DTO dạng List
        results: plainToInstance(PublicProductListResponseDto, results),
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

    const results = await this.productsService.searchHybridB(keyword, limit);

    return {
      message: 'Tìm kiếm thành công',
      data: {
        keyword: keyword,
        results: plainToInstance(PublicProductListResponseDto, results),
        totalRetrieved: results.length,
      },
    };
  }

  @Get()
  @CacheTTL(300000)
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
    @Query('categoryId') categoryId?: string,
    @Query('authorId') authorId?: string,
    @Query('orderBy') orderBy?: string,
    @Query('sort') sort?: 'ASC' | 'DESC',
  ) {
    const result = await this.productsService.fetchProductsWithQuery(
      page,
      limit,
      {
        keyword,
        categoryId,
        authorId,
        status: StatusProduct.ACTIVE + '',
        isVerified: 'true',
        orderBy,
        sort,
      },
    );

    // Giả sử hàm paginate trả về object có thuộc tính 'data' chứa mảng records
    return {
      ...result,
      data: plainToInstance(PublicProductListResponseDto, result?.data || []),
    };
  }

  @Get('cart-items')
  @CacheTTL(15000)
  async getCartItems(@Query('ids') ids: string) {
    if (!ids) {
      return { validProducts: [], unavailableIds: [] };
    }

    const productIds = ids.split(',').map((id) => id.trim());
    const result = await this.productsService.getProductsForCart(productIds);

    return {
      message:
        result.unavailableIds.length > 0
          ? 'Một số sản phẩm trong giỏ hàng không còn tồn tại hoặc đã ngừng kinh doanh'
          : 'Lấy dữ liệu giỏ hàng thành công',
      data: {
        validProducts: plainToInstance(
          PublicProductListResponseDto,
          result.validProducts,
        ),

        unavailableIds: result.unavailableIds,
      },
    };
  }

  @Get(':slug')
  @CacheTTL(600000)
  async findOneBySlug(@Param('slug') slug: string) {
    const product = await this.productsService.findOneBy(
      { slug: slug, status: StatusProduct.ACTIVE, isVerified: true },
      {
        relations: {
          categories: true,
          authors: true,
          albums: { media: true },
          bookDetail: true,
        },
      },
    );

    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm này');

    // Ép sang DTO Chi tiết (Full thông tin)
    return plainToInstance(PublicProductDetailResponseDto, product);
  }

  @Get('id/:id')
  @CacheTTL(600000)
  async findOneById(@Param('id') id: string) {
    const product = await this.productsService.findOneBy(
      { id: id, status: StatusProduct.ACTIVE, isVerified: true },
      {
        relations: {
          categories: true,
          authors: true,
          albums: { media: true },
          bookDetail: true,
        },
      },
    );

    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm này');

    return plainToInstance(PublicProductDetailResponseDto, product);
  }
}
