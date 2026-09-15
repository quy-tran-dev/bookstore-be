import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@app/common/enums/order-status.enum';
import { PaymentStatus } from '@app/common/enums/payment-status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: 'Trạng thái đơn hàng không hợp lệ' })
  @IsOptional()
  status?: OrderStatus;

  @IsEnum(PaymentStatus, { message: 'Trạng thái thanh toán không hợp lệ' })
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @IsString({ message: 'Ghi chú admin phải là chuỗi' })
  @IsOptional()
  noteAdmin?: string;
}
