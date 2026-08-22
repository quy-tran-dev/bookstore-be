import { Entity, Column, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Product } from './product.entity';

@Entity('book_details')
export class BookDetail extends BaseEntity {
  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string; // Tên hiển thị chi tiết hoặc tiêu đề gốc

  @Column({ type: 'text', nullable: true })
  describe?: string; // Bài viết mô tả chi tiết

  @Column({ type: 'varchar', length: 255, nullable: true })
  publisher?: string; // Nhà xuất bản

  @Column({ type: 'int', nullable: true })
  publishYear?: number; // Năm xuất bản

  @Column({ type: 'varchar', length: 100, nullable: true })
  language?: string; // Ngôn ngữ

  @Column({ type: 'varchar', length: 100, nullable: true })
  format?: string; // Định dạng (Bìa cứng, Bìa mềm...)

  @Column({ type: 'int', nullable: true })
  pageCount?: number; // Số trang

  // Quan hệ 1-1 trỏ về bảng Product chính
  @OneToOne(() => Product, (product) => product.bookDetail, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;
}