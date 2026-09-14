import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { JwtAuthGuard } from '@app/common/guards/jwt-auth.guard';
import { RolesGuard } from '@app/common/guards/role.guard';
import { Roles } from '@app/common/decorators/roles.decorator';
import { Role } from '@app/common/enums/role.enum';
import { ReviewsService } from '@app/modules/reviews/reviews.service';
import { CreateReviewDto } from '@app/modules/reviews/dto/create-review.dto';
import { UpdateReviewDto } from '@app/modules/reviews/dto/update-review.dto';
import { QueryPublicReviewDto } from '@app/modules/reviews/dto/public-review.dto';

@Controller('reviews')
@UseInterceptors(CacheInterceptor)
export class PublicReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // 1. Lấy danh sách đánh giá của 1 sản phẩm (Công khai, có cache)
  @Get('product/:productId')
  @CacheTTL(300000)
  findByProduct(
    @Param('productId') productId: string,
    @Query() query: QueryPublicReviewDto,
  ) {
    return this.reviewsService.findPublicReviewsByProduct(productId, query);
  }

  // 2. Lấy thống kê sao của sản phẩm (Công khai, có cache)
  @Get('product/:productId/statistics')
  @CacheTTL(600000)
  getProductStats(@Param('productId') productId: string) {
    return this.reviewsService.getProductReviewStats(productId);
  }

  // 3. Khách hàng xem lịch sử đánh giá của chính mình
  // Lưu ý: Đặt route này trước route param ':id'
  @Get('my-reviews')
  @UseGuards(JwtAuthGuard)
  findMyReviews(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.reviewsService.getMyReviews(req.user?.id, page, limit);
  }

  // 4. Lấy chi tiết 1 đánh giá (Công khai)
  @Get(':id')
  @CacheTTL(300000)
  async findOne(@Param('id') id: string) {
    const review = await this.reviewsService.findOneWithDetails(id);
    return this.reviewsService.mapReviewToPublicResponse(review);
  }

  // 5. Khách hàng tạo đánh giá mới (Cần đăng nhập và role CUSTOMER)
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async create(@Body() dto: CreateReviewDto, @Req() req: any) {
    const review = await this.reviewsService.createReview(dto, req.user?.id);
    return this.reviewsService.mapReviewToPublicResponse(review);
  }

  // 6. Khách hàng sửa đánh giá của chính mình
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @Req() req: any,
  ) {
    const review = await this.reviewsService.updateMyReview(
      id,
      dto,
      req.user?.id,
    );
    return this.reviewsService.mapReviewToPublicResponse(review);
  }

  // 7. Khách hàng xóa đánh giá của chính mình
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async remove(@Param('id') id: string, @Req() req: any) {
    await this.reviewsService.deleteMyReview(id, req.user?.id);
    return { message: 'Đã xóa đánh giá của bạn thành công' };
  }
}
