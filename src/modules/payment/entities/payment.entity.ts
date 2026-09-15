import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '@app/common/base/base.entity';
import { Order } from '../../orders/entities/order.entity';
import { PaymentMethod } from '@app/common/enums/payment-method.enum';
import { PaymentStatus } from '@app/common/enums/payment-status.enum';

@Entity('payments')
export class Payment extends BaseEntity {
  @ManyToOne(() => Order, (order) => order.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  @Index()
  order!: Order;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount!: number;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.VNPAY,
  })
  method!: PaymentMethod;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  status!: PaymentStatus;

  // Mã giao dịch ghi nhận tại cổng VNPAY (vnp_TransactionNo)
  @Column({ name: 'transaction_no', type: 'varchar', length: 255, nullable: true })
  transactionNo?: string | null;

  // Mã ngân hàng thanh toán (vnp_BankCode: NCB, VCB, etc.)
  @Column({ name: 'bank_code', type: 'varchar', length: 50, nullable: true })
  bankCode?: string | null;

  // Mã giao dịch tại ngân hàng (vnp_BankTranNo)
  @Column({ name: 'bank_tran_no', type: 'varchar', length: 255, nullable: true })
  bankTranNo?: string | null;

  // Loại thẻ / phương thức (vnp_CardType: ATM, QR, etc.)
  @Column({ name: 'card_type', type: 'varchar', length: 50, nullable: true })
  cardType?: string | null;

  // Nội dung thanh toán (vnp_OrderInfo)
  @Column({ name: 'order_info', type: 'varchar', length: 255, nullable: true })
  orderInfo?: string | null;

  // Thời gian thanh toán thành công thực tế (vnp_PayDate)
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  // Mã phản hồi từ cổng thanh toán (vnp_ResponseCode: 00 là thành công)
  @Column({ name: 'response_code', type: 'varchar', length: 50, nullable: true })
  responseCode?: string | null;

  // Lưu trữ toàn bộ payload trả về từ Webhook IPN để đối soát kế toán
  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse?: Record<string, any> | null;
}
