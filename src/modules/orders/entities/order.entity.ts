import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity'; // Đổi đường dẫn base entity theo source của bạn
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { PaymentMethod } from '@app/common/enums/payment-method.enum';
import { PaymentStatus } from '@app/common/enums/payment-status.enum';

@Entity('orders')
export class Order extends BaseEntity {
  // Mã đơn hàng ngẫu nhiên để show cho khách (VD: ORD-260825-1234)
  @Column({ type: 'varchar', length: 50, unique: true })
  code?: string;

  // Khách hàng đặt đơn
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  // --- THÔNG TIN GIAO HÀNG (Snapshot để không phụ thuộc vào Profile User) ---
  @Column({ type: 'varchar', length: 255 })
  customerName?: string;

  @Column({ type: 'varchar', length: 20 })
  customerPhone?: string;

  @Column({ type: 'text' })
  shippingAddress?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ type: 'text', nullable: true })
  noteAdmin?: string;

  // --- TÀI CHÍNH ---
  @Column({ type: 'decimal', default: 0 })
  totalAmount?: number; // Tổng tiền sách

  @Column({ type: 'decimal', default: 0 })
  shippingFee?: number; // Phí vận chuyển

  @Column({ type: 'decimal', default: 0 })
  finalAmount?: number; // Tổng phải thanh toán (totalAmount + shippingFee)

  // --- TRẠNG THÁI ---
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status?: OrderStatus;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.COD })
  paymentMethod?: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus?: PaymentStatus;

  // --- LIÊN KẾT BẢNG CHI TIẾT ---
  // cascade: true giúp insert Order và các OrderItem cùng 1 lúc cực kỳ tiện
  @OneToMany(() => OrderItem, (orderItem) => orderItem.order, { 
    cascade: true, 
    eager: true // Tự load chi tiết khi gọi find Order
  })
  items?: OrderItem[];
}