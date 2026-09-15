import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateVnpayUrlDto {
  @IsUUID('all', { message: 'ID đơn hàng phải đúng định dạng UUID' })
  @IsNotEmpty({ message: 'ID đơn hàng không được để trống' })
  orderId!: string;

  @IsString()
  @IsOptional()
  bankCode?: string;

  @IsString()
  @IsOptional()
  language?: 'vn' | 'en';
}
