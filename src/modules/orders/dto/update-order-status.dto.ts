import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { PaymentStatus } from '@app/common/enums/payment-status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  @IsNotEmpty()
  status?: OrderStatus;

  @IsString()
  @IsOptional()
  noteAdmin?: string;

  // Thêm field này để lúc tích hợp VNPAY/MoMo có thể cập nhật trạng thái thanh toán
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;
}
