import { Entity, Column, OneToOne, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { BookDetail } from './book-detail.entity';
import { Author } from './author.entity';
import { Category } from '../../categories/entities/category.entity';
import { StatusProduct } from '@app/common/enums/status-product.enum';

@Entity('products')
export class Product extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name?: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug?: string;

  @Column({ type: 'text', nullable: true })
  img?: string; // Ảnh đại diện chính

  @Column({ type: 'text', nullable: true })
  shortDescribe?: string; // Mô tả ngắn để hiển thị ở card sản phẩm

  // Hỗ trợ pgvector (Cần cài extension pgvector trong DB, dimension thường là 768 hoặc 1536 tuỳ model AI)
  @Column({ type: 'vector', length: 768, nullable: true })
  embeddingVector?: string;

  // --- LOGIC GIÁ CẢ ---
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cost?: number; // Giá nhập/Giá vốn

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  price?: number; // Giá bán niêm yết

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  finalPrice?: number; // Giá thực bán (sau khi áp khuyến mãi)

  // --- TRẠNG THÁI ---
  @Column({ type: 'boolean', default: false })
  isVerified?: boolean;

  @Column({ type: 'int', default: StatusProduct.INACTIVE })
  status?: number; // Ví dụ: 0 = Tắt, 1 = Đang bán, 2 = Hết hàng

  @Column({ name: 'stock_quantity', type: 'int', default: 0 })
  stockQuantity?: number; // Số lượng tồn kho hiện tại

  @Column({ name: 'sold_count', type: 'int', default: 0 })
  soldCount?: number; // Tổng số lượng đã bán được

  // =====================================
  // CÁC MỐI QUAN HỆ (RELATIONS)
  // =====================================

  // 1-1 với BookDetail: Cascade Insert/Update giúp tạo Product là tạo luôn BookDetail
  @OneToOne(() => BookDetail, (bookDetail) => bookDetail.product, { cascade: true })
  bookDetail?: BookDetail;

  // n-n với Categories: TypeORM sẽ TỰ ĐỘNG TẠO bảng 'product_categories'
  @ManyToMany(() => Category)
  @JoinTable({
    name: 'product_categories',
    joinColumn: { name: 'product_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  categories?: Category[];

  // n-n với Authors: TypeORM sẽ TỰ ĐỘNG TẠO bảng 'book_authors'
  @ManyToMany(() => Author, (author) => author.products)
  @JoinTable({
    name: 'book_authors',
    joinColumn: { name: 'product_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'author_id', referencedColumnName: 'id' },
  })
  authors?: Author[];
}