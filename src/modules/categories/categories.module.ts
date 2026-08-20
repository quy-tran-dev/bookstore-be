// src/modules/categories/categories.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { CategoriesService } from './categories.service';
import { AdminCategoriesController } from '@app/apis/v1/admin/book/admin-categories.controller';
import { PublicCategoriesController } from '@app/apis/v1/public/book/public-categories.controller';
import { Product } from '../products/entities/product.entity';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [TypeOrmModule.forFeature([Category]), ProductsModule],
  controllers: [AdminCategoriesController, PublicCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
