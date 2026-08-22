import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { BookDetail } from './entities/book-detail.entity';
import { Author } from './entities/author.entity';
import { ProductsService } from './products.service';
import { AuthorsService } from './authors.service';
import { AdminProductsController } from '@app/apis/v1/admin/book/admin-products.controller';
import { AdminAuthorsController } from '@app/apis/v1/admin/book/admin-authors.controller';
import { MediaModule } from '../media/media.module';
import { AiModule } from '../ai/ai.module';
import { PublicProductsController } from '@app/apis/v1/public/book/public-products.controller';
import { ProductAlbum } from './entities/product-album.entity';
import { Category } from '../categories/entities/category.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      BookDetail,
      Author,
      ProductAlbum,
      Category,
    ]),
    MediaModule,
    AiModule,
  ],
  controllers: [
    AdminProductsController,
    AdminAuthorsController,
    PublicProductsController,
  ],
  providers: [ProductsService, AuthorsService],
  exports: [ProductsService, AuthorsService, TypeOrmModule],
})
export class ProductsModule {}
