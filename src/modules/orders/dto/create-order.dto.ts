import { IsString, IsNotEmpty, IsArray, ValidateNested, IsOptional, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@app/common/enums/payment-method.enum';

export class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId?: string;

  @Min(1, { message: 'Số lượng phải lớn hơn 0' })
  quantity?: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên người nhận không được để trống' })
  customerName?: string;

  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  customerPhone?: string;

  @IsString()
  @IsNotEmpty({ message: 'Địa chỉ giao hàng không được để trống' })
  shippingAddress?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  noteAdmin?: string;

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsArray()
  @ValidateNested({ each: true })
  @IsNotEmpty({ message: 'Vui lòng chọn ít nhất một sản phẩm' })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];
}