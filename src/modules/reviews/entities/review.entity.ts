import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Product } from '@app/modules/products/entities/product.entity';
import { User } from '@app/modules/users/entities/user.entity';
import { Order } from '@app/modules/orders/entities/order.entity';
import { StatusReview } from '@app/common/enums/status-review.enum';

@Entity('reviews')
export class Review extends BaseEntity {
  @Column({ type: 'int' })
  rating!: number; // 1 đến 5 sao

  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string;

  @Column({ type: 'text' })
  comment!: string;

  @Column({
    type: 'int',
    default: StatusReview.APPROVED,
  })
  status!: StatusReview;

  @Column({ name: 'is_purchased', type: 'boolean', default: false })
  isPurchased!: boolean;

  // Phản hồi từ Admin/Cửa hàng
  @Column({ name: 'admin_reply', type: 'text', nullable: true })
  adminReply?: string | null;

  @Column({ name: 'admin_reply_at', type: 'timestamptz', nullable: true })
  adminReplyAt?: Date | null;

  // Quan hệ với Product
  @ManyToOne(() => Product, (product) => product.reviews, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  @Index()
  product!: Product;

  // Quan hệ với User
  @ManyToOne(() => User, (user) => user.reviews, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  @Index()
  user!: User;

  // Quan hệ với Order (nếu có liên kết đơn hàng)
  @ManyToOne(() => Order, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'order_id' })
  order?: Order | null;
}
