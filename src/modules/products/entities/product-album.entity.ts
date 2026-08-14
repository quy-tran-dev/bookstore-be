import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Product } from './product.entity';
import { Media } from '../../media/entities/media.entity';

@Entity('product_albums')
export class ProductAlbum extends BaseEntity {
  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder?: number; // 0 = Ẩn, 1 = Main, > 1 = Album Order

  // Nối với Product
  @ManyToOne(() => Product, (product) => product.albums, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  // Nối với bảng Media (Để lấy fileUrl, fileName, altText...)
  @ManyToOne(() => Media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'media_id' })
  media?: Media;
}