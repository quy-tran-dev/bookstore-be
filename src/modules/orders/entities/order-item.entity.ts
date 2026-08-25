import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Order } from './order.entity';
import { Product } from '../../products/entities/product.entity';

@Entity('order_items')
export class OrderItem extends BaseEntity {
  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  // Liên kết về bảng Product để sau này bấm vào xem lại sách
  @ManyToOne(() => Product, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product?: Product;

  // --- SNAPSHOT DATA (Giữ lại thông tin tại thời điểm mua) ---
  @Column({ type: 'varchar', length: 255 })
  productName?: string;

  @Column({ type: 'int' })
  quantity?: number;

  @Column({ type: 'int' })
  unitPrice?: number; // Giá của 1 quyển lúc đặt mua

  @Column({ type: 'int' })
  totalPrice?: number; // quantity * unitPrice
}