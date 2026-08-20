import { Entity, Column, ManyToMany, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Product } from './product.entity';
import { Media } from '@app/modules/media/entities/media.entity';

@Entity('authors')
export class Author extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name?: string; // Thay cho nameAuthor

  @Column({ type: 'text', nullable: true })
  describe?: string; // Thay cho describeAuthor

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug?: string;

  // Liên kết ngược lại với Product (Không bắt buộc phải có, nhưng tốt cho việc query "Tìm các sách của tác giả A")
  @ManyToMany(() => Product, (product) => product.authors)
  products?: Product[];

  @OneToOne(() => Media, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'avatar_media_id' })
  avatar?: Media;
}
