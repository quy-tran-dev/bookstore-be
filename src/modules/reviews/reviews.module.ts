import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './entities/review.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { ReviewsService } from './reviews.service';
import { AdminReviewsController } from '@app/apis/v1/admin/reviews/admin-reviews.controller';
import { PublicReviewsController } from '@app/apis/v1/public/reviews/public-reviews.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Review, Product, User, Order]),
  ],
  controllers: [AdminReviewsController, PublicReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService, TypeOrmModule],
})
export class ReviewsModule {}
