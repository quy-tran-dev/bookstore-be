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
import { SearchBenchmarkService } from '@app/modules/products/benchmark/search-benchmark.service';
import { StatusProduct } from '@app/common/enums/status-product.enum';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

@Controller('products')
@UseInterceptors(CacheInterceptor)
export class PublicProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly searchBenchmarkService: SearchBenchmarkService,
  ) {}

  /**
   * THUẬT TOÁN A: Tìm kiếm kết hợp với Khoảng cách Euclidean (L2 Distance <->)
   * Endpoint: GET /apis/v1/products/search-a?keyword=...
   */
  @Get('search-a')
  async searchA(
    @Query('keyword') keyword: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('alpha') alpha?: number,
    @Query('threshold') threshold?: number,
    @Query('normalize') normalize?: string,
    @Query('useOr') useOr?: string,
  ) {
    if (!keyword || keyword.trim() === '') {
      throw new BadRequestException('Vui lòng nhập từ khóa tìm kiếm');
    }

    const options = {
      alpha: alpha !== undefined ? Number(alpha) : undefined,
      threshold: threshold !== undefined ? Number(threshold) : undefined,
      normalizeScore: normalize === 'true' || normalize === '1',
      useOrOperator: useOr === 'true',
    };

    const results = await this.productsService.searchHybridA(keyword, limit, options);

    return {
      message: 'Tìm kiếm thành công',
      data: {
        keyword: keyword,
        algorithm: 'A (L2 Euclidean Distance)',
        parameters: {
          alpha: options.alpha ?? 0.7,
          ftsWeight: Number((1 - (options.alpha ?? 0.7)).toFixed(2)),
          threshold: options.threshold ?? 1.15,
          normalizeScore: options.normalizeScore,
          useOrOperator: options.useOrOperator,
        },
        results: results,
        totalRetrieved: results.length,
      },
    };
  }

  /**
   * TÌM KIẾM SÁCH CHÍNH THỨC (HYBRID SEARCH - KẾT HỢP FTS VÀ AI VECTOR)
   * Cấu hình tối ưu: Alpha = 0.7, Threshold = 0.65, minScore = 0.25, normalizeScore = false
   * Endpoint: GET /apis/v1/products/search?keyword=...
   */
  @Get('search')
  async search(
    @Query('keyword') keyword: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('alpha') alpha?: number,
    @Query('threshold') threshold?: number,
    @Query('normalize') normalize?: string,
    @Query('useOr') useOr?: string,
  ) {
    if (!keyword || keyword.trim() === '') {
      throw new BadRequestException('Vui lòng nhập từ khóa tìm kiếm');
    }

    const options = {
      alpha: alpha !== undefined ? Number(alpha) : undefined,
      threshold: threshold !== undefined ? Number(threshold) : undefined,
      normalizeScore: normalize === 'true' || normalize === '1',
      useOrOperator: useOr === 'true',
    };

    const results = await this.productsService.searchHybridB(keyword, limit, options);

    return {
      message: 'Tìm kiếm thành công',
      data: {
        keyword: keyword,
        algorithm: 'Hybrid Search (PostgreSQL FTS + Gemini Vector AI)',
        parameters: {
          alpha: options.alpha ?? 0.7,
          ftsWeight: Number((1 - (options.alpha ?? 0.7)).toFixed(2)),
          threshold: options.threshold ?? 0.65,
          normalizeScore: options.normalizeScore,
          useOrOperator: options.useOrOperator,
        },
        results: results,
        totalRetrieved: results.length,
      },
    };
  }

  // Alias search-b để đảm bảo tương thích ngược nếu Frontend đang gọi
  @Get('search-b')
  async searchB(
    @Query('keyword') keyword: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('alpha') alpha?: number,
    @Query('threshold') threshold?: number,
    @Query('normalize') normalize?: string,
    @Query('useOr') useOr?: string,
  ) {
    return this.search(keyword, limit, alpha, threshold, normalize, useOr);
  }

  /**
   * So sánh trực quan 6 Kịch bản kiểm thử
   * Endpoint: GET /apis/v1/products/benchmark/scenarios?algorithm=B
   */
  @Get('benchmark/scenarios')
  @CacheTTL(0)
  async run5Scenarios(
    @Query('algorithm') algorithm: 'A' | 'B' = 'B',
    @Query('threshold') threshold?: number,
    @Query('normalize') normalize?: string,
  ) {
    const options = {
      threshold: threshold !== undefined ? Number(threshold) : undefined,
      normalizeScore:
        normalize === 'true' || normalize === '1'
          ? true
          : normalize === 'false' || normalize === '0'
            ? false
            : undefined,
    };
    const result = await this.searchBenchmarkService.run5Scenarios(
      algorithm,
      options,
    );

    return {
      message: `So sánh 6 Kịch bản kiểm thử thuật toán ${algorithm} hoàn tất`,
      data: result,
    };
  }

  /**
   * So sánh 5 Cấp độ bộ lọc ngưỡng
   * Endpoint: GET /apis/v1/products/benchmark/thresholds?algorithm=B
   */
  @Get('benchmark/thresholds')
  @CacheTTL(0)
  async runThresholdBenchmark(
    @Query('algorithm') algorithm: 'A' | 'B' = 'B',
    @Query('alpha') alpha?: number,
    @Query('normalize') normalize?: string,
  ) {
    const normalizeScore =
      normalize === 'true' || normalize === '1'
        ? true
        : normalize === 'false' || normalize === '0'
          ? false
          : undefined;
    const result = await this.searchBenchmarkService.runThresholdBenchmark(
      algorithm,
      alpha !== undefined ? Number(alpha) : undefined,
      normalizeScore,
    );

    return {
      message: `Đánh giá 5 cấp độ bộ lọc ngưỡng thuật toán ${algorithm} hoàn tất`,
      data: result,
    };
  }

  @Get()
  // @CacheTTL(300000)
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
      data: result.data.map((product) =>
        this.productsService.mapProductToPublicResponse(product),
      ),
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
        validProducts: result.validProducts,
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
        categories: true,
        authors: { avatar: true },
        albums: { media: true },
        bookDetail: true,
        reviews: {
          user: { userDetail: true },
        },
      },
    );

    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm này');

    // Ép sang DTO Chi tiết (Full thông tin)
    return this.productsService.mapProductToPublicResponse(product);
  }

  @Get('id/:id')
  @CacheTTL(600000)
  async findOneById(@Param('id') id: string) {
    const product = await this.productsService.findOneBy(
      { id: id, status: StatusProduct.ACTIVE, isVerified: true },
      {
        categories: true,
        authors: { avatar: true },
        albums: { media: true },
        bookDetail: true,
        reviews: {
          user: { userDetail: true },
        },
      },
    );

    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm này');

    return this.productsService.mapProductToPublicResponse(product);
  }
}
