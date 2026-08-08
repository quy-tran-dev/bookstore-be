import { Entity, Column, ManyToMany } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Product } from './product.entity';

@Entity('authors')
export class Author extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name?: string; // Thay cho nameAuthor

  @Column({ type: 'text', nullable: true })
  describe?: string; // Thay cho describeAuthor

  // Liên kết ngược lại với Product (Không bắt buộc phải có, nhưng tốt cho việc query "Tìm các sách của tác giả A")
  @ManyToMany(() => Product, (product) => product.authors)
  products?: Product[];
}