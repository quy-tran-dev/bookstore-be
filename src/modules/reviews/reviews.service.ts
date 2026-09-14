import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, Not, IsNull } from 'typeorm';
import { BaseService } from '@app/common/base/base.service';
import { Review } from './entities/review.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { StatusReview } from '@app/common/enums/status-review.enum';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import {
  AdminReplyReviewDto,
  AdminUpdateReviewDto,
  QueryAdminReviewDto,
} from './dto/admin-review.dto';
import {
  ProductRatingStatsDto,
  PublicReviewResponseDto,
  QueryPublicReviewDto,
} from './dto/public-review.dto';
import { DiscordService } from '../discord/discord.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class ReviewsService extends BaseService<Review> {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly discordService: DiscordService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    super(reviewRepository);
  }

  // --- HÀM HELPER XÓA CACHE LIÊN QUAN ---
  private async clearCache(productId?: string, productSlug?: string) {
    try {
      if (productId && !productSlug) {
        const prod = await this.productRepository.findOne({
          where: { id: productId },
          select: {id:true, slug: true},
          withDeleted: true,
        });
        if (prod?.slug) {
          productSlug = prod.slug;
        }
      }

      const keysToDelete: string[] = [];
      if (productId) {
        keysToDelete.push(`/apis/v1/products/id/${productId}`);
        keysToDelete.push(`/apis/v1/reviews/product/${productId}`);
        keysToDelete.push(`/apis/v1/reviews/product/${productId}/statistics`);
      }
      if (productSlug) {
        keysToDelete.push(`/apis/v1/products/${productSlug}`);
      }
      if (keysToDelete.length > 0) {
        await Promise.all(keysToDelete.map((key) => this.cacheManager.del(key)));
      }

      // Xóa tất cả các key liên quan đến productId hoặc productSlug kể cả query params
      const stores = (this.cacheManager as any)?.stores || [];
      for (const s of stores) {
        if (s.iterator) {
          for await (const [k] of s.iterator()) {
            if (
              (productId && k.includes(productId)) ||
              (productSlug && k.includes(productSlug))
            ) {
              await this.cacheManager.del(k);
            }
          }
        }
      }

      this.logger.log(
        `Đã xóa cache review cho sản phẩm ID: ${productId}, Slug: ${productSlug}`,
      );
    } catch (error) {
      this.logger.error('Lỗi khi xóa cache review:', error);
    }
  }

  // --- TẠO MỚI ĐÁNH GIÁ (CUSTOMER) ---
  async createReview(dto: CreateReviewDto, userId: string): Promise<Review> {
    const product = await this.productRepository.findOne({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { userDetail: true },
    });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    // Kiểm tra xem user đã đánh giá sản phẩm này chưa
    const existing = await this.reviewRepository.findOne({
      where: {
        product: { id: dto.productId },
        user: { id: userId },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Bạn đã đánh giá sản phẩm này rồi. Bạn có thể cập nhật đánh giá của mình.',
      );
    }

    // Kiểm tra lịch sử mua hàng
    let isPurchased = false;
    let linkedOrder: Order | null = null;
    const purchasedOrder = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.items', 'item')
      .where('order.user.id = :userId', { userId })
      .andWhere('item.product.id = :productId', { productId: dto.productId })
      .andWhere('order.status = :completedStatus', {
        completedStatus: OrderStatus.COMPLETED,
      })
      .getOne();

    if (purchasedOrder) {
      isPurchased = true;
      linkedOrder = purchasedOrder;
    } else if (dto.orderId) {
      const order = await this.orderRepository.findOne({
        where: { id: dto.orderId, user: { id: userId } },
      });
      if (order && order.status === OrderStatus.COMPLETED) {
        isPurchased = true;
        linkedOrder = order;
      }
    }

    const review = this.reviewRepository.create({
      product: { id: dto.productId } as Product,
      user: { id: userId } as User,
      order: linkedOrder ? ({ id: linkedOrder.id } as Order) : null,
      rating: dto.rating,
      title: dto.title,
      comment: dto.comment,
      status: StatusReview.APPROVED, // Mặc định hiển thị
      isPurchased,
      createBy: userId,
    });

    const savedReview = await this.reviewRepository.save(review);

    // Xóa cache
    await this.clearCache(product.id, product.slug);

    // Gửi thông báo Discord
    const reviewerName = user.userDetail?.fullName || user.email;
    this.discordService.sendNewUpdate(
      'INFO',
      ` ⭐ **[Đánh giá mới]** Khách hàng **${reviewerName}** vừa đánh giá **${dto.rating} sao** cho sách **${product.name}**: "${dto.comment}"`,
      'ReviewsService',
    );

    return this.findOneWithDetails(savedReview.id);
  }

  // --- LẤY DANH SÁCH REVIEW CHO PUBLIC THEO PRODUCT ---
  async findPublicReviewsByProduct(
    productId: string,
    query: QueryPublicReviewDto,
  ) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 10);
    const skip = (page - 1) * limit;

    const qb = this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.user', 'user')
      .leftJoinAndSelect('user.userDetail', 'userDetail')
      .where('review.product.id = :productId', { productId })
      .andWhere('review.status = :status', { status: StatusReview.APPROVED })
      .andWhere('review.deletedAt IS NULL');

    if (query.rating) {
      qb.andWhere('review.rating = :rating', { rating: query.rating });
    }

    qb.orderBy('review.createdAt', query.sort || 'DESC');
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const stats = await this.getProductReviewStats(productId);

    return {
      data: items.map((item) => this.mapReviewToPublicResponse(item)),
      stats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // --- TÍNH TOÁN THỐNG KÊ SAO CỦA SẢN PHẨM ---
  async getProductReviewStats(productId: string): Promise<ProductRatingStatsDto> {
    const reviews = await this.reviewRepository.find({
      where: {
        product: { id: productId },
        status: StatusReview.APPROVED,
      },
      select: { rating: true },
    });

    const totalReviews = reviews.length;
    if (totalReviews === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      };
    }

    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;

    for (const r of reviews) {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating))));
      breakdown[star as 1 | 2 | 3 | 4 | 5] =
        (breakdown[star as 1 | 2 | 3 | 4 | 5] || 0) + 1;
      sum += Number(r.rating);
    }

    const averageRating = Number((sum / totalReviews).toFixed(1));

    return {
      averageRating,
      totalReviews,
      breakdown,
    };
  }

  // --- LẤY DANH SÁCH REVIEW CỦA TÔI (CUSTOMER) ---
  async getMyReviews(userId: string, page: number = 1, limit: number = 10) {
    page = Math.max(1, page);
    limit = Math.max(1, limit);
    const skip = (page - 1) * limit;

    const [items, total] = await this.reviewRepository.findAndCount({
      where: { user: { id: userId } },
      relations: {
        product: {
          albums: { media: true },
        },
      },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // --- CẬP NHẬT ĐÁNH GIÁ (CUSTOMER) ---
  async updateMyReview(
    reviewId: string,
    dto: UpdateReviewDto,
    userId: string,
  ): Promise<Review> {
    const review = await this.findOneWithDetails(reviewId);
    if (review.user?.id !== userId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa đánh giá này');
    }

    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.title !== undefined) review.title = dto.title;
    if (dto.comment !== undefined) review.comment = dto.comment;
    review.updateBy = userId;

    const saved = await this.reviewRepository.save(review);
    await this.clearCache(review.product?.id, review.product?.slug);

    return saved;
  }

  // --- XÓA ĐÁNH GIÁ (CUSTOMER) ---
  async deleteMyReview(reviewId: string, userId: string): Promise<void> {
    const review = await this.findOneWithDetails(reviewId);
    if (review.user?.id !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa đánh giá này');
    }

    await this.softDelete(reviewId, userId);
    await this.clearCache(review.product?.id, review.product?.slug);
  }

  // --- ADMIN: LẤY TẤT CẢ REVIEW KÈM BỘ LỌC TOÀN DIỆN ---
  async fetchReviewsWithQuery(query: QueryAdminReviewDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, query.limit || 10);
    const skip = (page - 1) * limit;

    const qb = this.reviewRepository
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.product', 'product')
      .leftJoinAndSelect('review.user', 'user')
      .leftJoinAndSelect('user.userDetail', 'userDetail')
      .leftJoinAndSelect('review.order', 'order');

    if (query.keyword) {
      qb.andWhere(
        '(review.comment ILIKE :kw OR review.title ILIKE :kw OR product.name ILIKE :kw OR user.email ILIKE :kw OR userDetail.fullName ILIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    if (query.productId) {
      qb.andWhere('review.product.id = :productId', {
        productId: query.productId,
      });
    }

    if (query.userId) {
      qb.andWhere('review.user.id = :userId', { userId: query.userId });
    }

    if (query.rating) {
      qb.andWhere('review.rating = :rating', { rating: query.rating });
    }

    if (query.status !== undefined) {
      qb.andWhere('review.status = :status', { status: query.status });
    }

    const sortField = query.orderBy ? `review.${query.orderBy}` : 'review.createdAt';
    qb.orderBy(sortField, query.sort || 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // --- ADMIN: XEM CHI TIẾT ĐÁNH GIÁ ---
  async findOneWithDetails(id: string): Promise<Review> {
    const review = await this.reviewRepository.findOne({
      where: { id },
      relations: {
        product: {
          albums: { media: true },
        },
        user: {
          userDetail: true,
        },
        order: true,
      },
    });
    if (!review) {
      throw new NotFoundException('Đánh giá không tồn tại');
    }
    return review;
  }

  // --- ADMIN: CẬP NHẬT TRẠNG THÁI DUYỆT ---
  async updateStatus(
    id: string,
    status: StatusReview,
    adminId?: string,
  ): Promise<Review> {
    const review = await this.findOneWithDetails(id);
    review.status = status;
    review.updateBy = adminId;

    const saved = await this.reviewRepository.save(review);
    await this.clearCache(review.product?.id, review.product?.slug);

    return saved;
  }

  // --- ADMIN: PHẢN HỒI ĐÁNH GIÁ ---
  async adminReply(
    id: string,
    dto: AdminReplyReviewDto,
    adminId?: string,
  ): Promise<Review> {
    const review = await this.findOneWithDetails(id);
    review.adminReply = dto.adminReply;
    review.adminReplyAt = new Date();
    review.updateBy = adminId;

    const saved = await this.reviewRepository.save(review);
    await this.clearCache(review.product?.id, review.product?.slug);

    return saved;
  }

  // --- ADMIN: CẬP NHẬT ĐÁNH GIÁ ---
  async adminUpdate(
    id: string,
    dto: AdminUpdateReviewDto,
    adminId?: string,
  ): Promise<Review> {
    const review = await this.findOneWithDetails(id);

    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.title !== undefined) review.title = dto.title;
    if (dto.comment !== undefined) review.comment = dto.comment;
    if (dto.status !== undefined) review.status = dto.status;
    if (dto.adminReply !== undefined) {
      review.adminReply = dto.adminReply;
      review.adminReplyAt = new Date();
    }
    review.updateBy = adminId;

    const saved = await this.reviewRepository.save(review);
    await this.clearCache(review.product?.id, review.product?.slug);

    return saved;
  }

  // --- ADMIN: THÙNG RÁC / SOFT DELETED ---
  async getSoftDeletedReviews(
    page: number = 1,
    limit: number = 10,
    keyword?: string,
  ) {
    page = Math.max(1, page);
    limit = Math.max(1, limit);
    const skip = (page - 1) * limit;

    const qb = this.reviewRepository
      .createQueryBuilder('review')
      .withDeleted()
      .leftJoinAndSelect('review.product', 'product')
      .leftJoinAndSelect('review.user', 'user')
      .leftJoinAndSelect('user.userDetail', 'userDetail')
      .where('review.deletedAt IS NOT NULL');

    if (keyword) {
      qb.andWhere(
        '(review.comment ILIKE :kw OR review.title ILIKE :kw OR product.name ILIKE :kw)',
        { kw: `%${keyword}%` },
      );
    }

    qb.orderBy('review.deletedAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // --- OVERRIDE SOFT DELETE ĐỂ XÓA CACHE SẢN PHẨM & REVIEW ---
  override async softDelete(id: string, currentUserId?: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id },
      relations: { product: true },
      withDeleted: true,
    });

    await super.softDelete(id, currentUserId);

    if (review?.product) {
      await this.clearCache(review.product.id, review.product.slug);
    }
  }

  // --- OVERRIDE RESTORE ĐỂ XÓA CACHE SẢN PHẨM & REVIEW ---
  override async restore(id: string, currentUserId?: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id },
      relations: { product: true },
      withDeleted: true,
    });

    await super.restore(id, currentUserId);

    if (review?.product) {
      await this.clearCache(review.product.id, review.product.slug);
    }
  }

  // --- ADMIN: XÓA VĨNH VIỄN ---
  async hardDelete(id: string): Promise<void> {
    const review = await this.reviewRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: { product: true },
    });
    if (!review) {
      throw new NotFoundException('Đánh giá không tồn tại');
    }

    await this.reviewRepository.remove(review);
    await this.clearCache(review.product?.id, review.product?.slug);
  }

  // --- MAPPER CHUẨN HÓA PUBLIC RESPONSE ---
  public mapReviewToPublicResponse(review: Review): PublicReviewResponseDto {
    return {
      id: review.id,
      rating: review.rating,
      title: review.title || null,
      comment: review.comment,
      isPurchased: review.isPurchased,
      adminReply: review.adminReply || null,
      adminReplyAt: review.adminReplyAt || null,
      createdAt: review.createdAt,
      user: {
        id: review.user?.id,
        fullName:
          review.user?.userDetail?.fullName ||
          (review.user?.email ? review.user.email.split('@')[0] : 'Khách hàng'),
        avatarUrl: review.user?.userDetail?.avatarUrl || null,
      },
    };
  }
}
