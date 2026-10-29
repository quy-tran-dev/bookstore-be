import { Entity, Column, OneToOne, JoinColumn, VersionColumn } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Product } from './product.entity';
import { SectionBlock } from '../interfaces/section.interface';

@Entity('book_details')
export class BookDetail extends BaseEntity {
  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string; // Tên hiển thị chi tiết hoặc tiêu đề gốc

  @Column({ type: 'text', nullable: true })
  describe?: string; // Bài viết mô tả chi tiết (giữ nguyên để tương thích ngược)

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

  // Khối nội dung chi tiết theo Section (Block-based: H1/H2/H3, p, image, video, list, style)
  @Column({ type: 'jsonb', nullable: true })
  sections?: SectionBlock[];

  // Quản lý phiên bản để xử lý xung đột sửa đổi (Optimistic Locking)
  @VersionColumn({ default: 1 })
  version?: number;

  // Lưu vết ID người cập nhật gần nhất
  @Column({ type: 'varchar', length: 255, nullable: true })
  lastModifiedBy?: string;

  // Quan hệ 1-1 trỏ về bảng Product chính
  @OneToOne(() => Product, (product) => product.bookDetail, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;
}
