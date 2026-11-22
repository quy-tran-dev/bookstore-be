import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { RecommendationsService } from '@app/modules/recommendations/recommendations.service';
import {
  CartComplementaryDto,
  RecommendationQueryDto,
} from '@app/modules/recommendations/dto/recommendation-query.dto';

@Controller('recommendations')
export class PublicRecommendationController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 1. Gợi ý các cuốn sách tương tự thuần ngữ nghĩa AI (Option A: Pure Semantic Similarity via pgvector Cosine Distance <=>)
   * Đường dẫn: GET /apis/v1/recommendations/products/:slugOrId/similar?limit=6&minSimilarity=0.6
   */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('products/:slugOrId/similar')
  async getSimilarBooks(
    @Param('slugOrId') slugOrId: string,
    @Query() query: RecommendationQueryDto,
  ) {
    return this.recommendationsService.getSimilarBooks(
      slugOrId,
      query.limit ?? 6,
      query.minSimilarity ?? 0.6,
    );
  }

  /**
   * 2. Gợi ý sách cá nhân hóa theo hồ sơ độc giả (User Profile Centroid Vector) hoặc Cold-Start Bestseller cho khách mới
   * Đường dẫn: GET /apis/v1/recommendations/personalized?limit=8&minSimilarity=0.6
   */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('personalized')
  async getPersonalizedRecommendations(
    @Query() query: RecommendationQueryDto,
    @Req() req: any,
  ) {
    const currentUserId = this.extractOptionalUserId(req);
    return this.recommendationsService.getPersonalizedRecommendations(
      currentUserId,
      query.limit ?? 8,
      query.minSimilarity ?? 0.6,
    );
  }

  /**
   * 3. Gợi ý sách mua kèm bổ trợ ngữ nghĩa cho danh sách sách đang có trong giỏ hàng (Cart Cross-Selling)
   * Đường dẫn: POST /apis/v1/recommendations/cart-complementary
   */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('cart-complementary')
  async getCartComplementaryBooks(@Body() dto: CartComplementaryDto) {
    return this.recommendationsService.getCartComplementaryBooks(
      dto.productIds,
      dto.limit ?? 6,
      dto.minSimilarity ?? 0.6,
    );
  }

  /**
   * Trích xuất userId không bắt buộc từ Bearer Token hoặc HTTP-Only Cookie (nếu khách đã đăng nhập)
   */
  private extractOptionalUserId(req: any): string | undefined {
    try {
      const authHeader: string | undefined = req?.headers?.authorization;
      const bearerToken =
        authHeader && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : undefined;
      const token = bearerToken || req?.cookies?.accessToken;

      if (!token) return undefined;

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
      });
      return payload?.sub || payload?.id;
    } catch {
      return undefined;
    }
  }
}
