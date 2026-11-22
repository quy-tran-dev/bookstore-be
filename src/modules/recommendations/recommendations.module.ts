import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { AiModule } from '../ai/ai.module';
import { RecommendationsService } from './recommendations.service';
import { PublicRecommendationController } from '@app/apis/v1/public/recommendation/public-recommendation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, Order]),
    JwtModule.register({}),
    AiModule,
  ],
  controllers: [PublicRecommendationController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
