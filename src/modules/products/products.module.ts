import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { BookDetail } from './entities/book-detail.entity';
import { Author } from './entities/author.entity';
import { ProductsService } from './products.service';
import { AuthorsService } from './authors.service';
import { AdminProductsController } from '@app/apis/v1/admin/book/admin-products.controller';
import { AdminAuthorsController } from '@app/apis/v1/admin/book/admin-authors.controller';
@Module({
  imports: [TypeOrmModule.forFeature([Product, BookDetail, Author])],
  controllers: [AdminProductsController, AdminAuthorsController],
  providers: [ProductsService, AuthorsService],
  exports: [ProductsService, AuthorsService],
})
export class ProductsModule {}